"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Menu,
  LogOut,
  Plus,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  Undo2,
  Redo2,
  Grid2X2,
  X,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Settings2,
  FileText,
  Monitor,
  CheckCheck,
  ExternalLink,
  GripVertical,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  api,
  ApiError,
  imageSource,
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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="logo" aria-label="Ruang Slide, beranda">
      <span className="logo-mark">
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          ruang<span className="logo-light">slide</span>
          <span className="logo-dot">.</span>
        </span>
      )}
    </a>
  );
}
export function Header({ active = "" }: { active?: string }) {
  const [user, setUser] = useState<{ username: string }>();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.ok) {
          const value = (await r.json()) as { username: string };
          if (!cancelled) setUser(value);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => {
      if (desktop.matches) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
      desktop.removeEventListener("change", resize);
    };
  }, [open]);
  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.assign("/masuk");
    } catch (e) {
      setError((e as Error).message);
      setLoggingOut(false);
    }
  }
  return (
    <header ref={header} className="site-header">
      <Logo />
      <button
        ref={toggle}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-navigation"
        aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={21} /> : <Menu size={21} />}
        <span>Menu</span>
      </button>
      <div
        id="site-navigation"
        className={`site-navigation${open ? " is-open" : ""}`}
      >
        <nav aria-label="Navigasi utama">
          {[
            { key: "home", href: "/", label: "Beranda" },
            { key: "projects", href: "/proyek", label: "Proyek saya" },
            { key: "settings", href: "/pengaturan", label: "Pengaturan" },
          ].map((item) => (
            <a
              key={item.key}
              className={active === item.key ? "active" : undefined}
              aria-current={active === item.key ? "page" : undefined}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="account-nav" aria-busy={loading}>
          {loading ? (
            <span className="account-loading">
              <span className="sr-only">Memuat akun…</span>
            </span>
          ) : user ? (
            <>
              <a
                className="nav-profile"
                href="/pengaturan"
                title={`Pengaturan akun ${user.username}`}
              >
                <span className="nav-avatar" aria-hidden="true">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="nav-username">{user.username}</span>
              </a>
              <button
                className="nav-logout"
                type="button"
                disabled={loggingOut}
                onClick={() => void logout()}
              >
                <LogOut size={16} />
                <span>{loggingOut ? "Keluar…" : "Keluar"}</span>
              </button>
            </>
          ) : (
            <>
              <a className="nav-login" href="/masuk">
                Masuk
              </a>
              <a className="nav-register" href="/daftar">
                Daftar
              </a>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="nav-error" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}

function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`button ${secondary ? "secondary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function IconButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a,input,select,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="Tutup" onClick={close}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDemo(exampleProject()), []);
  async function start(example = false) {
    setBusy(true);
    try {
      await create(example);
    } catch {
      setError(
        "Proyek belum bisa dibuat. Masuk dan periksa koneksi internetmu.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <Header active="home" />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Ide kamu.
              <br />
              Ruang untuk
              <br />
              <span>bercerita.</span>
            </h1>
            <p>
              Ubah pengetahuan jadi carousel yang mudah dipahami. Tulis, susun,
              dan beri ruang untuk setiap gagasan.
            </p>
            <div className="hero-actions">
              <Button onClick={() => start()} disabled={busy}>
                Buat carousel <Plus size={19} />
              </Button>
              <a href="#cara-kerja" className="text-link">
                Lihat cara kerjanya <ArrowRight size={16} />
              </a>
            </div>
            <ErrorNote message={error} />
          </div>
          <div className="hero-display">
            <div className="sample-stack">
              <div className="hero-slide">
                {demo && (
                  <SlideArt
                    project={demo}
                    slide={demo.slides[index]}
                    index={index}
                  />
                )}
              </div>
            </div>
            <div className="sample-controls">
              <div className="sample-description">
                Contoh carousel
                <span className="muted"> / Edukasi</span>
              </div>
              <div className="sample-pagination">
                <IconButton
                  label="Contoh sebelumnya"
                  onClick={() => setIndex((index + 4) % 5)}
                >
                  <ChevronLeft size={17} />
                </IconButton>
                <span>
                  {index + 1}
                  <span className="muted"> / 5</span>
                </span>
                <IconButton
                  label="Contoh berikutnya"
                  onClick={() => setIndex((index + 1) % 5)}
                >
                  <ChevronRight size={17} />
                </IconButton>
              </div>
            </div>
          </div>
        </section>
        <div className="spec-strip">
          <span>Dibuat untuk ide yang layak dibagikan.</span>
          <div>
            <span>
              <Grid2X2 size={16} /> 5–20 slide
            </span>
            <span>
              <Monitor size={16} /> 1080 × 1080 px
            </span>
            <span>
              <Download size={16} /> PNG berkualitas tinggi
            </span>
          </div>
        </div>
        <section className="workflow" id="cara-kerja">
          <div className="section-intro">
            <h2>
              Fokus pada ceritanya.
              <br />
              Kami jaga komposisinya.
            </h2>
            <p>
              Tak perlu mulai dari kanvas kosong.
              <br />
              Cukup satu gagasan, lalu biarkan berkembang.
            </p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <FileText size={25} />
              <h3>Tuangkan idemu</h3>
              <p>
                Tulis judul dan isi. Satu slide untuk satu gagasan, dengan alur
                yang kamu tentukan.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <Layers size={25} />
              <h3>Temukan bentuknya</h3>
              <p>
                Pilih komposisi, tambahkan gambar, dan sesuaikan warna. Tetap
                rapi, tetap terasa kamu.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <Download size={25} />
              <h3>Siap dibagikan</h3>
              <p>
                Tinjau rangkaiannya, unduh semua slide, lalu bagikan
                pengetahuanmu ke Instagram.
              </p>
            </article>
          </div>
        </section>
        <section className="layouts-section">
          <div>
            <h2>
              Ruang untuk setiap
              <br />
              jenis penjelasan.
            </h2>
            <p>
              Dari kalimat pembuka hingga pesan terakhir.
              <br />
              Enam komposisi yang saling melengkapi.
            </p>
            <Button secondary onClick={() => start(true)} disabled={busy}>
              Coba contoh ini <ArrowRight size={17} />
            </Button>
          </div>
          <div className="layout-miniatures">
            {(["sampul", "daftar", "perbandingan"] as Layout[]).map((l, i) => (
              <div className="miniature" key={l}>
                <div className={`mini-layout mini-${l}`}>
                  <span className="mini-account">@namakamu</span>
                  {i === 0 ? (
                    <>
                      <strong>
                        Satu ide.
                        <br />
                        Dampak
                        <br />
                        berarti.
                      </strong>
                      <small>Mulai dari sini.</small>
                    </>
                  ) : i === 1 ? (
                    <>
                      <strong>
                        Lebih jelas,
                        <br />
                        lebih mudah.
                      </strong>
                      <i />
                      <i />
                      <i />
                    </>
                  ) : (
                    <>
                      <strong>
                        Dua sisi.
                        <br />
                        Satu perspektif.
                      </strong>
                      <div className="mini-columns">
                        <i />
                        <i />
                      </div>
                    </>
                  )}
                  <span className="mini-page">0{i + 1} / 05</span>
                </div>
                <span>{layouts[l]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="closing">
          <h2>
            Ada ide yang ingin
            <br />
            kamu bagikan?
          </h2>
          <Button onClick={() => start()} disabled={busy}>
            Buat carousel pertamamu <ArrowRight size={18} />
          </Button>
          <p>Simpan di cloud. Lanjutkan dari mana saja.</p>
        </section>
      </main>
      <footer>
        <Logo />
        <p>Sedikit lebih sederhana. Jauh lebih bermakna.</p>
        <span>Dibuat untuk berbagi pengetahuan.</span>
      </footer>
    </>
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
      <main className="projects-page">
        <div className="page-title">
          <div>
            <h1>
              Proyek saya<span className="title-count">{projects.length}</span>
            </h1>
            <p>Gagasan yang sedang kamu bentuk, semuanya di sini.</p>
          </div>
          <div className="action-row">
            <Button onClick={() => action(() => create())} disabled={busy}>
              <Plus size={18} /> Buat carousel
            </Button>
          </div>
        </div>
        <div className="storage-notice">
          <Monitor size={18} />
          <p>
            Tersimpan di cloud.{" "}
            <span>
              Buka proyek dari perangkat lain atau hubungkan agent melalui
              Pengaturan.
            </span>
          </p>
        </div>
        <ErrorNote message={error} />
        {loading ? (
          <div className="empty-state">
            <Loader2 className="spin" /> Membuka ruang kerjamu…
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
                    })}
                  </p>
                  <div className="project-actions">
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
                    </IconButton>
                    <IconButton
                      label={`Hapus ${p.title}`}
                      disabled={busy}
                      onClick={() => setPendingDelete(p)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <footer>
        <Logo />
        <span>Ide tersimpan. Cerita berlanjut.</span>
      </footer>
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revision, setRevision] = useState(0);
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const dirty = useRef(false);
  const saving = useRef(false);
  const serverRevision = useRef<number | undefined>(undefined);
  const dragging = useRef<number | null>(null);
  const projectRef = useRef<Project | undefined>(undefined);

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
    if (p.slides.length >= 20 || s.body.length < 2) return;
    const middle = Math.floor(s.body.length / 2);
    let at = s.body.lastIndexOf("\n", middle);
    if (at < 1) at = s.body.lastIndexOf(" ", middle);
    if (at < 1) at = middle;
    change((p) => {
      const old = p.slides[active];
      const next = {
        ...structuredClone(old),
        id: uid(),
        title: old.title ? old.title + " (lanjutan)" : "",
        body: old.body.slice(at),
      };
      old.body = old.body.slice(0, at);
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
            <span>Proyek saya</span>
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
          className={mobile === "slides" ? "active" : ""}
          onClick={() => setMobile("slides")}
        >
          <Layers size={16} /> Slide
        </button>
        <button
          className={mobile === "kanvas" ? "active" : ""}
          onClick={() => setMobile("kanvas")}
        >
          <Grid2X2 size={16} /> Kanvas
        </button>
        <button
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
                  aria-label={`Edit slide ${i + 1}: ${slide.title || layouts[slide.layout]}`}
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
            <span>1080 × 1080 px</span>
          </div>
          <div className="canvas-wrap">
            <div className="main-canvas">
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
              className={tab === "isi" ? "active" : ""}
              onClick={() => setTab("isi")}
            >
              <FileText size={16} /> Isi
            </button>
            <button
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
                  <label htmlFor="slide-title">
                    Judul <span>Pesan utamamu</span>
                  </label>
                  <textarea
                    id="slide-title"
                    rows={3}
                    placeholder="Satu judul yang mengundang rasa ingin tahu"
                    value={s.title}
                    onChange={(e) => updateSlide({ title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="slide-body">
                    {s.layout === "daftar" || s.layout === "langkah"
                      ? "Butir isi"
                      : s.layout === "perbandingan"
                        ? "Sisi kiri"
                        : "Isi slide"}
                    <span>
                      {s.layout === "daftar" || s.layout === "langkah"
                        ? "Satu butir per baris"
                        : "Singkat dan mudah dipahami"}
                    </span>
                  </label>
                  <textarea
                    id="slide-body"
                    rows={5}
                    placeholder="Tuliskan penjelasanmu di sini…"
                    value={s.body}
                    onChange={(e) => updateSlide({ body: e.target.value })}
                  />
                  <span className="field-count">{s.body.length} karakter</span>
                </div>
                {(s.layout === "perbandingan" || s.layout === "penutup") && (
                  <div className="field">
                    <label htmlFor="secondary">
                      {s.layout === "perbandingan"
                        ? "Sisi kanan"
                        : "Ajakan penutup"}
                    </label>
                    <textarea
                      id="secondary"
                      rows={3}
                      value={s.secondary}
                      onChange={(e) =>
                        updateSlide({ secondary: e.target.value })
                      }
                    />
                  </div>
                )}
                {s.layout === "gambar" && (
                  <div className="field">
                    <label htmlFor="image-url">URL gambar persegi</label>
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
                      Wajib 1:1. PNG, JPEG, WebP, maksimal 12 MB. Gunakan link
                      gambar publik.
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
                  label="Ukuran teks"
                  min={22}
                  max={46}
                  value={style.size}
                  onChange={(v) => updateStyle({ size: v })}
                />
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
                    disabled={p.slides.length >= 20 || s.body.length < 2}
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
      {download && (
        <Modal
          title="Bawa ceritamu keluar."
          close={() => {
            if (!busy) setDownload(false);
          }}
        >
          <p className="modal-description">
            {p.slides.length} slide persegi, siap untuk langkah berikutnya.
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
              <small>ZIP berisi PNG · 1080 × 1080 px</small>
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
