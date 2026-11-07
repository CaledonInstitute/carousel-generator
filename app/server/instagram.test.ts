import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { apiHandler } from "./api";
import { newProject, newSlide, type Project } from "../model";
import { hash, now, type DB } from "./core";
import { instagramHandler } from "./instagram";
import { cleanExpiredMedia } from "./instagram-media";
import { advanceJob, refreshConnections } from "./instagram-publishing";
import {
  connection,
  decryptToken,
  encryptToken,
  mediaURL,
  validSignature,
  type InstagramEnv,
  type Job,
} from "./instagram-common";

let mf: Miniflare,
  env: InstagramEnv,
  cookie: string,
  otherCookie: string,
  project: Project;
const key = Buffer.alloc(32, 42).toString("base64url");
const base = "https://carousel.hengker.tech";
const realFetch = globalThis.fetch;
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
async function call(
  path: string,
  method = "GET",
  value?: unknown,
  session = cookie,
  overrides: Partial<InstagramEnv> = {},
) {
  return instagramHandler(
    { ...env, ...overrides },
    new Request(`${base}${path}`, {
      method,
      headers: {
        Cookie: session,
        Origin: base,
        "Content-Type": "application/json",
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    }),
  );
}
async function createJob(p = project, caption = "Caption #uji") {
  const result = await call(`/api/projects/${p.id}/instagram/jobs`, "POST", {
    key: crypto.randomUUID(),
    revision: p.revision,
    caption,
  });
  assert.equal(result.status, 201, await result.clone().text());
  return (await result.json()) as {
    id: string;
    status: string;
    project: Project;
  };
}
const jobRow = (id: string) =>
  env.DB.prepare("SELECT * FROM instagram_jobs WHERE id=?")
    .bind(id)
    .first<Job>();
async function connectFixture() {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO instagram_connections(user_id,id,account_id,username,token,expires,refreshed,reconnect) VALUES (?,?,?,?,?,?,?,0)",
  )
    .bind(
      env.INSTAGRAM_OWNER_ID,
      "connection-test",
      "ig-account",
      "tester",
      await encryptToken("private-token", key, env.INSTAGRAM_OWNER_ID!),
      now() + 60 * 86400000,
      now(),
    )
    .run();
}
// Minimal JPEG SOF header for metadata validation (no browser decoder is involved here).
const jpeg = Uint8Array.from([
  255, 216, 255, 224, 0, 2, 255, 192, 0, 17, 8, 5, 70, 4, 56, 3, 1, 17, 0, 2,
  17, 0, 3, 17, 0, 255, 217,
]);
async function upload(id: string, index: number, bytes = jpeg) {
  return instagramHandler(
    env,
    new Request(`${base}/api/instagram/jobs/${id}/upload/${index}`, {
      method: "PUT",
      headers: { Cookie: cookie, Origin: base, "Content-Type": "image/jpeg" },
      body: bytes,
    }),
  );
}
async function readyJob() {
  await connectFixture();
  const j = await createJob();
  for (let i = 0; i < 5; i++) assert.equal((await upload(j.id, i)).status, 200);
  assert.equal(
    (await call(`/api/instagram/jobs/${j.id}/publish`, "POST")).status,
    202,
  );
  return j.id;
}
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "instagram-test",
          modules: true,
          script: "export default {fetch(){return new Response('ok')}}",
          compatibilityDate: "2026-11-07",
          d1Databases: { DB: "instagram-test" },
        },
      ],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as DB;
  for (const file of [
    "0001_initial.sql",
    "0002_instagram.sql",
    "0003_instagram_d1_media.sql",
    "0004_instagram_unified_login.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../migrations/${file}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.prepare(statement).run();
  }
  const register = async (username: string) => {
    const r = await apiHandler(
      db,
      new Request(`${base}/api/auth/register`, {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "instagram-test-password" }),
      }),
    );
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  cookie = await register("ig-owner");
  otherCookie = await register("ig-other");
  const owner = (await db
    .prepare("SELECT id FROM users WHERE username='ig-owner'")
    .first<{ id: string }>())!.id;
  env = {
    DB: db,
    INSTAGRAM_ENABLED: "true",
    INSTAGRAM_OWNER_ID: owner,
    INSTAGRAM_APP_ID: "app-id",
    INSTAGRAM_APP_SECRET: "app-secret",
    INSTAGRAM_API_VERSION: "v26.0",
    INSTAGRAM_TOKEN_KEY: key,
    INSTAGRAM_MEDIA_KEY: "signature-key",
  };
  const created = await apiHandler(
    db,
    new Request(`${base}/api/projects`, {
      method: "POST",
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newProject()),
    }),
  );
  assert.equal(created.status, 201);
  project = (await created.json()) as Project;
  await connectFixture();
});
after(async () => {
  globalThis.fetch = realFetch;
  await mf?.dispose();
});

