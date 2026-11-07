import {
  type DB,
  body,
  csrf,
  fail,
  guarded,
  hash,
  json,
  now,
  passwordHash,
  random,
  rateLimit,
  requireUser,
  sessionCookie,
  equal,
} from "./core";
import * as projects from "./projects";
import { loadImage } from "./images";
export const apiHandler = (db: DB, req: Request) =>
  guarded(async () => {
    const url = new URL(req.url),
      path = url.pathname.slice(5).split("/");
    const method = req.method;
    if (!["GET", "HEAD"].includes(method)) csrf(req);
    if (
      path[0] === "auth" &&
      ["register", "login"].includes(path[1]) &&
      method === "POST"
    ) {
      await rateLimit(
        db,
        `auth-ip:${req.headers.get("CF-Connecting-IP") ?? "local"}`,
        30,
      );
      const input = await body(req),
        username = String(input.username ?? "").toLowerCase(),
        password = input.password;
      if (
        !/^[a-z0-9_-]{3,32}$/.test(username) ||
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 128
      )
        fail(
          400,
          "Username 3–32 huruf, angka, _ atau -. Password 12–128 karakter.",
        );
      await rateLimit(db, `auth-user:${username}`, 10);
      let user: { id: string; salt: string; password_hash: string } | null;
      if (path[1] === "register") {
        const salt = random(),
          id = crypto.randomUUID();
        const pw = await passwordHash(password, salt);
        try {
          await db
            .prepare(
              "INSERT INTO users(id,username,salt,password_hash,created) VALUES (?,?,?,?,?)",
            )
            .bind(id, username, salt, pw, now())
            .run();
        } catch (e) {
          if (String(e).includes("UNIQUE"))
            fail(409, "Username sudah digunakan. Pilih username lain.");
          throw e;
        }
        user = { id, salt, password_hash: pw };
      } else {
        user = await db
          .prepare("SELECT id,salt,password_hash FROM users WHERE username=?")
          .bind(username)
          .first();
        const candidate = await passwordHash(
          password,
          user?.salt ?? "invalid-user-salt",
        );
        if (!user || !equal(candidate, user.password_hash))
          fail(401, "Username atau password salah.");
      }
      const token = random();
      await db
        .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)")
        .bind(await hash(token), user!.id, now() + 30 * 86400000)
        .run();
      return json({ username }, 200, {
        "Set-Cookie": sessionCookie(token, 30 * 86400),
      });
    }
    const user = await requireUser(db, req);
    if (path.join("/") === "auth/me" && method === "GET") return json(user);
    if (path.join("/") === "auth/logout" && method === "POST") {
      const token = req.headers
        .get("cookie")
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("rs_session="))
        ?.slice(11);
      if (token)
        await db
          .prepare("DELETE FROM sessions WHERE hash=?")
          .bind(await hash(token))
          .run();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (path[0] === "projects") {
      if (!path[1] && method === "GET")
        return json(await projects.list(db, user.id));
      if (!path[1] && method === "POST")
        return json(
          await projects.save(db, user.id, await body(req), true),
          201,
        );
      if (path[1] && method === "GET")
        return json(await projects.get(db, user.id, path[1]));
      if (path[1] && method === "PUT") {
        const p = await body(req);
        if (p.id !== path[1]) fail(400, "ID proyek tidak sesuai.");
        return json(await projects.save(db, user.id, p));
      }
      if (path[1] && method === "DELETE") {
        const { revision } = await body(req);
        if (!Number.isSafeInteger(revision))
          fail(400, "Versi proyek diperlukan.");
        await projects.remove(db, user.id, path[1], revision);
        return json({ ok: true });
      }
    }
    if (path[0] === "images" && ["POST", "GET"].includes(method)) {
      await rateLimit(db, `images:${user.id}`, 120, 60);
      const image = await loadImage(
        method === "GET" ? url.searchParams.get("url") : (await body(req)).url,
      );
      if (method === "POST")
        return json({ width: image.width, height: image.height });
      return new Response(image.bytes, {
        headers: {
          "Content-Type": image.mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }
    if (path[0] === "connections") {
      if (method === "GET") {
        const tokens = await db
          .prepare(
            "SELECT hash AS id,name,expires,created FROM tokens WHERE user_id=? AND kind='personal' AND expires>? ORDER BY created DESC",
          )
          .bind(user.id, now())
          .all();
        const grants = await db
          .prepare(
            "SELECT grants.id,oauth_clients.name,grants.created FROM grants JOIN oauth_clients ON oauth_clients.id=grants.client_id WHERE grants.user_id=? AND grants.revoked=0",
          )
          .bind(user.id)
          .all();
        return json({ tokens: tokens.results, grants: grants.results });
      }
      if (method === "POST") {
        await rateLimit(db, `tokens:${user.id}`, 20, 3600);
        const input = await body(req),
          name = String(input.name ?? "").trim();
        if (!name || name.length > 80)
          fail(400, "Nama token wajib diisi, maksimal 80 karakter.");
        const token = `rs_${random()}`;
        await db
          .prepare(
            "INSERT INTO tokens(hash,user_id,name,kind,expires,created) VALUES (?,?,?,'personal',?,?)",
          )
          .bind(await hash(token), user.id, name, now() + 90 * 86400000, now())
          .run();
        return json({ token }, 201);
      }
      if (method === "DELETE") {
        const { id, kind } = await body(req);
        if (kind === "grant")
          await db
            .prepare("UPDATE grants SET revoked=1 WHERE id=? AND user_id=?")
            .bind(id, user.id)
            .run();
        else
          await db
            .prepare(
              "DELETE FROM tokens WHERE hash=? AND user_id=? AND kind='personal'",
            )
            .bind(id, user.id)
            .run();
        return json({ ok: true });
      }
    }
    return fail(404, "Endpoint tidak ditemukan.");
  });
