import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { preview } from "vite";
import { newProject } from "../app/model.ts";
const server = await preview({
  preview: { host: "127.0.0.1", port: 0, open: false },
});
try {
  const origin = server.resolvedUrls.local[0].replace(/\/$/, "");
  const assets = new Set();
  async function api(path, method = "GET", value, cookie = "") {
    return fetch(`${origin}${path}`, {
      method,
      redirect: "manual",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
  }
  for (const path of ["/proyek", "/pengaturan", "/editor/private"]) {
    const res = await api(path);
    const html = await res.text();
    assert.ok(
      [302, 303, 307, 308].includes(res.status) ||
        (res.status === 200 && html.includes("/masuk?next=")),
      `${path}: expected login redirect, got ${res.status}: ${html.slice(0, 200)}`,
    );
  }
  assert.equal((await api("/api/projects")).status, 401);
  const username = `smoke-${Date.now()}`;
  const registered = await api("/api/auth/register", "POST", {
    username,
    password: "smoke-only-password-123",
  });
  assert.equal(registered.status, 200, await registered.clone().text());
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const created = await api("/api/projects", "POST", newProject(), cookie);
  assert.equal(created.status, 201, await created.clone().text());
  const project = await created.json();
  for (const path of [
    "/",
    "/masuk",
    "/daftar",
    "/proyek",
    "/pengaturan",
    `/editor/${project.id}`,
  ]) {
    for (let visit = 0; visit < 2; visit++) {
      const res = await api(path, "GET", undefined, cookie);
      const html = await res.text();
      assert.equal(res.status, 200, `${path}: ${html.slice(0, 500)}`);
      assert.ok(!html.includes("__next_error__"), `${path}: SSR error`);
      for (const match of html.matchAll(
        /(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+)"/g,
      ))
        assets.add(match[1]);
      if (path.startsWith("/editor/")) assert.match(html, /Membuka studio/);
      if (path === "/pengaturan") {
        for (const anchor of ["hubungkan", "akses-agent", "token-pribadi"])
          assert.ok(html.includes(`id="${anchor}"`));
        assert.ok(html.includes('aria-label="Bagian pengaturan"'));
        assert.ok(html.includes('id="mcp-url"'));
        assert.ok(html.includes("https://claude.ai/customize/connectors"));
      }
    }
    console.log(`PASS ${path} (direct request + reload)`);
  }
  const guide = await api("/panduan");
  assert.ok(
    [302, 303, 307, 308].includes(guide.status) ||
      (await guide.text()).includes("url=/"),
  );
  const saved = await api(
    `/api/projects/${project.id}`,
    "PUT",
    { ...project, title: "Workers save" },
    cookie,
  );
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(
    (await api(`/api/projects/${project.id}`, "PUT", project, cookie)).status,
    409,
  );
  const tokenRes = await api(
    "/api/connections",
    "POST",
    { name: "Workers smoke test" },
    cookie,
  );
  assert.equal(tokenRes.status, 201);
  const { token } = await tokenRes.json();
  const mcp = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "workers-smoke", version: "1" },
      },
    }),
  });
  assert.equal(mcp.status, 200, await mcp.clone().text());
  assert.equal((await mcp.json()).result.serverInfo.name, "ruang-slide");
  const discovery = await api("/.well-known/oauth-protected-resource/mcp");
  assert.equal(discovery.status, 200);
  assert.equal(
    (await discovery.json()).resource,
    "https://carousel.hengker.tech/mcp",
  );
  const registration = await api("/oauth/register", "POST", {
    client_name: "Workers consent preview",
    redirect_uris: ["https://example.com/callback"],
    token_endpoint_auth_method: "none",
  });
  assert.equal(registration.status, 201);
  const client = await registration.json();
  const consentParams = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "https://example.com/callback",
    response_type: "code",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    resource: "https://carousel.hengker.tech/mcp",
  });
  const consent = await api(
    `/oauth/authorize?${consentParams}`,
    "GET",
    undefined,
    cookie,
  );
  assert.equal(consent.status, 200);
  assert.ok(
    consent.headers.get("content-security-policy").includes("font-src 'self'"),
  );
  const consentHTML = await consent.text();
  for (const text of [
    "consent-bridge",
    "Akses yang kamu berikan",
    'name="decision" value="allow"',
    'name="decision" value="deny"',
    "Ganti akun",
  ])
    assert.ok(consentHTML.includes(text), `Missing consent content: ${text}`);
  assert.ok(assets.size > 0);
  for (const path of assets) {
    const res = await fetch(new URL(path, origin));
    assert.equal(res.status, 200, `Missing ${path}`);
    await res.arrayBuffer();
  }
  for (const path of [
    "/consent.css",
    "/fonts/manrope-400.woff2",
    "/fonts/manrope-600.woff2",
    "/fonts/manrope-700.woff2",
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `Missing consent asset: ${path}`);
    await response.arrayBuffer();
  }
  const files = await readdir("dist/client/_next/static/media");
  for (const family of ["manrope", "dm-sans", "ibm-plex-sans"])
    for (const weight of [400, 700]) {
      const file = files.find(
        (name) =>
          name.startsWith(`${family}-latin-${weight}-normal.`) &&
          name.endsWith(".woff2"),
      );
      assert.ok(file);
      const response = await fetch(`${origin}/_next/static/media/${file}`);
      assert.equal(response.status, 200);
      assert.equal(
        new TextDecoder().decode(
          new Uint8Array(await response.arrayBuffer()).subarray(0, 4),
        ),
        "wOF2",
      );
    }
  assert.equal(
    (
      await api(
        `/api/projects/${project.id}`,
        "DELETE",
        { revision: 2 },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal((await api("/api/auth/logout", "POST", {}, cookie)).status, 200);
  assert.equal(
    (await api("/api/projects", "GET", undefined, cookie)).status,
    401,
  );
  console.log(
    `PASS auth, D1 autosave conflicts, MCP runtime, discovery, ${assets.size} assets and six fonts`,
  );
} finally {
  await server.close();
}