test("Instagram is gated, requires session/CSRF, and doesn't expose tokens", async () => {
  assert.equal(
    (await call("/api/instagram/connection", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (await call("/api/instagram/connect", "POST", undefined, otherCookie))
      .status,
    403,
  );
  const disabled = await call(
    "/api/instagram/connection",
    "GET",
    undefined,
    cookie,
    { INSTAGRAM_ENABLED: "false" },
  );
  assert.deepEqual(await disabled.json(), { configured: false, allowed: true });
  const csrf = await instagramHandler(
    env,
    new Request(`${base}/api/instagram/connect`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.test" },
    }),
  );
  assert.equal(csrf.status, 403);
  const status = await (await call("/api/instagram/connection")).text();
  assert.ok(
    !status.includes("private-token") &&
      !status.includes("app-secret") &&
      !status.includes('"token"'),
  );
  const stored = (await connection(env, env.INSTAGRAM_OWNER_ID!))!.token;
  assert.notEqual(stored, "private-token");
  assert.equal(
    await decryptToken(stored, key, env.INSTAGRAM_OWNER_ID!),
    "private-token",
  );
  await assert.rejects(decryptToken(stored, key, "someone-else"));
});

test("Instagram OAuth state is session-bound, expiring, single-use, and handles denied permissions", async () => {
  const start = async () =>
    new URL(
      (
        (await (await call("/api/instagram/connect", "POST")).json()) as {
          url: string;
        }
      ).url,
    ).searchParams.get("state")!;
  let state = await start();
  const secondSession = "rs_session=another-owner-session";
  await env.DB.prepare(
    "INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)",
  )
    .bind(
      await hash("another-owner-session"),
      env.INSTAGRAM_OWNER_ID,
      now() + 60000,
    )
    .run();
  assert.equal(
    (
      await call(
        `/api/instagram/callback?state=${state}&error=access_denied`,
        "GET",
        undefined,
        secondSession,
      )
    ).status,
    400,
  );
  const denied = await call(
    `/api/instagram/callback?state=${state}&error=access_denied`,
  );
  assert.equal(denied.status, 303);
  assert.match(denied.headers.get("location")!, /instagram=denied/);
  assert.equal(
    (await call(`/api/instagram/callback?state=${state}&code=foo`)).status,
    400,
  );
  state = await start();
  await env.DB.prepare("UPDATE instagram_states SET expires=0").run();
  assert.equal(
    (await call(`/api/instagram/callback?state=${state}&code=foo`)).status,
    400,
  );
  state = await start();
  globalThis.fetch = async () =>
    response({
      access_token: "short",
      user_id: "123",
      permissions: ["instagram_business_basic"],
    });
  const noPermission = await call(
    `/api/instagram/callback?state=${state}&code=foo`,
  );
  assert.match(noPermission.headers.get("location")!, /instagram=permissions/);
  state = await start();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.instagram.com"))
      return response({
        data: [
          {
            access_token: "short",
            user_id: "123",
            permissions:
              "instagram_business_basic,instagram_business_content_publish",
          },
        ],
      });
    if (url.includes("/access_token?"))
      return response({
        access_token: "long-lived-private",
        expires_in: 5184000,
      });
    return response({ user_id: "ig-account", username: "tester" });
  };
  const success = await call(`/api/instagram/callback?state=${state}&code=foo`);
  assert.match(success.headers.get("location")!, /instagram=connected/);
  const c = (await connection(env, env.INSTAGRAM_OWNER_ID!))!;
  assert.equal(
    await decryptToken(c.token, key, c.user_id),
    "long-lived-private",
  );
  globalThis.fetch = realFetch;
  await connectFixture();
});

