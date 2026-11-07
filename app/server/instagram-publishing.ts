import { now } from "./core";
import {
  configured,
  connection,
  connectionExpired,
  decryptToken,
  encryptToken,
  graph,
  mediaURL,
  metaRequest,
  MetaError,
  uploads,
  type InstagramEnv,
  type Job,
} from "./instagram-common";
// Each authenticated advance request makes one durable step. Never repeat media_publish.
export async function advanceJob(
  env: InstagramEnv,
  id: string,
): Promise<boolean> {
  if (!configured(env)) return false;
  const lease = crypto.randomUUID();
  const job = await env.DB.prepare(
    "UPDATE instagram_jobs SET lease=?,lease_until=? WHERE id=? AND status IN ('queued','processing','publishing','verifying') AND lease_until<? RETURNING *",
  )
    .bind(lease, now() + 90000, id, now())
    .first<Job>();
  if (!job) return false;
  const update = async (status: string, error: string | null = null) => {
    await env.DB.prepare(
      "UPDATE instagram_jobs SET status=?,error=?,updated=? WHERE id=? AND lease=? AND status NOT IN ('failed','published')",
    )
      .bind(status, error, now(), id, lease)
      .run();
    job.status = status;
  };
  try {
    if (job.user_id !== env.INSTAGRAM_OWNER_ID) {
      await update("failed", "Akses pilot Instagram tidak aktif.");
      return false;
    }
    const c = await connection(env, job.user_id);
    if (!c || c.id !== job.connection_id || c.reconnect || connectionExpired(c)) {
      // Publishing might already have reached Meta; don't present this as safe to retry.
      await update(
        ["publishing", "verifying"].includes(job.status)
          ? "verifying"
          : "failed",
        "Koneksi berubah atau kedaluwarsa. Periksa Instagram sebelum membuat posting baru.",
      );
      return false;
    }
    if (job.expires <= now()) {
      await update(
        ["publishing", "verifying"].includes(job.status)
          ? "verifying"
          : "failed",
        "Waktu pemrosesan habis. Periksa akun Instagram sebelum membuat posting baru.",
      );
      return false;
    }
    const token = await decryptToken(
      c.token,
      env.INSTAGRAM_TOKEN_KEY!,
      c.user_id,
    );
    if (["publishing", "verifying"].includes(job.status)) {
      await update(
        "verifying",
        "Memverifikasi hasil publikasi. Jangan posting ulang sebelum hasilnya diketahui.",
      );
      if (!job.parent_id) return false;
      const result = await graph<{ status_code: string }>(
        env,
        token,
        job.parent_id,
        { fields: "status_code" },
      );
      if (result.status_code === "PUBLISHED") {
        await update(
          "published",
          job.media_id
            ? null
            : "Instagram mengonfirmasi publikasi. Buka profil Instagram untuk melihat posting.",
        );
        return false;
      }
      // FINISHED after a network failure is ambiguous: never resend media_publish.
      if (["ERROR", "EXPIRED"].includes(result.status_code)) {
        await update(
          "failed",
          "Instagram tidak menyelesaikan publikasi. Periksa profil sebelum mencoba lagi.",
        );
        return false;
      }
      return true;
    }
    await update("processing");
    const slides = await uploads(env, id),
      count = JSON.parse(job.snapshot).slides.length;
    if (slides.length !== count || slides.some((s, i) => s.position !== i)) {
      await update("failed", "Slide tidak lengkap. Buat persiapan baru.");
      return false;
    }
    const missing = slides.find((s) => !s.container_id);
    if (missing) {
      const child = await graph<{ id: string }>(
        env,
        token,
        `${job.account_id}/media`,
        {
          image_url: await mediaURL(env, job, missing.position),
          is_carousel_item: "true",
        },
        true,
      );
      if (!child.id) throw new MetaError(0, true);
      await env.DB.prepare(
        "UPDATE instagram_slides SET container_id=? WHERE job_id=? AND position=?",
      )
        .bind(child.id, id, missing.position)
        .run();
      return true;
    }
    const waiting = slides.find((s) => !s.ready);
    if (waiting) {
      const result = await graph<{ status_code: string }>(
        env,
        token,
        waiting.container_id!,
        { fields: "status_code" },
      );
      if (["ERROR", "EXPIRED"].includes(result.status_code)) {
        await update(
          "failed",
          `Instagram gagal memproses slide ${waiting.position + 1}. Buat persiapan baru.`,
        );
        return false;
      }
      if (result.status_code === "FINISHED")
        await env.DB.prepare(
          "UPDATE instagram_slides SET ready=1 WHERE job_id=? AND position=?",
        )
          .bind(id, waiting.position)
          .run();
      return true;
    }
    if (!job.parent_id) {
      const parent = await graph<{ id: string }>(
        env,
        token,
        `${job.account_id}/media`,
        {
          media_type: "CAROUSEL",
          children: slides.map((s) => s.container_id).join(","),
          caption: job.caption,
        },
        true,
      );
      if (!parent.id) throw new MetaError(0, true);
      await env.DB.prepare(
        "UPDATE instagram_jobs SET parent_id=?,updated=? WHERE id=? AND lease=?",
      )
        .bind(parent.id, now(), id, lease)
        .run();
      return true;
    }
    const parent = await graph<{ status_code: string }>(
      env,
      token,
      job.parent_id,
      { fields: "status_code" },
    );
    if (["ERROR", "EXPIRED"].includes(parent.status_code)) {
      await update(
        "failed",
        "Carousel ditolak Instagram. Periksa izin dan batas publikasi akun.",
      );
      return false;
    }
    if (parent.status_code !== "FINISHED") return true;
    // Re-check connection and job status immediately before the irreversible request.
    const current = await connection(env, job.user_id);
    if (current?.id !== job.connection_id) {
      await update("failed", "Koneksi Instagram berubah.");
      return false;
    }
    const claimed = await env.DB.prepare(
      "UPDATE instagram_jobs SET status='publishing',updated=? WHERE id=? AND lease=? AND status='processing'",
    )
      .bind(now(), id, lease)
      .run();
    if (!claimed.meta.changes) return false;
    job.status = "publishing";
    const published = await graph<{ id: string }>(
      env,
      token,
      `${job.account_id}/media_publish`,
      { creation_id: job.parent_id },
      true,
    );
    if (!published.id) throw new MetaError(0, true);
    // Persist success before fetching optional metadata, so a failed permalink fetch can't republish.
    await env.DB.prepare(
      "UPDATE instagram_jobs SET media_id=?,status='published',updated=? WHERE id=? AND lease=?",
    )
      .bind(published.id, now(), id, lease)
      .run();
    job.status = "published";
    try {
      const media = await graph<{ permalink: string }>(
        env,
        token,
        published.id,
        { fields: "permalink" },
      );
      if (media.permalink?.startsWith("https://www.instagram.com/"))
        await env.DB.prepare(
          "UPDATE instagram_jobs SET permalink=? WHERE id=? AND lease=?",
        )
          .bind(media.permalink, id, lease)
          .run();
    } catch {
      /* Success remains durable; user can open their profile. */
    }
    return false;
  } catch (error) {
    if (error instanceof MetaError && error.code === 190)
      await env.DB.prepare(
        "UPDATE instagram_connections SET reconnect=1 WHERE user_id=? AND id=?",
      )
        .bind(job.user_id, job.connection_id)
        .run();
    if (job.status === "published") return false;
    if (["publishing", "verifying"].includes(job.status)) {
      await update(
        "verifying",
        "Hasil publikasi belum pasti. Sedang diverifikasi; jangan posting ulang.",
      );
      return true;
    }
    if (error instanceof MetaError && error.transient) {
      await update(
        "processing",
        "Instagram belum merespons. Pemrosesan akan dicoba kembali.",
      );
      return true;
    }
    await update(
      "failed",
      error instanceof MetaError
        ? error.message
        : "Pemrosesan gagal. Periksa koneksi Instagram lalu buat persiapan baru.",
    );
    return false;
  } finally {
    await env.DB.prepare(
      "UPDATE instagram_jobs SET lease=NULL,lease_until=0 WHERE id=? AND lease=?",
    )
      .bind(id, lease)
      .run();
  }
}

