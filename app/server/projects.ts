import { validateProject, normalizeProject, type Project } from "../model";
import { type DB, fail, now } from "./core";
import { loadImage } from "./images";
export async function get(db: DB, owner: string, id: string): Promise<Project> {
  const row = await db
    .prepare(
      "SELECT document,revision,updated FROM projects WHERE id=? AND user_id=?",
    )
    .bind(id, owner)
    .first<{ document: string; revision: number; updated: number }>();
  if (!row) return fail(404, "Proyek tidak ditemukan.");
  return {
    ...normalizeProject(JSON.parse(row.document)),
    revision: row.revision,
    updated: row.updated,
  };
}
export async function list(db: DB, owner: string) {
  const rows = await db
    .prepare(
      "SELECT document,revision,updated FROM projects WHERE user_id=? ORDER BY updated DESC",
    )
    .bind(owner)
    .all<{ document: string; revision: number; updated: number }>();
  return rows.results.map(
    (r) =>
      ({
        ...normalizeProject(JSON.parse(r.document)),
        revision: r.revision,
        updated: r.updated,
      }) as Project,
  );
}
export async function save(
  db: DB,
  owner: string,
  input: unknown,
  create = false,
) {
  let p: Project;
  try {
    p = normalizeProject(input);
    validateProject(p);
  } catch (e) {
    return fail(400, (e as Error).message);
  }
  const old = create ? undefined : await get(db, owner, p.id);
  if (
    !create &&
    (!Number.isSafeInteger(p.revision) || p.revision !== old!.revision)
  )
    fail(
      409,
      "Proyek telah berubah. Muat versi cloud atau simpan sebagai proyek baru.",
    );
  const used = new Set(p.slides.map((s) => s.image).filter(Boolean));
  p.assets = Object.fromEntries(
    Object.entries(p.assets).filter(([id]) => used.has(id)),
  );
  for (const [id, url] of Object.entries(p.assets)) {
    const matching =
      old?.assets[id] === url &&
      old.slides.find((s) => s.image === id && s.imageWidth && s.imageHeight);
    const info = matching
      ? { width: matching.imageWidth!, height: matching.imageHeight! }
      : await loadImage(url);
    for (const slide of p.slides.filter((s) => s.image === id)) {
      slide.imageWidth = info.width;
      slide.imageHeight = info.height;
    }
  }
  p.updated = now();
  p.revision = create ? 1 : old!.revision! + 1;
  if (create) {
    // Generate server-owned IDs; a supplied ID never selects another user's project.
    p.id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO projects(id,user_id,revision,updated,document) VALUES (?,?,?,?,?)",
      )
      .bind(p.id, owner, 1, p.updated, JSON.stringify(p))
      .run();
  } else {
    const result = await db
      .prepare(
        "UPDATE projects SET revision=?,updated=?,document=? WHERE id=? AND user_id=? AND revision=?",
      )
      .bind(
        p.revision,
        p.updated,
        JSON.stringify(p),
        p.id,
        owner,
        old!.revision,
      )
      .run();
    if (!result.meta.changes)
      fail(
        409,
        "Proyek telah berubah. Muat versi cloud atau simpan sebagai proyek baru.",
      );
  }
  return p;
}
export async function remove(
  db: DB,
  owner: string,
  id: string,
  revision: number,
) {
  const result = await db
    .prepare("DELETE FROM projects WHERE id=? AND user_id=? AND revision=?")
    .bind(id, owner, revision)
    .run();
  if (!result.meta.changes) {
    await get(db, owner, id);
    fail(409, "Proyek telah berubah. Muat ulang sebelum menghapus.");
  }
}