test("Unified Login uses config ID, validates grants, selects one shared account and publishes with non-expiring system tokens", async () => {
  env.INSTAGRAM_CONFIG_ID = "config-id";
  let accounts = [{ id: "unified-account", username: "unified_tester" }];
  let scopes = ["instagram_basic", "instagram_content_publish"];
  let invalidToken = false;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(url.hostname, "graph.facebook.com");
    if (url.pathname.endsWith("/oauth/access_token")) {
      assert.equal(url.searchParams.get("client_id"), "app-id");
      assert.equal(
        url.searchParams.get("redirect_uri"),
        `${base}/api/instagram/callback`,
      );
      return response({ access_token: "unified-private" });
    }
    if (url.pathname.endsWith("/debug_token"))
      return response({
        data: { is_valid: true, app_id: "app-id", scopes, expires_at: 0 },
      });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer unified-private",
    );
    if (url.pathname.endsWith("/me/assigned_instagram_accounts"))
      return response({ data: accounts });
    if (url.pathname.endsWith("/me"))
      return response({ client_business_id: "portfolio-id" });
    if (url.pathname.endsWith("/unified-account/media"))
      return invalidToken
        ? response({ error: { code: 190 } }, 400)
        : response({ id: "unified-child" });
    assert.fail(`Unexpected API path ${url.pathname}`);
  };
  const callback = async () => {
    const started = (await (
      await call("/api/instagram/connect", "POST")
    ).json()) as { url: string };
    const login = new URL(started.url);
    assert.equal(
      login.origin + login.pathname,
      "https://www.facebook.com/dialog/oauth",
    );
    assert.equal(login.searchParams.get("config_id"), "config-id");
    assert.equal(login.searchParams.get("client_id"), "app-id");
    assert.equal(login.searchParams.has("scope"), false);
    return call(
      `/api/instagram/callback?state=${login.searchParams.get("state")}&code=unified-code`,
    );
  };
  try {
    assert.equal(
      (await connection(env, env.INSTAGRAM_OWNER_ID!))!.reconnect,
      1,
    );
    scopes = ["instagram_basic"];
    assert.match(
      (await callback()).headers.get("location")!,
      /instagram=permissions/,
    );
    scopes.push("instagram_content_publish");
    accounts.push({ id: "second-account", username: "second" });
    assert.match(
      (await callback()).headers.get("location")!,
      /instagram=accounts/,
    );
    accounts = accounts.slice(0, 1);
    assert.match(
      (await callback()).headers.get("location")!,
      /instagram=connected/,
    );
    const c = (await connection(env, env.INSTAGRAM_OWNER_ID!))!;
    assert.equal(c.account_id, "unified-account");
    assert.equal(c.client_business_id, "portfolio-id");
    assert.equal(c.config_id, "config-id");
    assert.equal(c.auth_method, "unified_login");
    assert.equal(c.expires, 0);
    assert.equal(
      await decryptToken(c.token, key, c.user_id),
      "unified-private",
    );
    const beforeRefresh = calls.length;
    await refreshConnections(env);
    assert.equal(calls.length, beforeRefresh);
    const status = (await (await call("/api/instagram/connection")).json()) as {
      reconnect: boolean;
    };
    assert.equal(status.reconnect, false);
    const j = await createJob();
    for (let i = 0; i < 5; i++)
      assert.equal((await upload(j.id, i)).status, 200);
    assert.equal(
      (await call(`/api/instagram/jobs/${j.id}/publish`, "POST")).status,
      202,
    );
    assert.equal(await advanceJob(env, j.id), true);
    assert.ok(calls.includes("/v26.0/unified-account/media"));
    invalidToken = true;
    await advanceJob(env, j.id);
    assert.equal(
      (await connection(env, env.INSTAGRAM_OWNER_ID!))!.reconnect,
      1,
    );
  } finally {
    delete env.INSTAGRAM_CONFIG_ID;
    globalThis.fetch = realFetch;
    await connectFixture();
  }
});

