import { renderConsent } from "./consent";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { apiHandler } from "./api";
import { oauthHandler, metadata } from "./oauth";
import { mcpHandler } from "./mcp";
import {
  type DB,
  ORIGIN,
  bearerUser,
  hash,
  now,
  passwordHash,
  sessionUser,
} from "./core";
import { imageURL, loadImage, publicHost } from "./images";
import { newProject } from "../model";
let mf: Miniflare, db: DB;
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          script: 'export default {fetch(){return new Response("ok")}}',
          compatibilityDate: "2026-11-07",
          d1Databases: { DB: "test-db" },
        },
      ],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as DB;
  await db.exec(
    await readFile(
      new URL("../../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
});
after(async () => {
  await mf?.dispose();
});
function request(
  path: string,
  method = "GET",
  input?: unknown,
  cookie = "",
  ip = "test",
) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Cookie: cookie,
      "CF-Connecting-IP": ip,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}
async function account(name: string) {
  const res = await apiHandler(
    db,
    request(
      "/api/auth/register",
      "POST",
      { username: name, password: "a-strong-password-123" },
      "",
      name,
    ),
  );
  assert.equal(res.status, 200, await res.clone().text());
  return res.headers.get("set-cookie")!.split(";")[0];
}
async function read(res: Response) {
  return (await res.json()) as any;
}
test("registration/login, case-insensitive uniqueness, hashing, sessions and CSRF", async () => {
  const cookie = await account("Alice");
  const user = await sessionUser(db, request("/", "GET", undefined, cookie));
  assert.equal(user?.username, "alice");
  const row = await db
    .prepare("SELECT password_hash,salt FROM users WHERE id=?")
    .bind(user!.id)
    .first<{ password_hash: string; salt: string }>();
  assert.notEqual(row!.password_hash, "a-strong-password-123");
  assert.equal(
    await passwordHash("a-strong-password-123", row!.salt),
    row!.password_hash,
  );
  assert.equal(
    (
      await apiHandler(
        db,
        request(
          "/api/auth/register",
          "POST",
          { username: "ALICE", password: "a-strong-password-123" },
          "",
          "unique",
        ),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await apiHandler(
        db,
        request(
          "/api/auth/login",
          "POST",
          { username: "ALICE", password: "incorrect-password" },
          "",
          "login",
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await apiHandler(
        db,
        request(
          "/api/auth/login",
          "POST",
          { username: "ALICE", password: "a-strong-password-123" },
          "",
          "login",
        ),
      )
    ).status,
    200,
  );
  const cross = request("/api/auth/logout", "POST", {}, cookie);
  cross.headers.set("Origin", "https://evil.test");
  assert.equal((await apiHandler(db, cross)).status, 403);
  assert.equal(
    (await apiHandler(db, request("/api/auth/logout", "POST", {}, cookie)))
      .status,
    200,
  );
  assert.equal(
    await sessionUser(db, request("/", "GET", undefined, cookie)),
    null,
  );
  const expired = await account("expired");
  const token = expired.slice("rs_session=".length);
  await db
    .prepare("UPDATE sessions SET expires=0 WHERE hash=?")
    .bind(await hash(token))
    .run();
  assert.equal(
    await sessionUser(db, request("/", "GET", undefined, expired)),
    null,
  );
});
test("cloud CRUD isolates owners and rejects stale update/delete revisions", async () => {
  const a = await account("owner-a"),
    b = await account("owner-b");
  const created = await apiHandler(
    db,
    request("/api/projects", "POST", newProject(), a),
  );
  assert.equal(created.status, 201, await created.clone().text());
  const p = await read(created);
  assert.equal(p.revision, 1);
  const url = `/api/projects/${p.id}`;
  assert.equal(
    (await apiHandler(db, request(url, "GET", undefined, b))).status,
    404,
  );
  assert.equal((await apiHandler(db, request(url, "PUT", p, b))).status, 404);
  assert.equal(
    (await apiHandler(db, request(url, "DELETE", { revision: 1 }, b))).status,
    404,
  );
  const saved = await read(
    await apiHandler(db, request(url, "PUT", { ...p, title: "Updated" }, a)),
  );
  assert.equal(saved.revision, 2);
  assert.equal((await apiHandler(db, request(url, "PUT", p, a))).status, 409);
  assert.equal(
    (await apiHandler(db, request(url, "DELETE", { revision: 1 }, a))).status,
    409,
  );
  assert.equal(
    (await apiHandler(db, request(url, "DELETE", { revision: 2 }, a))).status,
    200,
  );
  assert.equal(
    (await apiHandler(db, request(url, "GET", undefined, a))).status,
    404,
  );
});
test("personal tokens are hashed, expire, and are revocable", async () => {
  const cookie = await account("tokens");
  const created = await read(
    await apiHandler(
      db,
      request("/api/connections", "POST", { name: "Agent" }, cookie),
    ),
  );
  const req = new Request(`${ORIGIN}/mcp`, {
    headers: { Authorization: `Bearer ${created.token}` },
  });
  assert.ok(await bearerUser(db, req));
  const con = await read(
    await apiHandler(db, request("/api/connections", "GET", undefined, cookie)),
  );
  assert.notEqual(con.tokens[0].id, created.token);
  assert.ok(!JSON.stringify(con).includes(created.token));
  await db
    .prepare("UPDATE tokens SET expires=0 WHERE hash=?")
    .bind(con.tokens[0].id)
    .run();
  await assert.rejects(bearerUser(db, req));
  const second = await read(
    await apiHandler(
      db,
      request("/api/connections", "POST", { name: "Second" }, cookie),
    ),
  );
  const id = await hash(second.token);
  await apiHandler(
    db,
    request("/api/connections", "DELETE", { id, kind: "token" }, cookie),
  );
  await assert.rejects(
    bearerUser(
      db,
      new Request(`${ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${second.token}` },
      }),
    ),
  );
});
test("OAuth enforces redirect, resource, PKCE, single-use codes, refresh rotation and grant revocation", async () => {
  const cookie = await account("oauth");
  const client = await read(
    await oauthHandler(
      db,
      request(
        "/oauth/register",
        "POST",
        {
          client_name: "Test client",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          token_endpoint_auth_method: "none",
        },
        "",
        "oauth-client",
      ),
    ),
  );
  const verifier = "v".repeat(43),
    challenge = await hash(verifier);
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${ORIGIN}/mcp`,
    state: "test-state",
  });
  let res = await oauthHandler(
    db,
    request(`/oauth/authorize?${params}`, "GET", undefined, cookie),
  );
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Test client/);
  const bad = new URLSearchParams(params);
  bad.set("redirect_uri", "https://evil.test/callback");
  assert.equal(
    (
      await oauthHandler(
        db,
        request(`/oauth/authorize?${bad}`, "GET", undefined, cookie),
      )
    ).status,
    400,
  );
  async function form(path: string, p: URLSearchParams) {
    return oauthHandler(
      db,
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: p.toString(),
      }),
    );
  }
  params.set("decision", "allow");
  res = await form("/oauth/authorize", params);
  assert.equal(res.status, 302);
  const target = new URL(res.headers.get("location")!);
  assert.equal(target.searchParams.get("state"), "test-state");
  const token = new URLSearchParams({
    grant_type: "authorization_code",
    code: target.searchParams.get("code")!,
    client_id: client.client_id,
    redirect_uri: params.get("redirect_uri")!,
    code_verifier: "x".repeat(43),
    resource: `${ORIGIN}/mcp`,
  });
  assert.equal((await form("/oauth/token", token)).status, 400);
  token.set("code_verifier", verifier);
  res = await form("/oauth/token", token);
  assert.equal(res.status, 200, await res.clone().text());
  const tokens = await read(res);
  assert.equal((await form("/oauth/token", token)).status, 400);
  assert.ok(
    await bearerUser(
      db,
      new Request(`${ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
    ),
  );
  const refresh = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: client.client_id,
    refresh_token: tokens.refresh_token,
    resource: `${ORIGIN}/mcp`,
  });
  assert.equal((await form("/oauth/token", refresh)).status, 200);
  assert.equal((await form("/oauth/token", refresh)).status, 400);
  const connections = await read(
    await apiHandler(db, request("/api/connections", "GET", undefined, cookie)),
  );
  await apiHandler(
    db,
    request(
      "/api/connections",
      "DELETE",
      { id: connections.grants[0].id, kind: "grant" },
      cookie,
    ),
  );
  await assert.rejects(
    bearerUser(
      db,
      new Request(`${ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
    ),
  );
  assert.equal(
    (await read(metadata("/.well-known/oauth-protected-resource/mcp")))
      .resource,
    `${ORIGIN}/mcp`,
  );
});
test("MCP SDK initializes, advertises schemas and executes all five tools with owner checks", async () => {
  const cookie = await account("mcp");
  const { token } = await read(
    await apiHandler(
      db,
      request("/api/connections", "POST", { name: "MCP test" }, cookie),
    ),
  );
  let id = 0;
  async function rpc(method: string, params: unknown = {}) {
    const res = await mcpHandler(
      db,
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      }),
    );
    assert.equal(res.status, 200, await res.clone().text());
    return await read(res);
  }
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.result.serverInfo.name, "ruang-slide");
  const tools = await rpc("tools/list");
  assert.equal(tools.result.tools.length, 5);
  assert.equal(
    tools.result.tools.find((t: any) => t.name === "delete_project").annotations
      .destructiveHint,
    true,
  );
  async function call(name: string, args: unknown) {
    const res = await rpc("tools/call", { name, arguments: args });
    assert.ok(!res.error, JSON.stringify(res));
    return res.result;
  }
  const content = {
    title: "MCP project",
    slides: newProject().slides,
    assets: {},
  };
  const created = await call("create_project", { project: content });
  assert.ok(!created.isError, JSON.stringify(created));
  const p = JSON.parse(created.content[0].text);
  assert.equal(p.revision, 1);
  assert.equal(
    JSON.parse((await call("list_projects", {})).content[0].text).length,
    1,
  );
  assert.equal(
    JSON.parse((await call("get_project", { id: p.id })).content[0].text).id,
    p.id,
  );
  const updated = await call("update_project", {
    id: p.id,
    revision: 1,
    project: { ...content, title: "Edited" },
  });
  assert.ok(!updated.isError);
  assert.equal(JSON.parse(updated.content[0].text).revision, 2);
  const stale = await call("update_project", {
    id: p.id,
    revision: 1,
    project: content,
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /409/);
  assert.ok(!(await call("delete_project", { id: p.id, revision: 2 })).isError);
  assert.equal((await call("get_project", { id: p.id })).isError, true);
  const unauthorized = await mcpHandler(db, new Request(`${ORIGIN}/mcp`));
  assert.equal(unauthorized.status, 401);
  assert.match(
    unauthorized.headers.get("WWW-Authenticate")!,
    /resource_metadata/,
  );
});
test("image validation blocks private addresses, validates redirects, format, size and exact square dimensions", async () => {
  for (const host of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "[::1]",
    "[::ffff:127.0.0.1]",
    "localhost",
    "service.internal",
  ])
    assert.equal(publicHost(host), false, host);
  for (const url of [
    "http://example.org/a.png",
    "https://127.0.0.1/a",
    "https://2130706433/a",
    "https://user:password@example.org/a",
    "https://example.org:8443/a",
  ])
    assert.throws(() => imageURL(url));
  const original = globalThis.fetch;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  try {
    const mock = (image: () => Response) => {
      globalThis.fetch = async (input) =>
        String(input).includes("dns-query")
          ? Response.json({
              Status: 0,
              Answer: [{ type: 1, data: "93.184.216.34" }],
            })
          : image();
    };
    mock(() => new Response(png));
    const image = await loadImage("https://example.org/photo.png");
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
    assert.equal(image.mime, "image/png");
    const wide = Buffer.from(png);
    wide.writeUInt32BE(2, 16);
    mock(() => new Response(wide));
    await assert.rejects(loadImage("https://example.org/wide.png"), /2 × 1/);
    mock(() => new Response("not an image"));
    await assert.rejects(loadImage("https://example.org/page"), /valid/);
    mock(
      () =>
        new Response(png, {
          headers: { "content-length": String(13 * 1024 * 1024) },
        }),
    );
    await assert.rejects(loadImage("https://example.org/large"), /12 MB/);
    mock(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/secret" },
        }),
    );
    await assert.rejects(loadImage("https://example.org/redirect"), /publik/);
    globalThis.fetch = async () =>
      Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] });
    await assert.rejects(loadImage("https://example.org/rebinding"), /publik/);
  } finally {
    globalThis.fetch = original;
  }
});
test("authentication rate limits repeated login attempts", async () => {
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await apiHandler(
          db,
          request(
            "/api/auth/login",
            "POST",
            { username: "absent", password: "bad-password-123" },
            "",
            "ratelimit",
          ),
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await apiHandler(
        db,
        request(
          "/api/auth/login",
          "POST",
          { username: "absent", password: "bad-password-123" },
          "",
          "ratelimit",
        ),
      )
    ).status,
    429,
  );
});

test("consent renders escaped client, account and form values with explicit approval and denial", () => {
  const html = renderConsent({
    clientName: '<script>alert("client")</script>',
    username: '<img src=x onerror="alert(1)">',
    params: new URLSearchParams({
      client_id: "client",
      state: '"><script>alert(1)</script>',
      decision: "allow",
    }),
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('name="decision" value="allow"'));
  assert.ok(html.includes('name="decision" value="deny"'));
  assert.ok(!html.includes('type="hidden" name="decision"'));
  assert.ok(html.includes('name="state" value="&quot;&gt;&lt;script&gt;'));
  assert.ok(html.includes("Penghapusan oleh agent bersifat permanen."));
});
