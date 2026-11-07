import { imageSize } from "image-size";
import {
  body,
  csrf,
  fail,
  guarded,
  hash,
  json,
  now,
  random,
  rateLimit,
  requireUser,
} from "./core";
import { get } from "./projects";
import { advanceJob, refreshConnections } from "./instagram-publishing";
import { cleanExpiredMedia, readMedia, saveMedia } from "./instagram-media";
import { unifiedLogin, UnifiedLoginError } from "./instagram-unified";
import {
  available,
  authMethod,
  configured,
  connection,
  connectionExpired,
  encryptToken,
  metaRequest,
  origin,
  publicJob,
  uploads,
  validSignature,
  type InstagramEnv,
  type Job,
} from "./instagram-common";

const sessionHash = (req: Request) =>
  hash(
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("rs_session="))
      ?.slice(11) || "",
  );
async function ownedJob(env: InstagramEnv, owner: string, id: string) {
  return (
    (await env.DB.prepare(
      "SELECT * FROM instagram_jobs WHERE id=? AND user_id=?",
    )
      .bind(id, owner)
      .first<Job>()) ?? fail(404, "Posting tidak ditemukan.")
  );
}
async function usableConnection(env: InstagramEnv, owner: string) {
  const c = await connection(env, owner);
  if (!c || c.reconnect || connectionExpired(c))
    fail(409, "Hubungkan ulang Instagram di Pengaturan.");
  return c!;
}
export const instagramHandler = (env: InstagramEnv, req: Request) =>
  guarded(async () => {
    const url = new URL(req.url),
      parts = url.pathname.split("/").filter(Boolean),
      method = req.method;
    // Signed media is deliberately accessible without cookies.
    if (
      parts[2] === "media" &&
      parts.length === 5 &&
      ["GET", "HEAD"].includes(method)
    ) {
      if (!(await validSignature(env, url)))
        fail(404, "Gambar tidak ditemukan.");
      const bytes = await readMedia(
        env,
        parts[3],
        Number(parts[4]),
        Number(url.searchParams.get("expires")),
      );
      if (!bytes) fail(404, "Gambar tidak ditemukan.");
      return new Response(method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(bytes!.length),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    const user = await requireUser(env.DB, req);
    if (!["GET", "HEAD"].includes(method)) csrf(req);
    if (parts[2] === "connection" && method === "GET") {
      if (user.id !== env.INSTAGRAM_OWNER_ID || !configured(env))
        return json({
          configured: false,
          allowed: user.id === env.INSTAGRAM_OWNER_ID,
        });
      await refreshConnections(env);
      await cleanExpiredMedia(env);
      const c = await connection(env, user.id);
      return json({
        configured: true,
        allowed: true,
        connected: !!c,
        username: c?.username,
        reconnect: !!c && (!!c.reconnect || connectionExpired(c)),
        expires: c?.expires,
      });
    }
    available(env, user.id);
    if (parts[2] === "connect" && method === "POST") {
      await rateLimit(env.DB, `ig-connect:${user.id}`, 10, 3600);
      const state = random();
      await env.DB.prepare(
        "DELETE FROM instagram_states WHERE expires<? OR user_id=?",
      )
        .bind(now(), user.id)
        .run();
      await env.DB.prepare(
        "INSERT INTO instagram_states(hash,user_id,session_hash,expires) VALUES (?,?,?,?)",
      )
        .bind(
          await hash(state),
          user.id,
          await sessionHash(req),
          now() + 600000,
        )
        .run();
      const target = new URL(
        env.INSTAGRAM_CONFIG_ID
          ? "https://www.facebook.com/dialog/oauth"
          : "https://www.instagram.com/oauth/authorize",
      );
      target.search = new URLSearchParams({
        client_id: env.INSTAGRAM_APP_ID!,
        redirect_uri: `${origin(env)}/api/instagram/callback`,
        response_type: "code",
        ...(env.INSTAGRAM_CONFIG_ID
          ? {
              config_id: env.INSTAGRAM_CONFIG_ID,
              override_default_response_type: "true",
              prompt: "login",
            }
          : {
              scope:
                "instagram_business_basic,instagram_business_content_publish",
            }),
        state,
      }).toString();
      return json({ url: target.href });
    }
    if (parts[2] === "callback" && method === "GET") {
      const state = url.searchParams.get("state") || "";
      const consumed = await env.DB.prepare(
        "DELETE FROM instagram_states WHERE hash=? AND user_id=? AND session_hash=? AND expires>? RETURNING hash",
      )
        .bind(await hash(state), user.id, await sessionHash(req), now())
        .first();
      if (!consumed)
        fail(
          400,
          "Sesi koneksi tidak valid atau kedaluwarsa. Mulai lagi dari Pengaturan.",
        );
      const back = (result: string) =>
        new Response(null, {
          status: 303,
          headers: {
            Location: `${origin(env)}/pengaturan?instagram=${result}#instagram`,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      if (url.searchParams.has("error")) return back("denied");
      if (!url.searchParams.get("code")) return back("failed");
      try {
        if (env.INSTAGRAM_CONFIG_ID) {
          const linked = await unifiedLogin(env, url.searchParams.get("code")!);
          await env.DB.prepare(
            "INSERT INTO instagram_connections(user_id,id,account_id,username,token,expires,refreshed,reconnect,auth_method,client_business_id,config_id) VALUES (?,?,?,?,?,?,?,0,?,?,?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,account_id=excluded.account_id,username=excluded.username,token=excluded.token,expires=excluded.expires,refreshed=excluded.refreshed,reconnect=0,auth_method=excluded.auth_method,client_business_id=excluded.client_business_id,config_id=excluded.config_id",
          )
            .bind(
              user.id,
              crypto.randomUUID(),
              linked.account_id,
              linked.username,
              await encryptToken(
                linked.access_token,
                env.INSTAGRAM_TOKEN_KEY!,
                user.id,
              ),
              linked.expires,
              now(),
              authMethod(env),
              linked.client_business_id,
              env.INSTAGRAM_CONFIG_ID,
            )
            .run();
          return back("connected");
        }
        type ShortToken = {
          access_token: string;
          user_id: string;
          permissions?: string[] | string;
        };
        const response = await metaRequest<
          ShortToken & { data?: ShortToken[] }
        >("https://api.instagram.com/oauth/access_token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: env.INSTAGRAM_APP_ID!,
            client_secret: env.INSTAGRAM_APP_SECRET!,
            grant_type: "authorization_code",
            redirect_uri: `${origin(env)}/api/instagram/callback`,
            code: url.searchParams.get("code")!,
          }),
        });
        const short = response.data?.[0] ?? response;
        const permissions = Array.isArray(short.permissions)
          ? short.permissions
          : (short.permissions || "").split(",");
        if (
          !short.access_token ||
          !permissions.includes("instagram_business_basic") ||
          !permissions.includes("instagram_business_content_publish")
        )
          return back("permissions");
        const exchange = new URL("https://graph.instagram.com/access_token");
        exchange.search = new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: env.INSTAGRAM_APP_SECRET!,
          access_token: short.access_token,
        }).toString();
        const long = await metaRequest<{
          access_token: string;
          expires_in: number;
        }>(exchange.href);
        const profile = await metaRequest<{
          user_id: string;
          username: string;
        }>(
          `https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/me?fields=user_id,username`,
          { headers: { Authorization: `Bearer ${long.access_token}` } },
        );
        if (
          !profile.user_id ||
          !profile.username ||
          !long.access_token ||
          !(long.expires_in > 0)
        )
          return back("failed");
        await env.DB.prepare(
          "INSERT INTO instagram_connections(user_id,id,account_id,username,token,expires,refreshed,reconnect) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,account_id=excluded.account_id,username=excluded.username,token=excluded.token,expires=excluded.expires,refreshed=excluded.refreshed,reconnect=0,auth_method='instagram_login',client_business_id=NULL,config_id=NULL",
        )
          .bind(
            user.id,
            crypto.randomUUID(),
            String(profile.user_id),
            profile.username,
            await encryptToken(
              long.access_token,
              env.INSTAGRAM_TOKEN_KEY!,
              user.id,
            ),
            now() + long.expires_in * 1000,
            now(),
          )
          .run();
        return back("connected");
      } catch (error) {
        if (error instanceof UnifiedLoginError) return back(error.result);
        return back("failed");
      }
    }
    if (parts[2] === "connection" && method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM instagram_connections WHERE user_id=?",
        ).bind(user.id),
        env.DB.prepare("DELETE FROM instagram_states WHERE user_id=?").bind(
          user.id,
        ),
        env.DB.prepare(
          "UPDATE instagram_jobs SET status='failed',error='Koneksi Instagram diputus. Buat posting baru setelah menghubungkan ulang.',updated=? WHERE user_id=? AND status IN ('preparing','queued','processing')",
        ).bind(now(), user.id),
      ]);
      return json({ ok: true });
    }
    if (
      parts[1] === "projects" &&
      parts[3] === "instagram" &&
      parts[4] === "jobs" &&
      parts.length === 5
    ) {
      const project = await get(env.DB, user.id, parts[2]);
      if (method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT * FROM instagram_jobs WHERE user_id=? AND project_id=? ORDER BY created DESC LIMIT 10",
        )
          .bind(user.id, project.id)
          .all<Job>();
        return json(
          await Promise.all(
            rows.results.map(async (j) =>
              publicJob(j, await uploads(env, j.id)),
            ),
          ),
        );
      }
      if (method === "POST") {
        const input = await body(req);
        if (
          typeof input.key !== "string" ||
          !/^[a-zA-Z0-9-]{16,80}$/.test(input.key)
        )
          fail(400, "Kunci posting tidak valid.");
        const caption = input.caption ?? "";
        if (typeof caption !== "string" || Array.from(caption).length > 2200)
          fail(400, "Caption maksimal 2.200 karakter.");
        const existing = await env.DB.prepare(
          "SELECT * FROM instagram_jobs WHERE user_id=? AND request_key=?",
        )
          .bind(user.id, input.key)
          .first<Job>();
        if (existing) {
          if (
            existing.project_id !== project.id ||
            existing.revision !== input.revision ||
            existing.caption !== caption
          )
            fail(409, "Kunci posting sudah digunakan untuk isi lain.");
          return json({
            ...publicJob(existing, await uploads(env, existing.id)),
            project: JSON.parse(existing.snapshot),
          });
        }
        if (input.revision !== project.revision)
          fail(
            409,
            "Proyek berubah. Simpan dan periksa versi terbaru sebelum posting.",
          );
        if (project.slides.length < 5 || project.slides.length > 20)
          fail(
            400,
            "Posting Instagram mendukung 5–20 slide. Kurangi slide atau unduh proyek.",
          );
        await refreshConnections(env);
        await cleanExpiredMedia(env);
        const c = await usableConnection(env, user.id);
        await rateLimit(env.DB, `ig-jobs:${user.id}`, 30, 3600);
        const id = crypto.randomUUID(),
          time = now();
        await env.DB.prepare(
          "INSERT INTO instagram_jobs(id,user_id,project_id,revision,connection_id,account_id,username,snapshot,caption,request_key,created,updated,expires) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_key) DO NOTHING",
        )
          .bind(
            id,
            user.id,
            project.id,
            project.revision,
            c.id,
            c.account_id,
            c.username,
            JSON.stringify(project),
            caption,
            input.key,
            time,
            time,
            time + 48 * 3600000,
          )
          .run();
        const job = (await env.DB.prepare(
          "SELECT * FROM instagram_jobs WHERE user_id=? AND request_key=?",
        )
          .bind(user.id, input.key)
          .first<Job>())!;
        if (
          job.project_id !== project.id ||
          job.revision !== input.revision ||
          job.caption !== caption
        )
          fail(409, "Kunci posting sudah digunakan untuk isi lain.");
        return json(
          {
            ...publicJob(job, await uploads(env, job.id)),
            project: JSON.parse(job.snapshot),
          },
          201,
        );
      }
    }
    if (parts[2] === "jobs" && parts[3]) {
      const job = await ownedJob(env, user.id, parts[3]);
      if (parts.length === 4 && method === "GET")
        return json(publicJob(job, await uploads(env, job.id)));
      if (parts[4] === "upload" && parts.length === 6 && method === "PUT") {
        if (job.status !== "preparing" || job.expires <= now())
          fail(409, "Persiapan posting sudah ditutup atau kedaluwarsa.");
        const index = Number(parts[5]),
          count = JSON.parse(job.snapshot).slides.length;
        if (!Number.isInteger(index) || index < 0 || index >= count)
          fail(400, "Nomor slide tidak valid.");
        if (req.headers.get("content-type") !== "image/jpeg")
          fail(400, "Unggah gambar JPEG.");
        const reader = req.body?.getReader();
        if (!reader) fail(400, "Gambar kosong.");
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader!.read();
          if (done) break;
          length += value.length;
          if (length > 8 * 1024 * 1024) {
            await reader!.cancel();
            fail(413, "Gambar maksimal 8 MB.");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        try {
          const size = imageSize(bytes);
          if (
            size.type !== "jpg" ||
            size.width !== 1080 ||
            size.height !==
              (JSON.parse(job.snapshot).format === "portrait" ? 1350 : 1080)
          )
            throw Error();
        } catch {
          fail(
            400,
            `Gambar harus JPEG 1080 × ${JSON.parse(job.snapshot).format === "portrait" ? 1350 : 1080}.`,
          );
        }
        await saveMedia(env, job.id, index, bytes, job.expires);
        return json({ ok: true });
      }
      if (parts[4] === "advance" && parts.length === 5 && method === "POST") {
        await rateLimit(env.DB, `ig-advance:${user.id}`, 120, 60);
        await refreshConnections(env);
        await advanceJob(env, job.id);
        return json(
          publicJob(
            await ownedJob(env, user.id, job.id),
            await uploads(env, job.id),
          ),
        );
      }
      if (parts[4] === "publish" && parts.length === 5 && method === "POST") {
        if (job.status !== "preparing")
          return json(publicJob(job, await uploads(env, job.id)));
        const c = await usableConnection(env, user.id);
        if (c.id !== job.connection_id)
          fail(409, "Akun tujuan berubah. Buat persiapan posting baru.");
        if (job.expires <= now())
          fail(409, "Persiapan kedaluwarsa. Buat posting baru.");
        const slides = await uploads(env, job.id),
          count = JSON.parse(job.snapshot).slides.length;
        if (slides.length !== count || slides.some((s, i) => s.position !== i))
          fail(409, "Upload semua slide sebelum posting.");
        await env.DB.prepare(
          "UPDATE instagram_jobs SET status='queued',updated=? WHERE id=? AND status='preparing'",
        )
          .bind(now(), job.id)
          .run();
        return json(
          publicJob(await ownedJob(env, user.id, job.id), slides),
          202,
        );
      }
    }
    return fail(404, "Endpoint Instagram tidak ditemukan.");
  });