test("Instagram jobs validate caption, slide count, revisions, ownership and idempotent snapshots", async () => {
  const route = `/api/projects/${project.id}/instagram/jobs`;
  const input = {
    key: crypto.randomUUID(),
    revision: project.revision,
    caption: "awal",
  };
  assert.equal(
    (await call(route, "POST", { ...input, revision: 999 })).status,
    409,
  );
  assert.equal(
    (await call(route, "POST", { ...input, caption: "a".repeat(2201) })).status,
    400,
  );
  assert.equal((await call(route, "POST", input, otherCookie)).status, 403);
  const first = (await (await call(route, "POST", input)).json()) as {
    id: string;
    project: Project;
  };
  const repeat = (await (await call(route, "POST", input)).json()) as {
    id: string;
  };
  assert.equal(first.id, repeat.id);
  assert.equal(
    (await call(route, "POST", { ...input, caption: "berbeda" })).status,
    409,
  );
  for (const count of [10, 11, 20]) {
    const p = newProject();
    p.slides = Array.from({ length: count }, () => newSlide());
    const created = await apiHandler(
      env.DB,
      new Request(`${base}/api/projects`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: base,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(p),
      }),
    );
    const saved = (await created.json()) as Project;
    const res = await call(`/api/projects/${saved.id}/instagram/jobs`, "POST", {
      key: crypto.randomUUID(),
      revision: saved.revision,
    });
    assert.equal(res.status, 201, await res.clone().text());
  }
  assert.deepEqual(
    JSON.parse((await jobRow(first.id))!.snapshot),
    first.project,
  );
});

test("JPEG upload bounds, signed private media, complete order, and immutable published inputs", async () => {
  const job = await createJob();
  assert.equal((await upload(job.id, 5)).status, 400);
  assert.equal(
    (await upload(job.id, 0, Uint8Array.from([1, 2, 3]))).status,
    400,
  );
  assert.equal(
    (await upload(job.id, 0, new Uint8Array(8 * 1024 * 1024 + 1))).status,
    413,
  );
  assert.equal(
    (await call(`/api/instagram/jobs/${job.id}/publish`, "POST")).status,
    409,
  );
  for (let i = 0; i < 5; i++)
    assert.equal((await upload(job.id, i)).status, 200);
  const signed = new URL(await mediaURL(env, (await jobRow(job.id))!, 0));
  assert.ok(await validSignature(env, signed));
  const image = await instagramHandler(env, new Request(signed));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), jpeg);
  const tampered = new URL(signed);
  tampered.pathname = tampered.pathname.replace(/0$/, "1");
  assert.equal(
    (await instagramHandler(env, new Request(tampered))).status,
    404,
  );
  const expired = new URL(signed);
  expired.searchParams.set("expires", "1");
  assert.ok(!(await validSignature(env, expired)));
  await call(`/api/instagram/jobs/${job.id}/publish`, "POST");
  await call(`/api/instagram/jobs/${job.id}/publish`, "POST");
  assert.equal((await jobRow(job.id))!.status, "queued");
  assert.equal((await upload(job.id, 0)).status, 409);
});

test("upload dimensions follow each immutable snapshot, including legacy square snapshots", async () => {
  const portrait = await createJob();
  const squareJPEG = jpeg.slice();
  squareJPEG[11] = 4;
  squareJPEG[12] = 56;
  assert.equal((await upload(portrait.id, 0, squareJPEG)).status, 400);
  assert.equal((await upload(portrait.id, 0, jpeg)).status, 200);
  const legacy = {
    ...project,
    version: 2,
    slides: project.slides.map((s) => ({
      ...s,
      title: "Lama",
      body: "Isi",
      secondary: "",
      layout: "sampul",
    })),
  } as any;
  delete legacy.format;
  const old = await createJob();
  await env.DB.prepare("UPDATE instagram_jobs SET snapshot=? WHERE id=?")
    .bind(JSON.stringify(legacy), old.id)
    .run();
  assert.equal((await upload(old.id, 0, jpeg)).status, 400);
  assert.equal((await upload(old.id, 0, squareJPEG)).status, 200);
});

