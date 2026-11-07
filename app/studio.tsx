"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  Undo2,
  Redo2,
  Grid2X2,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings2,
  FileText,
  CheckCheck,
  ExternalLink,
  GripVertical,
  Loader2,
  AlertCircle,
  Camera as Instagram,
} from "lucide-react";
import {
  api,
  ApiError,
  imageSource,
  dimensions,
  newProject,
  exampleProject,
  newSlide,
  uid,
  layouts,
  saveProject,
  getProject,
  listProjects,
  deleteProject,
  effectiveStyle,
  type Project,
  type Slide,
  type Style,
  type Layout,
} from "./model";
import { SlideArt, slideWarnings } from "./slide";
import { exportPNG } from "./transfer";
import { InstagramPublisher } from "./instagram";

import { Header, Logo, Button, IconButton, Modal } from "./ui";

function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p className="error-note" role="alert">
      <AlertCircle size={16} />
      {message}
    </p>
  ) : null;
}
async function create(example = false) {
  const p = example ? exampleProject() : newProject();
  await saveProject(p);
  window.location.href = `/editor/${p.id}`;
}

export function Home() {
  const [demo, setDemo] = useState<Project>();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const p = exampleProject();
    p.assets.conversation = "/example-conversation.jpg";
    setDemo(p);
  }, []);
  return (
    <main className="landing">
      <div className="landing-hero">
        <div className="landing-copy">
          <div className="landing-brand">
            <Logo href="/" />
          </div>
          <h1>
            Idemu layak
            <br />
            dibaca sampai
            <br />
            slide terakhir.
          </h1>
          <p>
            Tulis ceritamu. Tambahkan gambar. Susun jadi carousel yang jelas dan
            enak dibaca.
          </p>
          <a className="button" href="/proyek">
            Buka dashboard
          </a>
          <p className="landing-note">
            Teks atau teks + gambar. Sesederhana itu.
          </p>
        </div>
        <div className="landing-preview">
          <div className="hero-slide">
            {demo && (
              <SlideArt
                project={demo}
                slide={demo.slides[index]}
                index={index}
                publicImages
              />
            )}
          </div>
          <div className="sample-controls">
            <span>Contoh carousel</span>
            <div className="sample-pagination">
              <IconButton
                label="Contoh sebelumnya"
                onClick={() => setIndex((index + 4) % 5)}
              >
                <ChevronLeft size={18} />
              </IconButton>
              <span>{index + 1} / 5</span>
              <IconButton
                label="Contoh berikutnya"
                onClick={() => setIndex((index + 1) % 5)}
              >
                <ChevronRight size={18} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-how">
        <h2>Dari tulisan ke carousel.</h2>
        <div>
          <p>
            <strong>Tulis.</strong> Satu gagasan per slide, dengan paragraf dan
            penekanan yang kamu tentukan.
          </p>
          <p>
            <strong>Susun.</strong> Pilih teks atau teks + gambar. Lihat
            komposisinya langsung saat mengedit.
          </p>
          <p>
            <strong>Unduh.</strong> Dapatkan PNG 1080 × 1350, atau siapkan
            posting ke Instagram.
          </p>
        </div>
      </div>
    </main>
  );
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project>();
  async function refresh() {
    try {
      setProjects((await listProjects()).sort((a, b) => b.updated - a.updated));
      setError("");
    } catch {
      setError(
        "Proyek belum bisa dibaca. Periksa koneksi internet lalu muat ulang.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tindakan gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header active="projects" />
      <main className="projects-page workspace-page" aria-busy={loading}>
        <div className="page-title">
          <div>
            <h1>
              Dashboard<span className="title-count">{projects.length}</span>
            </h1>
            <p>Semua carousel yang sedang kamu kerjakan.</p>
          </div>
          <div className="action-row">
            <Button onClick={() => action(() => create())} disabled={busy}>
              <Plus size={18} /> Buat carousel
            </Button>
          </div>
        </div>
        {error && (
          <div className="dashboard-error">
            <ErrorNote message={error} />
            <button
              className="text-link"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
            >
              Coba lagi
            </button>
          </div>
        )}
        {loading ? (
          <div className="project-grid" aria-label="Memuat proyek">
            {[0, 1, 2].map((i) => (
              <div className="project-skeleton" key={i}>
                <div />
                <span />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <h2>Setiap cerita dimulai dari satu ide.</h2>
            <p>Buat carousel pertamamu. Kami siapkan ruangnya.</p>
            <Button onClick={() => action(() => create())} disabled={busy}>
              <Plus size={17} /> Buat carousel
            </Button>
            <button
              className="text-link"
              onClick={() => action(() => create(true))}
            >
              Atau mulai dari contoh <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <article className="project-card" key={p.id}>
                <a href={`/editor/${p.id}`} className="project-preview">
                  <SlideArt project={p} slide={p.slides[0]} />
                  <span className="open-project">
                    Buka editor <ExternalLink size={15} />
                  </span>
                </a>
                <div className="project-info">
                  <a href={`/editor/${p.id}`}>
                    <h3>{p.title}</h3>
                  </a>
                  <p>
                    {p.slides.length} slide <span>·</span>{" "}
                    {new Date(p.updated).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Jakarta",
                    })}
                  </p>
                  <details className="project-actions">
                    <summary aria-label={`Tindakan ${p.title}`}>•••</summary>
                    <div className="project-action-menu">
                      <IconButton
                        label={`Duplikasi ${p.title}`}
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            await saveProject({
                              ...structuredClone(p),
                              id: uid(),
                              revision: undefined,
                              title: p.title + " (salinan)",
                              updated: Date.now(),
                            });
                            await refresh();
                          })
                        }
                      >
                        <Copy size={16} />
                        <span>Duplikasi</span>
                      </IconButton>
                      <IconButton
                        label={`Hapus ${p.title}`}
                        disabled={busy}
                        onClick={() => setPendingDelete(p)}
                      >
                        <Trash2 size={16} />
                        <span>Hapus</span>
                      </IconButton>
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {pendingDelete && (
        <Modal title="Hapus proyek?" close={() => setPendingDelete(undefined)}>
          <p>
            “{pendingDelete.title}” akan dihapus dari akunmu. Tindakan ini tidak
            bisa dibatalkan.
          </p>
          <div className="action-row">
            <Button secondary onClick={() => setPendingDelete(undefined)}>
              Batal
            </Button>
            <Button
              onClick={() =>
                action(async () => {
                  await deleteProject(
                    pendingDelete.id,
                    pendingDelete.revision!,
                  );
                  setPendingDelete(undefined);
                  await refresh();
                })
              }
              disabled={busy}
            >
              Hapus proyek
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Editor() {
  const [project, setProject] = useState<Project>();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState("isi");
  const [mobile, setMobile] = useState("kanvas");
  const [scope, setScope] = useState("semua");
  const [status, setStatus] = useState("Tersimpan di cloud");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [download, setDownload] = useState(false);
  const [instagram, setInstagram] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revision, setRevision] = useState(0);
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const textInput = useRef<HTMLTextAreaElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const dirty = useRef(false);
  const saving = useRef(false);
  const serverRevision = useRef<number | undefined>(undefined);
  const dragging = useRef<number | null>(null);
  const projectRef = useRef<Project | undefined>(undefined);

  async function saveForInstagram(): Promise<Project> {
    const deadline = Date.now() + 30000;
    while (saving.current) {
      if (Date.now() > deadline)
        throw Error(
          "Penyimpanan belum selesai. Coba lagi setelah proyek tersimpan.",
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (conflictRef.current)
      throw Error("Selesaikan konflik versi cloud sebelum posting.");
    const source = projectRef.current!;
    if (!dirty.current)
      return structuredClone({ ...source, revision: serverRevision.current });
    saving.current = true;
    setStatus("Menyimpan…");
    try {
      const saved = await saveProject({
        ...structuredClone(source),
        revision: serverRevision.current,
      });
      serverRevision.current = saved.revision;
      if (projectRef.current !== source) {
        setRevision((v) => v + 1);
        throw Error(
          "Proyek berubah saat menyimpan. Periksa dan siapkan posting kembali.",
        );
      }
      projectRef.current = saved;
      dirty.current = false;
      setProject(saved);
      setStatus("Tersimpan di cloud");
      return saved;
    } catch (e) {
      if (e instanceof ApiError && [409, 404].includes(e.status)) {
        conflictRef.current = true;
        setConflict(true);
        setStatus("Perubahan bertabrakan");
      } else setStatus("Gagal menyimpan");
      throw e;
    } finally {
      saving.current = false;
    }
  }

  useEffect(() => {
    const id = decodeURIComponent(
      window.location.pathname.split("/").filter(Boolean).pop() || "",
    );
    getProject(id)
      .then((p) => {
        projectRef.current = p;
        serverRevision.current = p.revision;
        setProject(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!project || !dirty.current || conflictRef.current) return;
    setStatus("Menyimpan…");
    const timer = setTimeout(async () => {
      if (saving.current || conflictRef.current) return;
      saving.current = true;
      const source = projectRef.current!;
      const snapshot = {
        ...structuredClone(source),
        revision: serverRevision.current,
      };
      try {
        const saved = await saveProject(snapshot);
        serverRevision.current = saved.revision;
        if (projectRef.current === source) {
          dirty.current = false;
          projectRef.current = saved;
          setProject(saved);
          setStatus("Tersimpan di cloud");
        } else setRevision((v) => v + 1);
      } catch (e) {
        if (e instanceof ApiError && [409, 404].includes(e.status)) {
          conflictRef.current = true;
          setConflict(true);
          setStatus("Perubahan bertabrakan");
        } else {
          setStatus("Gagal menyimpan");
          setError((e as Error).message);
        }
      } finally {
        saving.current = false;
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [project, revision]);
  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      const p = projectRef.current;
      if (
        document.visibilityState !== "visible" ||
        !p ||
        saving.current ||
        conflictRef.current
      )
        return;
      try {
        const latest = await getProject(p.id);
        if (stopped || saving.current) return;
        if (latest.revision! <= serverRevision.current!) {
          if (!dirty.current) setStatus("Tersimpan di cloud");
          return;
        }
        if (dirty.current) {
          conflictRef.current = true;
          setConflict(true);
          setStatus("Perubahan bertabrakan");
        } else {
          serverRevision.current = latest.revision;
          projectRef.current = latest;
          past.current = [];
          future.current = [];
          setActive((i) => Math.min(i, latest.slides.length - 1));
          setProject(latest);
          setStatus("Tersimpan di cloud");
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          conflictRef.current = true;
          setConflict(true);
          setStatus("Proyek dihapus di cloud");
        } else if (!stopped) setStatus("Gagal memeriksa cloud");
      }
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  async function resolveConflict(copy: boolean) {
    if (saving.current) return;
    setBusy(true);
    try {
      if (copy) {
        const source = projectRef.current!;
        const p = {
          ...structuredClone(source),
          id: uid(),
          revision: undefined,
          title: projectRef.current!.title + " (salinan)",
        };
        await saveProject(p);
        if (projectRef.current !== source) {
          setError(
            "Salinan telah dibuat. Ada edit baru di editor ini; simpan lagi sebelum berpindah.",
          );
          return;
        }
        dirty.current = false;
        location.assign(`/editor/${p.id}`);
      } else {
        let latest: Project;
        try {
          latest = await getProject(projectRef.current!.id);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            dirty.current = false;
            location.assign("/proyek");
            return;
          }
          throw e;
        }
        dirty.current = false;
        serverRevision.current = latest.revision;
        projectRef.current = latest;
        past.current = [];
        future.current = [];
        setActive(0);
        setProject(latest);
        conflictRef.current = false;
        setConflict(false);
        setStatus("Tersimpan di cloud");
        setError("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(fn: (p: Project) => void) {
    const current = projectRef.current;
    if (!current) return;
    past.current.push(structuredClone(current));
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    const next = structuredClone(current);
    fn(next);
    const used = new Set(next.slides.map((s) => s.image));
    next.assets = Object.fromEntries(
      Object.entries(next.assets).filter(([id]) => used.has(id)),
    );
    next.updated = Date.now();
    dirty.current = true;
    projectRef.current = next;
    setProject(next);
    setError("");
  }
  function undo() {
    if (!project || !past.current.length) return;
    future.current.push(project);
    const p = past.current.pop()!;
    setActive(Math.min(active, p.slides.length - 1));
    const next = { ...p, updated: Date.now() };
    dirty.current = true;
    projectRef.current = next;
    setProject(next);
  }
  function redo() {
    if (!project || !future.current.length) return;
    past.current.push(project);
    const p = future.current.pop()!;
    setActive(Math.min(active, p.slides.length - 1));
    const next = { ...p, updated: Date.now() };
    dirty.current = true;
    projectRef.current = next;
    setProject(next);
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        setRevision((v) => v + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  if (loading)
    return (
      <div className="editor-loading">
        <Loader2 className="spin" /> Membuka studio…
      </div>
    );
  if (!project)
    return (
      <>
        <Header />
        <div className="empty-state">
          <ErrorNote message={error} />
          <a className="button" href="/proyek">
            Kembali ke proyek
          </a>
        </div>
      </>
    );
  const p = project,
    s = p.slides[Math.min(active, p.slides.length - 1)],
    style = effectiveStyle(p, s);
  const warnings = slideWarnings(p, s);
  const warningCount = p.slides.filter(
    (s) => slideWarnings(p, s).length,
  ).length;
  function updateSlide(values: Partial<Slide>) {
    change((p) => Object.assign(p.slides[active], values));
  }
  function updateStyle(values: Partial<Style>) {
    change((p) => {
      if (scope === "semua") {
        Object.assign(p.style, values);
        for (const slide of p.slides)
          for (const key of Object.keys(values))
            delete slide.style[key as keyof Style];
      } else Object.assign(p.slides[active].style, values);
    });
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= p.slides.length || from === to) return;
    change((p) => {
      const [item] = p.slides.splice(from, 1);
      p.slides.splice(to, 0, item);
    });
    setActive(to);
  }
  async function addImage() {
    const targetSlide = s.id;
    setImageBusy(true);
    setError("");
    try {
      const url = imageUrl.trim();
      const info = await api<{ width: number; height: number }>("/api/images", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      change((p) => {
        const slide = p.slides.find((s) => s.id === targetSlide);
        if (!slide) return;
        const id = uid();
        p.assets[id] = url;
        Object.assign(slide, {
          image: id,
          imageWidth: info.width,
          imageHeight: info.height,
          zoom: 1,
          x: 50,
          y: 50,
        });
      });
      setImageUrl("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImageBusy(false);
    }
  }
  function split() {
    if (p.slides.length >= 20 || s.text.length < 2) return;
    const middle = Math.floor(s.text.length / 2);
    let at = s.text.lastIndexOf("\n", middle);
    if (at < 1) at = s.text.lastIndexOf(" ", middle);
    if (at < 1) at = middle;
    change((p) => {
      const old = p.slides[active];
      const next = {
        ...structuredClone(old),
        id: uid(),
        text: old.text.slice(at),
      };
      old.text = old.text.slice(0, at);
      p.slides.splice(active + 1, 0, next);
    });
  }
  return (
    <div className="editor-app">
      <header className="editor-header">
        <div className="editor-brand">
          <Logo compact />
          <span className="header-divider" />
          <a href="/proyek" className="back-projects" title="Kembali ke proyek">
            <ChevronLeft size={17} />
            <span>Dashboard</span>
          </a>
        </div>
        <div className="project-title-edit">
          <input
            aria-label="Judul proyek"
            value={p.title}
            onChange={(e) =>
              change((p) => {
                p.title = e.target.value;
              })
            }
          />
          <span
            className={
              status === "Gagal menyimpan"
                ? "save-status failed"
                : "save-status"
            }
            role="status"
          >
            {status === "Tersimpan di cloud" ? (
              <CheckCheck size={13} />
            ) : status === "Gagal menyimpan" ? (
              <AlertCircle size={13} />
            ) : (
              <span className="save-dot" />
            )}
            {status}
            {status === "Gagal menyimpan" && (
              <button onClick={() => setRevision((v) => v + 1)}>
                Coba lagi
              </button>
            )}
          </span>
        </div>
        <div className="editor-header-actions">
          <div className="history-buttons">
            <IconButton
              label="Urungkan (Ctrl+Z)"
              onClick={undo}
              disabled={!past.current.length}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              label="Ulangi (Ctrl+Shift+Z)"
              onClick={redo}
              disabled={!future.current.length}
            >
              <Redo2 size={18} />
            </IconButton>
          </div>
          <Button secondary onClick={() => setReview(true)}>
            <Grid2X2 size={16} />
            <span>Tinjau</span>
          </Button>
          <Button secondary onClick={() => setInstagram(true)}>
            <Instagram size={16} />
            <span>Instagram</span>
          </Button>
          <Button
            onClick={() => {
              setDownload(true);
              setError("");
            }}
          >
            <Download size={16} />
            <span>Unduh</span>
          </Button>
        </div>
      </header>
      {conflict && (
        <div className="conflict-banner" role="alert">
          <p>Proyek di cloud telah berubah. Edit lokal belum disimpan.</p>
          <button disabled={busy} onClick={() => void resolveConflict(false)}>
            Muat versi cloud
          </button>
          <button disabled={busy} onClick={() => void resolveConflict(true)}>
            Simpan sebagai proyek baru
          </button>
        </div>
      )}
      <div className="mobile-tools">
        <button
          aria-pressed={mobile === "slides"}
          className={mobile === "slides" ? "active" : ""}
          onClick={() => setMobile("slides")}
        >
          <Layers size={16} /> Slide
        </button>
        <button
          aria-pressed={mobile === "kanvas"}
          className={mobile === "kanvas" ? "active" : ""}
          onClick={() => setMobile("kanvas")}
        >
          <Grid2X2 size={16} /> Kanvas
        </button>
        <button
          aria-pressed={mobile === "settings"}
          className={mobile === "settings" ? "active" : ""}
          onClick={() => setMobile("settings")}
        >
          <Settings2 size={16} /> Pengaturan
        </button>
      </div>
      <div className="editor-workspace">
        <aside
          className={`slide-sidebar ${mobile === "slides" ? "mobile-show" : ""}`}
        >
          <div className="sidebar-heading">
            <span>
              Slide <small>{p.slides.length}/20</small>
            </span>
            <IconButton
              label="Tambah slide"
              disabled={p.slides.length >= 20}
              onClick={() => {
                change((p) => {
                  p.slides.splice(active + 1, 0, newSlide());
                });
                setActive(active + 1);
              }}
            >
              <Plus size={18} />
            </IconButton>
          </div>
          <div className="thumbnail-list">
            {p.slides.map((slide, i) => (
              <div
                key={slide.id}
                className={`thumbnail-row ${i === active ? "selected" : ""}`}
                draggable
                onDragStart={() => {
                  dragging.current = i;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging.current !== null) move(dragging.current, i);
                  dragging.current = null;
                }}
              >
                <span className="thumb-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <button
                  className="thumbnail"
                  aria-label={`Edit slide ${i + 1}: ${slide.text.slice(0, 70) || layouts[slide.layout]}`}
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => {
                    setActive(i);
                    setMobile("kanvas");
                  }}
                >
                  <SlideArt project={p} slide={slide} index={i} guides />
                </button>
                <span className="thumb-layout">{layouts[slide.layout]}</span>
              </div>
            ))}
          </div>
          <button
            className="add-slide"
            disabled={p.slides.length >= 20}
            onClick={() => {
              change((p) => {
                p.slides.splice(active + 1, 0, newSlide());
              });
              setActive(active + 1);
            }}
          >
            <Plus size={17} /> Tambah slide
          </button>
          <p className="sidebar-hint">
            <GripVertical size={13} /> Geser untuk mengurutkan
          </p>
        </aside>
        <main
          className={`canvas-area ${mobile === "kanvas" ? "mobile-show" : ""}`}
        >
          <div className="canvas-topline">
            <span>{layouts[s.layout]}</span>
            <span>1080 × {dimensions(p).height} px</span>
          </div>
          <div className="canvas-wrap">
            <div
              className="main-canvas"
              style={
                {
                  "--slide-ratio": `1080 / ${dimensions(p).height}`,
                  "--canvas-ratio": 1080 / dimensions(p).height,
                } as React.CSSProperties
              }
            >
              <SlideArt project={p} slide={s} index={active} guides />
            </div>
          </div>
          <div className="canvas-bottom">
            <div className="slide-position">
              <IconButton
                label="Slide sebelumnya"
                onClick={() => setActive(active - 1)}
                disabled={active === 0}
              >
                <ChevronLeft size={17} />
              </IconButton>
              <span>
                Slide {active + 1}{" "}
                <span className="muted">dari {p.slides.length}</span>
              </span>
              <IconButton
                label="Slide berikutnya"
                onClick={() => setActive(active + 1)}
                disabled={active === p.slides.length - 1}
              >
                <ChevronRight size={17} />
              </IconButton>
            </div>
            <div className="slide-tools">
              <IconButton
                label="Pindah ke atas"
                onClick={() => move(active, active - 1)}
                disabled={active === 0}
              >
                <ArrowUp size={16} />
              </IconButton>
              <IconButton
                label="Pindah ke bawah"
                onClick={() => move(active, active + 1)}
                disabled={active === p.slides.length - 1}
              >
                <ArrowDown size={16} />
              </IconButton>
              <IconButton
                label="Duplikasi slide"
                disabled={p.slides.length >= 20}
                onClick={() => {
                  change((p) => {
                    p.slides.splice(active + 1, 0, {
                      ...structuredClone(s),
                      id: uid(),
                    });
                  });
                  setActive(active + 1);
                }}
              >
                <Copy size={16} />
              </IconButton>
              <IconButton
                label="Hapus slide"
                disabled={p.slides.length <= 5}
                onClick={() => {
                  change((p) => {
                    p.slides.splice(active, 1);
                  });
                  setActive(Math.max(0, active - 1));
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
          <p className="canvas-tip">
            Satu slide, satu gagasan. Beri ruang untuk dipahami.
          </p>
        </main>
        <aside
          className={`inspector ${mobile === "settings" ? "mobile-show" : ""}`}
        >
          <div className="inspector-tabs">
            <button
              aria-pressed={tab === "isi"}
              className={tab === "isi" ? "active" : ""}
              onClick={() => setTab("isi")}
            >
              <FileText size={16} /> Isi
            </button>
            <button
              aria-pressed={tab === "desain"}
              className={tab === "desain" ? "active" : ""}
              onClick={() => setTab("desain")}
            >
              <Settings2 size={16} /> Desain
            </button>
          </div>
          <div className="inspector-body">
            {tab === "isi" ? (
              <>
                <div className="field">
                  <label htmlFor="layout">Komposisi slide</label>
                  <select
                    id="layout"
                    value={s.layout}
                    onChange={(e) =>
                      updateSlide({ layout: e.target.value as Layout })
                    }
                  >
                    {Object.entries(layouts).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="text-field-heading">
                    <label htmlFor="slide-text">Teks slide</label>
                    <button
                      className="bold-tool"
                      type="button"
                      aria-label="Tebalkan teks terpilih"
                      onClick={() => {
                        const input = textInput.current;
                        if (!input) return;
                        const start = input.selectionStart,
                          end = input.selectionEnd;
                        const selected =
                          s.text.slice(start, end) || "teks tebal";
                        updateSlide({
                          text:
                            s.text.slice(0, start) +
                            "**" +
                            selected +
                            "**" +
                            s.text.slice(end),
                        });
                        requestAnimationFrame(() => {
                          input.focus();
                          input.setSelectionRange(
                            start + 2,
                            start + 2 + selected.length,
                          );
                        });
                      }}
                    >
                      <strong>B</strong>
                      <span>Tebal</span>
                    </button>
                  </div>
                  <textarea
                    ref={textInput}
                    id="slide-text"
                    rows={11}
                    placeholder="Tulis ceritamu di sini…"
                    value={s.text}
                    onChange={(e) => updateSlide({ text: e.target.value })}
                  />
                  <p className="field-help">
                    Pisahkan paragraf dengan baris kosong. Gunakan **teks
                    tebal** untuk penekanan.
                  </p>
                  <span className="field-count">{s.text.length} karakter</span>
                </div>
                {s.layout === "gambar" && (
                  <div className="field">
                    <label htmlFor="image-url">URL gambar</label>
                    <div className="image-url-actions">
                      <input
                        id="image-url"
                        type="url"
                        value={imageUrl}
                        placeholder="https://…/gambar.png"
                        onChange={(e) => setImageUrl(e.target.value)}
                      />
                      <button
                        className="button"
                        disabled={imageBusy || !imageUrl.trim()}
                        onClick={() => void addImage()}
                      >
                        {imageBusy
                          ? "Memeriksa gambar…"
                          : s.image
                            ? "Ganti gambar"
                            : "Tambahkan gambar"}
                      </button>
                    </div>
                    <p className="field-help">
                      Portrait, landscape, atau persegi. PNG, JPEG, WebP,
                      maksimal 12 MB. Gunakan link gambar publik.
                    </p>
                    {s.image && (
                      <>
                        <img
                          className="image-url-preview"
                          src={imageSource(p.assets[s.image])}
                          alt="Gambar slide"
                          onError={() =>
                            setError(
                              "Gambar gagal dimuat. Periksa URL atau ganti gambar.",
                            )
                          }
                        />
                        <p className="field-help">
                          {s.imageWidth} × {s.imageHeight} piksel
                        </p>
                        <Range
                          label="Posisi horizontal"
                          min={0}
                          max={100}
                          value={s.x}
                          onChange={(v) => updateSlide({ x: v })}
                        />
                        <Range
                          label="Posisi vertikal"
                          min={0}
                          max={100}
                          value={s.y}
                          onChange={(v) => updateSlide({ y: v })}
                        />
                        <Range
                          label="Zoom gambar (%)"
                          min={100}
                          max={300}
                          value={Math.round(s.zoom * 100)}
                          onChange={(v) => updateSlide({ zoom: v / 100 })}
                        />
                        <button
                          className="text-link"
                          onClick={() => updateSlide({ x: 50, y: 50, zoom: 1 })}
                        >
                          Reset posisi gambar
                        </button>
                        <button
                          className="danger-link"
                          onClick={() =>
                            updateSlide({
                              image: undefined,
                              imageWidth: undefined,
                              imageHeight: undefined,
                            })
                          }
                        >
                          Hapus gambar
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="inspector-section">
                  <h3>Identitas slide</h3>
                  <CheckField
                    label="Tampilkan nama akun"
                    checked={!s.hideAccount}
                    onChange={(v) => updateSlide({ hideAccount: !v })}
                  />
                  <CheckField
                    label="Tampilkan nomor slide"
                    checked={!s.hideNumber}
                    onChange={(v) => updateSlide({ hideNumber: !v })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="style-scope">Terapkan desain ke</label>
                  <select
                    id="style-scope"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="semua">Seluruh carousel</option>
                    <option value="slide">Slide ini saja</option>
                  </select>
                  <p className="field-help">
                    {scope === "semua"
                      ? "Perubahan menyelaraskan pengaturan ini pada semua slide."
                      : "Pengaturan slide ini dapat berbeda dari gaya utama."}
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="font">Jenis huruf</label>
                  <select
                    id="font"
                    value={style.font}
                    onChange={(e) => updateStyle({ font: e.target.value })}
                  >
                    {["Manrope", "DM Sans", "IBM Plex Sans"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <Range
                  label="Ukuran minimum teks"
                  min={32}
                  max={80}
                  value={style.size}
                  onChange={(v) => updateStyle({ size: v })}
                />
                <p className="field-help">
                  Teks pendek diperbesar otomatis hingga 80 px agar komposisinya
                  lebih padat.
                </p>
                <div className="field">
                  <label htmlFor="alignment">Perataan teks</label>
                  <select
                    id="alignment"
                    value={style.align}
                    onChange={(e) =>
                      updateStyle({ align: e.target.value as Style["align"] })
                    }
                  >
                    <option value="left">Rata kiri</option>
                    <option value="center">Rata tengah</option>
                  </select>
                </div>
                <div className="inspector-section">
                  <h3>Warna carousel</h3>
                  {(
                    [
                      ["accent", "Aksen"],
                      ["background", "Latar slide"],
                      ["color", "Teks"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="color-field" key={key}>
                      <span>{label}</span>
                      <span>
                        <span className="color-hex">
                          {style[key].toUpperCase()}
                        </span>
                        <input
                          aria-label={label}
                          type="color"
                          value={style[key]}
                          onChange={(e) =>
                            updateStyle({ [key]: e.target.value })
                          }
                        />
                      </span>
                    </label>
                  ))}
                </div>
                <div className="inspector-section">
                  <h3>Identitas carousel</h3>
                  <div className="field">
                    <label htmlFor="account">Nama akun</label>
                    <input
                      id="account"
                      placeholder="@namakamu"
                      value={p.account}
                      onChange={(e) =>
                        change((p) => {
                          p.account = e.target.value;
                        })
                      }
                    />
                  </div>
                  <CheckField
                    label="Gunakan nomor slide"
                    checked={p.numbers}
                    onChange={(v) =>
                      change((p) => {
                        p.numbers = v;
                      })
                    }
                  />
                </div>
                {Object.keys(s.style).length > 0 && (
                  <button
                    className="text-link"
                    onClick={() => updateSlide({ style: {} })}
                  >
                    Kembalikan gaya slide ke global
                  </button>
                )}
              </>
            )}
            {warnings.length > 0 && (
              <div className="warnings">
                <strong>
                  <AlertCircle size={16} /> Perlu diperiksa
                </strong>
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                {warnings.some((w) => w.startsWith("Teks")) && (
                  <button
                    disabled={p.slides.length >= 20 || s.text.length < 2}
                    onClick={split}
                  >
                    Bagi isi ke slide baru <Plus size={14} />
                  </button>
                )}
              </div>
            )}
            <ErrorNote message={error} />
          </div>
        </aside>
      </div>
      {review && (
        <Modal
          title={`Tinjau carousel · ${p.slides.length} slide`}
          wide
          close={() => setReview(false)}
        >
          <p className="modal-description">
            Periksa alurnya dari awal sampai akhir. Pilih slide untuk
            melanjutkan edit.
          </p>
          <div className="review-grid">
            {p.slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => {
                  setActive(i);
                  setReview(false);
                  setMobile("kanvas");
                }}
              >
                <SlideArt project={p} slide={slide} index={i} />
                <span>
                  Slide {i + 1}{" "}
                  {slideWarnings(p, slide).length > 0 && (
                    <AlertCircle size={14} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {instagram && (
        <InstagramPublisher
          project={p}
          save={saveForInstagram}
          close={() => setInstagram(false)}
        />
      )}
      {download && (
        <Modal
          title="Unduh carousel"
          close={() => {
            if (!busy) setDownload(false);
          }}
        >
          <p className="modal-description">
            {p.slides.length} slide, siap untuk langkah berikutnya.
          </p>
          {warningCount > 0 && (
            <div className="warnings">
              <strong>
                <AlertCircle size={16} /> {warningCount} slide perlu diperiksa
              </strong>
              <p>
                Ada teks berlebih atau gambar yang belum diisi. Gambar yang
                kosong tidak ikut diekspor.
              </p>
              <button
                onClick={() => {
                  setDownload(false);
                  setActive(
                    p.slides.findIndex((s) => slideWarnings(p, s).length > 0),
                  );
                  setMobile("settings");
                }}
              >
                Periksa slide
              </button>
            </div>
          )}
          <button
            className="download-option"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setProgress(0);
              setError("");
              try {
                await exportPNG(p, setProgress);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unduhan gagal. Coba lagi.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="download-icon">
              {busy ? <Loader2 className="spin" /> : <Grid2X2 />}
            </span>
            <span>
              <strong>
                {busy
                  ? `Menyiapkan ${progress}/${p.slides.length} slide…`
                  : "Unduh semua slide"}
              </strong>
              <small>ZIP berisi PNG · 1080 × {dimensions(p).height} px</small>
            </span>
            <Download size={18} />
          </button>
          <ErrorNote message={error} />
        </Modal>
      )}
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <small>{Number(value.toFixed(2))}</small>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
