import { fail, now } from "./core";
import type { InstagramEnv } from "./instagram-common";

// D1 limits individual values: keep each JPEG in bounded BLOB rows.
const CHUNK_SIZE = 256 * 1024;
export async function saveMedia(
  env: InstagramEnv,
  job: string,
  position: number,
  bytes: Uint8Array,
  expires: number,
) {
  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      "DELETE FROM instagram_media_chunks WHERE upload_id IN (SELECT upload_id FROM instagram_slides WHERE job_id=? AND position=?) AND EXISTS (SELECT 1 FROM instagram_jobs WHERE id=? AND status='preparing' AND expires>?)",
    ).bind(job, position, job, now()),
  ];
  for (
    let offset = 0, part = 0;
    offset < bytes.length;
    offset += CHUNK_SIZE, part++
  ) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO instagram_media_chunks(upload_id,part,data,expires) SELECT ?,?,?,? FROM instagram_jobs WHERE id=? AND status='preparing' AND expires>?",
      ).bind(
        id,
        part,
        bytes.slice(offset, offset + CHUNK_SIZE).buffer,
        expires,
        job,
        now(),
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      "INSERT INTO instagram_slides(job_id,position,upload_id) SELECT id,?,? FROM instagram_jobs WHERE id=? AND status='preparing' AND expires>? ON CONFLICT(job_id,position) DO UPDATE SET upload_id=excluded.upload_id WHERE EXISTS (SELECT 1 FROM instagram_jobs WHERE id=? AND status='preparing' AND expires>?)",
    ).bind(position, id, job, now(), job, now()),
  );
  const result = await env.DB.batch(statements);
  if (!result[result.length - 1].meta.changes)
    fail(409, "Persiapan sudah ditutup.");
}

export async function readMedia(
  env: InstagramEnv,
  job: string,
  position: number,
  expires: number,
) {
  const result = await env.DB.prepare(
    "SELECT c.part,c.data FROM instagram_media_chunks c JOIN instagram_slides s ON s.upload_id=c.upload_id JOIN instagram_jobs j ON j.id=s.job_id WHERE s.job_id=? AND s.position=? AND j.expires=? AND c.expires>? ORDER BY c.part",
  )
    .bind(job, position, expires, now())
    .all<{ part: number; data: number[] | ArrayBuffer }>();
  if (!result.results.length || result.results.some((r, i) => r.part !== i))
    return null;
  const chunks = result.results.map((r) => new Uint8Array(r.data));
  const bytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Opportunistic, bounded cleanup: no extra service or scheduled worker.
export async function cleanExpiredMedia(env: InstagramEnv) {
  await env.DB.prepare(
    "DELETE FROM instagram_media_chunks WHERE rowid IN (SELECT rowid FROM instagram_media_chunks WHERE expires<? LIMIT 256)",
  )
    .bind(now())
    .run();
  await env.DB.prepare("DELETE FROM instagram_states WHERE expires<?")
    .bind(now())
    .run();
  await env.DB.prepare(
    "UPDATE instagram_jobs SET status='failed',error='Persiapan atau pemrosesan kedaluwarsa.',updated=? WHERE expires<? AND status IN ('preparing','queued','processing')",
  )
    .bind(now(), now())
    .run();
  await env.DB.prepare(
    "UPDATE instagram_jobs SET status='verifying',error='Hasil publikasi belum dapat dipastikan. Periksa profil Instagram sebelum posting ulang.' WHERE expires<? AND status IN ('publishing','verifying')",
  )
    .bind(now())
    .run();
}