test("D1 media chunks preserve large JPEGs, replace atomically, and expire without another service", async () => {
  const job = await createJob();
  const bytes = new Uint8Array(700000).fill(73);
  bytes.set(jpeg);
  assert.equal((await upload(job.id, 0, bytes)).status, 200);
  const url = await mediaURL(env, (await jobRow(job.id))!, 0);
  const result = await instagramHandler(env, new Request(url));
  assert.equal(result.status, 200);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  const chunks = async () =>
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM instagram_media_chunks WHERE upload_id IN (SELECT upload_id FROM instagram_slides WHERE job_id=?)",
    )
      .bind(job.id)
      .first<{ n: number }>())!.n;
  assert.equal(await chunks(), 3);
  const old = (await env.DB.prepare(
    "SELECT upload_id FROM instagram_slides WHERE job_id=?",
  )
    .bind(job.id)
    .first<{ upload_id: string }>())!.upload_id;
  assert.equal((await upload(job.id, 0)).status, 200);
  assert.equal(await chunks(), 1);
  assert.equal(
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM instagram_media_chunks WHERE upload_id=?",
    )
      .bind(old)
      .first<{ n: number }>())!.n,
    0,
  );
  await env.DB.prepare(
    "UPDATE instagram_media_chunks SET expires=0 WHERE upload_id IN (SELECT upload_id FROM instagram_slides WHERE job_id=?)",
  )
    .bind(job.id)
    .run();
  assert.equal((await instagramHandler(env, new Request(url))).status, 404);
  await cleanExpiredMedia(env);
  assert.equal(await chunks(), 0);
});

test("request-driven publishing advances in slide order and duplicates never republish a completed job", async () => {
  const id = await readyJob();
  let publish = 0,
    child = 0;
  const children: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)),
      data = new URLSearchParams(String(init?.body || ""));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer private-token",
    );
    if (url.pathname.endsWith("/media_publish")) {
      publish++;
      return response({ id: "published-id" });
    }
    if (url.pathname.endsWith("/media") && init?.method === "POST") {
      if (data.get("media_type") === "CAROUSEL") {
        assert.equal(data.get("children"), children.join(","));
        return response({ id: "parent" });
      }
      const image = new URL(data.get("image_url")!);
      assert.ok(image.pathname.endsWith(`/${child}`));
      children.push(`child-${child++}`);
      return response({ id: children.at(-1) });
    }
    if (url.pathname.endsWith("/published-id"))
      return response({ permalink: "https://www.instagram.com/p/example/" });
    return response({ status_code: "FINISHED" });
  };
  for (let i = 0; i < 14 && (await jobRow(id))!.status !== "published"; i++)
    await advanceJob(env, id);
  assert.equal((await jobRow(id))!.status, "published");
  assert.equal(publish, 1);
  assert.equal(child, 5);
  assert.equal(
    (await jobRow(id))!.permalink,
    "https://www.instagram.com/p/example/",
  );
  await Promise.all([advanceJob(env, id), advanceJob(env, id)]);
  assert.equal(publish, 1);
  globalThis.fetch = realFetch;
});

test("timeout after media_publish verifies status instead of ever publishing twice", async () => {
  const id = await readyJob();
  await env.DB.prepare(
    "UPDATE instagram_slides SET ready=1,container_id='child' WHERE job_id=?",
  )
    .bind(id)
    .run();
  await env.DB.prepare(
    "UPDATE instagram_jobs SET parent_id='parent' WHERE id=?",
  )
    .bind(id)
    .run();
  let publish = 0,
    state = "FINISHED";
  globalThis.fetch = async (input) => {
    if (String(input).includes("media_publish")) {
      publish++;
      throw Error("network interruption");
    }
    return response({ status_code: state });
  };
  assert.equal(await advanceJob(env, id), true);
  assert.equal((await jobRow(id))!.status, "verifying");
  await advanceJob(env, id);
  await advanceJob(env, id);
  assert.equal(publish, 1);
  state = "PUBLISHED";
  await advanceJob(env, id);
  assert.equal((await jobRow(id))!.status, "published");
  assert.equal(publish, 1);
  globalThis.fetch = realFetch;
});

