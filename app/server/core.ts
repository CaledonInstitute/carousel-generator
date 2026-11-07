import type { D1Database } from "@cloudflare/workers-types";
export type DB = D1Database;
export const ORIGIN = "https://carousel.hengker.tech";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
export const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export async function guarded(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Server gagal memproses permintaan. Coba lagi.",
      },
      e instanceof HttpError ? e.status : 500,
    );
  }
}
export async function readBody(
  req: Request,
  limit = 256 * 1024,
): Promise<string> {
  if (Number(req.headers.get("content-length")) > limit)
    fail(413, "Permintaan terlalu besar.");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      fail(413, "Permintaan terlalu besar.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function body(req: Request): Promise<any> {
  try {
    const value = JSON.parse(await readBody(req));
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "Data harus berupa objek JSON.");
    return value;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail(400, "Data JSON tidak valid.");
  }
}
export function csrf(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== new URL(req.url).origin)
    fail(403, "Asal permintaan tidak diizinkan.");
}
export const now = () => Date.now();
export const random = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return base64url(b);
};
export function base64url(b: Uint8Array) {
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function hash(value: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
        },
        key,
        256,
      ),
    ),
  );
}
export function equal(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
export async function rateLimit(
  db: DB,
  key: string,
  limit: number,
  seconds = 900,
) {
  const time = now();
  const row = await db
    .prepare(
      "INSERT INTO rate_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires <= ? THEN 1 ELSE count+1 END, expires=CASE WHEN expires <= ? THEN excluded.expires ELSE expires END RETURNING count",
    )
    .bind(key, time + seconds * 1000, time, time)
    .first<{ count: number }>();
  if (row!.count > limit)
    fail(429, "Terlalu banyak percobaan. Coba lagi nanti.");
}
export async function sessionUser(db: DB, req: Request) {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("rs_session="))
    ?.slice(11);
  if (!cookie) return null;
  return db
    .prepare(
      "SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?",
    )
    .bind(await hash(cookie), now())
    .first<{ id: string; username: string }>();
}
export async function requireUser(db: DB, req: Request) {
  return (
    (await sessionUser(db, req)) ??
    fail(401, "Silakan masuk untuk melanjutkan.")
  );
}
export async function bearerUser(db: DB, req: Request) {
  const value = req.headers.get("authorization");
  if (!value?.startsWith("Bearer "))
    return fail(401, "Token agent diperlukan.");
  const row = await db
    .prepare(
      "SELECT tokens.user_id FROM tokens LEFT JOIN grants ON grants.id=tokens.grant_id WHERE tokens.hash=? AND tokens.expires>? AND tokens.kind IN ('personal','access') AND (tokens.grant_id IS NULL OR grants.revoked=0)",
    )
    .bind(await hash(value.slice(7)), now())
    .first<{ user_id: string }>();
  return row?.user_id ?? fail(401, "Token tidak valid atau kedaluwarsa.");
}
export const sessionCookie = (token: string, expires: number) =>
  `rs_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expires}`;