export async function refreshConnections(env: InstagramEnv) {
  if (!configured(env)) return;
  const c = await connection(env, env.INSTAGRAM_OWNER_ID!);
  // System-user tokens must never enter Instagram User token refresh endpoints.
  if (c?.auth_method === "unified_login") {
    if (connectionExpired(c))
      await env.DB.prepare("UPDATE instagram_connections SET reconnect=1 WHERE user_id=? AND id=?")
        .bind(c.user_id, c.id).run();
    return;
  }
  if (
    !c ||
    c.reconnect ||
    c.expires - now() > 30 * 86400000 ||
    now() - c.refreshed < 86400000
  )
    return;
  if (c.expires <= now()) {
    await env.DB.prepare(
      "UPDATE instagram_connections SET reconnect=1 WHERE user_id=? AND id=?",
    )
      .bind(c.user_id, c.id)
      .run();
    return;
  }
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: await decryptToken(
        c.token,
        env.INSTAGRAM_TOKEN_KEY!,
        c.user_id,
      ),
    }).toString();
    const fresh = await metaRequest<{
      access_token: string;
      expires_in: number;
    }>(url.href);
    if (!fresh.access_token || !(fresh.expires_in > 0))
      throw new MetaError(0, false);
    await env.DB.prepare(
      "UPDATE instagram_connections SET token=?,expires=?,refreshed=? WHERE user_id=? AND id=? AND token=?",
    )
      .bind(
        await encryptToken(
          fresh.access_token,
          env.INSTAGRAM_TOKEN_KEY!,
          c.user_id,
        ),
        now() + fresh.expires_in * 1000,
        now(),
        c.user_id,
        c.id,
        c.token,
      )
      .run();
  } catch (error) {
    if (!(error instanceof MetaError) || !error.transient)
      await env.DB.prepare(
        "UPDATE instagram_connections SET reconnect=1 WHERE user_id=? AND id=?",
      )
        .bind(c.user_id, c.id)
        .run();
  }
}