test("leases serialize advance requests and reopening preserves resumable jobs", async () => {
  const id = await readyJob();
  await env.DB.prepare(
    "UPDATE instagram_jobs SET lease='other',lease_until=? WHERE id=?",
  )
    .bind(now() + 60000, id)
    .run();
  globalThis.fetch = async () => {
    throw Error("should not call Meta while leased");
  };
  assert.equal(await advanceJob(env, id), false);
  await env.DB.prepare("UPDATE instagram_jobs SET lease_until=0 WHERE id=?")
    .bind(id)
    .run();
  const rows = (await (
    await call(`/api/projects/${project.id}/instagram/jobs`)
  ).json()) as { id: string; status: string }[];
  assert.ok(rows.some((j) => j.id === id && j.status === "queued"));
  globalThis.fetch = realFetch;
});

test("queued jobs resume through authenticated requests and isolate owners", async () => {
  await connectFixture();
  const job = await createJob();
  for (let i = 0; i < 5; i++)
    assert.equal((await upload(job.id, i)).status, 200);
  const result = await call(`/api/instagram/jobs/${job.id}/publish`, "POST");
  assert.equal(result.status, 202);
  assert.equal((await jobRow(job.id))!.status, "queued");
  globalThis.fetch = async () => response({ id: "resumed-child" });
  const advanced = await call(`/api/instagram/jobs/${job.id}/advance`, "POST");
  assert.equal(advanced.status, 200);
  assert.equal((await jobRow(job.id))!.status, "processing");
  assert.equal(
    (await call(`/api/instagram/jobs/${job.id}/advance`, "POST", undefined, ""))
      .status,
    401,
  );
  globalThis.fetch = realFetch;
  const other = (await env.DB.prepare(
    "SELECT id FROM users WHERE username='ig-other'",
  ).first<{ id: string }>())!.id;
  assert.equal(
    (
      await call(
        `/api/instagram/jobs/${job.id}`,
        "GET",
        undefined,
        otherCookie,
        { INSTAGRAM_OWNER_ID: other },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/projects/${project.id}/instagram/jobs`,
        "GET",
        undefined,
        otherCookie,
        { INSTAGRAM_OWNER_ID: other },
      )
    ).status,
    404,
  );
});

test("on-demand refresh rotates encrypted token, invalid grants require reconnect, disconnect stops unsent jobs", async () => {
  await connectFixture();
  await env.DB.prepare("UPDATE instagram_connections SET expires=?,refreshed=?")
    .bind(now() + 86400000, now() - 2 * 86400000)
    .run();
  globalThis.fetch = async () =>
    response({ access_token: "refreshed-token", expires_in: 5184000 });
  await refreshConnections(env);
  const c = (await connection(env, env.INSTAGRAM_OWNER_ID!))!;
  assert.equal(await decryptToken(c.token, key, c.user_id), "refreshed-token");
  await env.DB.prepare("UPDATE instagram_connections SET expires=?,refreshed=?")
    .bind(now() + 86400000, now() - 2 * 86400000)
    .run();
  globalThis.fetch = async () => response({ error: { code: 190 } }, 400);
  await refreshConnections(env);
  assert.equal((await connection(env, c.user_id))!.reconnect, 1);
  await connectFixture();
  const job = await createJob();
  await call("/api/instagram/connection", "DELETE");
  assert.equal(await connection(env, c.user_id), null);
  assert.equal((await jobRow(job.id))!.status, "failed");
  assert.equal(
    (await call(`/api/instagram/jobs/${job.id}/publish`, "POST")).status,
    200,
  );
  globalThis.fetch = realFetch;
});
