import { type DB, base64url, equal, fail, now } from "./core";

export type InstagramEnv = {
  DB: DB;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_CONFIG_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_TOKEN_KEY?: string;
  INSTAGRAM_MEDIA_KEY?: string;
  INSTAGRAM_OWNER_ID?: string;
  INSTAGRAM_API_VERSION?: string;
  INSTAGRAM_ORIGIN?: string;
  INSTAGRAM_ENABLED?: string;
};
export type Connection = {
  user_id: string;
  id: string;
  account_id: string;
  username: string;
  token: string;
  expires: number;
  refreshed: number;
  reconnect: number;
  auth_method: string;
  client_business_id: string | null;
  config_id: string | null;
};
export type Job = {
  id: string;
  user_id: string;
  project_id: string;
  revision: number;
  connection_id: string;
  account_id: string;
  username: string;
  snapshot: string;
  caption: string;
  request_key: string;
  status: string;
  parent_id: string | null;
  media_id: string | null;
  permalink: string | null;
  error: string | null;
  lease: string | null;
  lease_until: number;
  created: number;
  updated: number;
  expires: number;
};
export type Upload = {
  position: number;
  upload_id: string;
  container_id: string | null;
  ready: number;
};
export const origin = (env: InstagramEnv) =>
  env.INSTAGRAM_ORIGIN || "https://carousel.hengker.tech";
export const authMethod = (env: InstagramEnv) =>
  env.INSTAGRAM_CONFIG_ID ? "unified_login" : "instagram_login";
export const connectionExpired = (c: Connection) =>
  c.expires !== 0 && c.expires <= now();
export function configured(env: InstagramEnv) {
  return Boolean(
    env.INSTAGRAM_ENABLED === "true" &&
      env.INSTAGRAM_APP_ID &&
      env.INSTAGRAM_APP_SECRET &&
      env.INSTAGRAM_TOKEN_KEY &&
      env.INSTAGRAM_MEDIA_KEY &&
      env.INSTAGRAM_OWNER_ID &&
      /^v\d+\.\d+$/.test(env.INSTAGRAM_API_VERSION || ""),
  );
}
export function available(env: InstagramEnv, owner: string) {
  if (owner !== env.INSTAGRAM_OWNER_ID)
    fail(403, "Instagram belum tersedia untuk akun ini.");
  if (!configured(env))
    fail(
      503,
      "Instagram belum dikonfigurasi. Lengkapi pengaturan server terlebih dahulu.",
    );
}
function bytes(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
async function encryptionKey(secret: string) {
  const raw = bytes(secret);
  if (raw.length !== 32)
    throw Error("INSTAGRAM_TOKEN_KEY must encode 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptToken(
  token: string,
  secret: string,
  owner: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    await encryptionKey(secret),
    new TextEncoder().encode(token),
  );
  return `${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function decryptToken(
  token: string,
  secret: string,
  owner: string,
) {
  const [iv, data] = token.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(iv),
        additionalData: new TextEncoder().encode(owner),
      },
      await encryptionKey(secret),
      bytes(data),
    ),
  );
}
async function signature(env: InstagramEnv, path: string, expires: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.INSTAGRAM_MEDIA_KEY!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${path}\n${expires}`),
      ),
    ),
  );
}
export async function mediaURL(env: InstagramEnv, job: Job, position: number) {
  const path = `/api/instagram/media/${job.id}/${position}`;
  return `${origin(env)}${path}?expires=${job.expires}&signature=${await signature(env, path, job.expires)}`;
}
export async function validSignature(env: InstagramEnv, url: URL) {
  const expires = Number(url.searchParams.get("expires"));
  return (
    !!env.INSTAGRAM_MEDIA_KEY &&
    Number.isSafeInteger(expires) &&
    expires > now() &&
    equal(
      url.searchParams.get("signature") || "",
      await signature(env, url.pathname, expires),
    )
  );
}
export class MetaError extends Error {
  constructor(
    public code: number,
    public transient: boolean,
  ) {
    super(
      code === 190
        ? "Izin Instagram kedaluwarsa. Hubungkan ulang akun di Pengaturan."
        : code === 4 || code === 32 || code === 613
          ? "Batas permintaan Instagram tercapai. Coba lagi nanti."
          : "Instagram menolak permintaan. Periksa koneksi, izin publikasi, dan batas posting akun.",
    );
  }
}
// Never include response bodies, URLs containing tokens, or provider errors in logs.
export async function metaRequest<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MetaError(0, true);
  }
  let value: T & { error?: { code?: number; is_transient?: boolean } };
  try {
    value = (await response.json()) as typeof value;
  } catch {
    throw new MetaError(0, true);
  }
  if (!response.ok || value.error)
    throw new MetaError(
      value.error?.code || response.status,
      response.status >= 500 ||
        response.status === 429 ||
        !!value.error?.is_transient,
    );
  return value;
}
export async function graph<T>(
  env: InstagramEnv,
  token: string,
  path: string,
  params: Record<string, string> = {},
  post = false,
) {
  const url = new URL(
    `https://${env.INSTAGRAM_CONFIG_ID ? "graph.facebook.com" : "graph.instagram.com"}/${env.INSTAGRAM_API_VERSION}/${path}`,
  );
  if (!post)
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
  return metaRequest<T>(url.href, {
    method: post ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(post ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(post ? { body: new URLSearchParams(params) } : {}),
  });
}
export const connection = async (env: InstagramEnv, owner: string) => {
  const c = await env.DB.prepare("SELECT * FROM instagram_connections WHERE user_id=?")
    .bind(owner)
    .first<Connection>();
  if (c && (c.auth_method !== authMethod(env) ||
      (env.INSTAGRAM_CONFIG_ID && c.config_id !== env.INSTAGRAM_CONFIG_ID)))
    c.reconnect = 1;
  return c;
};
export const uploads = async (env: InstagramEnv, id: string) =>
  (
    await env.DB.prepare(
      "SELECT position,upload_id,container_id,ready FROM instagram_slides WHERE job_id=? ORDER BY position",
    )
      .bind(id)
      .all<Upload>()
  ).results;
export function publicJob(job: Job, slides: Upload[]) {
  return {
    id: job.id,
    status: job.status,
    username: job.username,
    caption: job.caption,
    uploaded: slides.length,
    ready: slides.filter((s) => s.ready).length,
    total: JSON.parse(job.snapshot).slides.length as number,
    permalink: job.permalink,
    error: job.error,
    created: job.created,
    expires: job.expires,
  };
}
