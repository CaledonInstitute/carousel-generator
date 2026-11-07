import { renderConsent } from "./consent";
import {
  type DB,
  ORIGIN,
  body,
  csrf,
  fail,
  guarded,
  hash,
  json,
  now,
  random,
  rateLimit,
  readBody,
  sessionUser,
} from "./core";
const resource = `${ORIGIN}/mcp`;
export function metadata(path: string) {
  if (path.startsWith("/.well-known/oauth-protected-resource"))
    return json({
      resource,
      authorization_servers: [ORIGIN],
      scopes_supported: ["projects"],
      bearer_methods_supported: ["header"],
    });
  return json({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    revocation_endpoint: `${ORIGIN}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["projects"],
  });
}
function redirectURL(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    fail(400, "redirect_uri tidak valid.");
  let u: URL;
  try {
    u = new URL(value as string);
  } catch {
    return fail(400, "redirect_uri tidak valid.");
  }
  if (
    u.hash ||
    u.username ||
    u.password ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    )
  )
    fail(400, "redirect_uri harus HTTPS atau loopback lokal.");
  return u.href;
}
async function issue(db: DB, user: string, grant: string) {
  const access = random(),
    refresh = random(),
    time = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO tokens(hash,user_id,name,kind,grant_id,expires,created) VALUES (?,?,'OAuth','access',?,?,?)",
      )
      .bind(await hash(access), user, grant, time + 3600000, time),
    db
      .prepare(
        "INSERT INTO tokens(hash,user_id,name,kind,grant_id,expires,created) VALUES (?,?,'OAuth','refresh',?,?,?)",
      )
      .bind(await hash(refresh), user, grant, time + 90 * 86400000, time),
  ]);
  return json({
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh,
    scope: "projects",
  });
}
export const oauthHandler = (db: DB, req: Request) =>
  guarded(async () => {
    const url = new URL(req.url),
      endpoint = url.pathname.split("/").pop();
    if (endpoint === "register" && req.method === "POST") {
      await rateLimit(
        db,
        `oauth-register:${req.headers.get("CF-Connecting-IP") ?? "local"}`,
        20,
        3600,
      );
      const input = await body(req);
      if (
        !Array.isArray(input.redirect_uris) ||
        input.redirect_uris.length < 1 ||
        input.redirect_uris.length > 10
      )
        fail(400, "Daftarkan 1–10 redirect_uri.");
      const redirects = input.redirect_uris.map(redirectURL),
        id = crypto.randomUUID(),
        name = String(input.client_name || "MCP client").slice(0, 100);
      if (
        input.token_endpoint_auth_method &&
        input.token_endpoint_auth_method !== "none"
      )
        fail(400, "Gunakan token_endpoint_auth_method none dan PKCE.");
      await db
        .prepare("INSERT INTO oauth_clients(id,name,redirects) VALUES (?,?,?)")
        .bind(id, name, JSON.stringify(redirects))
        .run();
      return json(
        {
          client_id: id,
          client_name: name,
          redirect_uris: redirects,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
        201,
      );
    }
    if (endpoint === "authorize" && ["GET", "POST"].includes(req.method)) {
      if (req.method === "POST") csrf(req);
      const params =
        req.method === "POST"
          ? new URLSearchParams(await readBody(req, 8192))
          : url.searchParams;
      const client = await db
        .prepare("SELECT id,name,redirects FROM oauth_clients WHERE id=?")
        .bind(params.get("client_id"))
        .first<{ id: string; name: string; redirects: string }>();
      if (
        !client ||
        !JSON.parse(client.redirects).includes(params.get("redirect_uri"))
      )
        fail(400, "Client atau redirect_uri tidak terdaftar.");
      if (
        params.get("response_type") !== "code" ||
        params.get("code_challenge_method") !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") ?? "") ||
        params.get("resource") !== resource ||
        (params.get("scope") && params.get("scope") !== "projects")
      )
        fail(400, "Gunakan authorization code, PKCE S256, dan resource /mcp.");
      const user = await sessionUser(db, req);
      if (!user) {
        const target = `/oauth/authorize?${params.toString()}`;
        return Response.redirect(
          `${url.origin}/masuk?next=${encodeURIComponent(target)}`,
          302,
        );
      }
      if (req.method === "GET") {
        return new Response(
          renderConsent({
            clientName: client!.name,
            username: user.username,
            params,
          }),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy":
                "default-src 'none'; style-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
              "X-Frame-Options": "DENY",
            },
          },
        );
      }
      const target = new URL(params.get("redirect_uri")!);
      if (params.has("state"))
        target.searchParams.set("state", params.get("state")!);
      if (params.get("decision") !== "allow") {
        target.searchParams.set("error", "access_denied");
        return Response.redirect(target.href, 302);
      }
      const grant = crypto.randomUUID(),
        code = random();
      await db.batch([
        db
          .prepare(
            "INSERT INTO grants(id,user_id,client_id,created) VALUES (?,?,?,?)",
          )
          .bind(grant, user.id, client!.id, now()),
        db
          .prepare(
            "INSERT INTO oauth_codes(hash,grant_id,challenge,redirect,resource,expires) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            await hash(code),
            grant,
            params.get("code_challenge"),
            params.get("redirect_uri"),
            resource,
            now() + 300000,
          ),
      ]);
      target.searchParams.set("code", code);
      return Response.redirect(target.href, 302);
    }
    if (endpoint === "token" && req.method === "POST") {
      await rateLimit(
        db,
        `oauth-token:${req.headers.get("CF-Connecting-IP") ?? "local"}`,
        120,
        60,
      );
      const p = new URLSearchParams(await readBody(req, 8192));
      if (p.get("resource") !== resource) fail(400, "Resource tidak valid.");
      if (p.get("grant_type") === "authorization_code") {
        const code = await db
          .prepare(
            "SELECT oauth_codes.*,grants.user_id,grants.client_id FROM oauth_codes JOIN grants ON grants.id=oauth_codes.grant_id WHERE hash=? AND expires>? AND grants.revoked=0",
          )
          .bind(await hash(p.get("code") ?? ""), now())
          .first<{
            hash: string;
            grant_id: string;
            user_id: string;
            client_id: string;
            challenge: string;
            redirect: string;
          }>();
        if (
          !code ||
          code.client_id !== p.get("client_id") ||
          code.redirect !== p.get("redirect_uri") ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(p.get("code_verifier") ?? "") ||
          (await hash(p.get("code_verifier")!)) !== code.challenge
        )
          return json({ error: "invalid_grant" }, 400);
        const used = await db
          .prepare("DELETE FROM oauth_codes WHERE hash=? RETURNING hash")
          .bind(code.hash)
          .first();
        if (!used) return json({ error: "invalid_grant" }, 400);
        return issue(db, code.user_id, code.grant_id);
      }
      if (p.get("grant_type") === "refresh_token") {
        const token = await db
          .prepare(
            "SELECT tokens.hash,tokens.user_id,tokens.grant_id FROM tokens JOIN grants ON grants.id=tokens.grant_id WHERE tokens.hash=? AND tokens.kind='refresh' AND tokens.expires>? AND grants.revoked=0 AND grants.client_id=?",
          )
          .bind(
            await hash(p.get("refresh_token") ?? ""),
            now(),
            p.get("client_id"),
          )
          .first<{ hash: string; user_id: string; grant_id: string }>();
        if (!token) return json({ error: "invalid_grant" }, 400);
        const used = await db
          .prepare("DELETE FROM tokens WHERE hash=? RETURNING hash")
          .bind(token.hash)
          .first();
        if (!used) return json({ error: "invalid_grant" }, 400);
        return issue(db, token.user_id, token.grant_id);
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (endpoint === "revoke" && req.method === "POST") {
      const p = new URLSearchParams(await readBody(req, 8192));
      await db
        .prepare(
          "UPDATE grants SET revoked=1 WHERE client_id=? AND id IN (SELECT grant_id FROM tokens WHERE hash=?)",
        )
        .bind(p.get("client_id"), await hash(p.get("token") ?? ""))
        .run();
      return json({});
    }
    return fail(404, "Endpoint OAuth tidak ditemukan.");
  });
