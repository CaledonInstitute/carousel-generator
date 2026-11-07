"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera as Instagram,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { api, normalizeProject, type Project } from "./model";
import { SlideArt } from "./slide";
import { renderSlides } from "./transfer";
import { Modal } from "./ui";

type ConnectionStatus = {
  configured: boolean;
  allowed: boolean;
  connected?: boolean;
  username?: string;
  reconnect?: boolean;
};
type Posting = {
  id: string;
  status: string;
  username: string;
  caption: string;
  uploaded: number;
  ready: number;
  total: number;
  permalink?: string;
  error?: string;
  expires: number;
  created: number;
};
const labels: Record<string, string> = {
  preparing: "Siap untuk diposting",
  queued: "Menunggu pemrosesan",
  processing: "Memproses carousel di Instagram",
  publishing: "Memublikasikan carousel",
  verifying: "Memverifikasi hasil publikasi",
  published: "Berhasil diposting",
  failed: "Posting tidak selesai",
};
const active = (p: Posting) =>
  p.expires > Date.now() &&
  ["queued", "processing", "publishing", "verifying"].includes(p.status);
export function InstagramSettings() {
  const [status, setStatus] = useState<ConnectionStatus>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  async function refresh() {
    try {
      setStatus(await api<ConnectionStatus>("/api/instagram/connection"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const result = new URLSearchParams(location.search).get("instagram");
    if (result) {
      setNotice(
        result === "connected"
          ? "Instagram berhasil dihubungkan."
          : result === "denied"
            ? "Izin Instagram dibatalkan. Kamu bisa mencoba lagi."
            : result === "accounts"
              ? "Bagikan tepat satu akun Instagram untuk dihubungkan, lalu coba lagi."
              : result === "permissions"
                ? "Izin publikasi belum diberikan. Hubungkan lagi dan izinkan akses publikasi."
                : "Koneksi gagal. Periksa pengaturan Meta App dan coba lagi.",
      );
      const url = new URL(location.href);
      url.searchParams.delete("instagram");
      history.replaceState(null, "", url);
    }
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/api/instagram/connect", {
        method: "POST",
      });
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await api("/api/instagram/connection", { method: "DELETE" });
      setConfirm(false);
      setNotice("Koneksi Instagram diputus.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div id="instagram" className="settings-instagram">
      <div className="section-heading">
        <Instagram size={22} />
        <div>
          <h2>Instagram</h2>
          <p>Posting carousel langsung dari studio.</p>
        </div>
      </div>
      {!status && !error && <p role="status">Memeriksa koneksi…</p>}
      {status && !status.configured && (
        <p>
          Instagram belum dikonfigurasi
          {status.allowed
            ? ". Lengkapi pengaturan server untuk mengaktifkan koneksi."
            : " untuk akun ini."}
        </p>
      )}
      {status?.configured && (
        <>
          <p>
            {status.connected ? (
              <>
                <strong>@{status.username}</strong> ·{" "}
                {status.reconnect ? "Perlu dihubungkan ulang" : "Terhubung"}
              </>
            ) : (
              "Belum ada akun Instagram terhubung."
            )}
          </p>
          <p className="muted">
            Gunakan akun Business atau Creator. Versi awal mendukung satu akun
            dan carousel 5–10 slide. Saat menghubungkan, pilih portfolio bisnis
            dan bagikan satu akun Instagram tujuan posting. Izin publikasi
            digunakan untuk menerbitkan carousel.
          </p>
          <div className="action-row">
            {(!status.connected || status.reconnect) && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void connect()}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Instagram size={16} />
                )}{" "}
                {status.reconnect ? "Hubungkan ulang" : "Hubungkan Instagram"}
              </button>
            )}
            {status.connected && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Putuskan koneksi
              </button>
            )}
          </div>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error-note">
          {error}{" "}
          <button
            type="button"
            className="button secondary"
            onClick={() => void refresh()}
          >
            Coba lagi
          </button>
        </p>
      )}
      {confirm && (
        <Modal
          title="Putuskan koneksi Instagram?"
          close={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Posting yang belum dikirim akan dihentikan. Posting yang sedang
            dikirim ke Instagram mungkin tetap selesai. Posting yang sudah
            terbit tetap ada.
          </p>
          <div className="action-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Batal
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {busy ? "Memutuskan…" : "Putuskan koneksi"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function InstagramPublisher({
  project,
  save,
  close,
}: {
  project: Project;
  save: () => Promise<Project>;
  close: () => void;
}) {
  const [connection, setConnection] = useState<ConnectionStatus>();
  const [caption, setCaption] = useState("");
  const [job, setJob] = useState<Posting>();
  const [history, setHistory] = useState<Posting[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const urls = useRef<string[]>([]);
  const request = useRef<
    { key: string; revision: number | undefined; caption: string } | undefined
  >(undefined);
  const snapshot = useRef<Project>(structuredClone(project));
  const count = Array.from(caption).length;
  async function loadHistory() {
    const result = await api<Posting[]>(
      `/api/projects/${project.id}/instagram/jobs`,
    );
    setHistory(result);
    return result;
  }
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const c = await api<ConnectionStatus>("/api/instagram/connection");
        if (stopped) return;
        setConnection(c);
        if (c.configured) {
          const jobs = await loadHistory();
          if (!stopped) setJob(jobs.find(active));
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    })();
    return () => {
      stopped = true;
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!job || !active(job)) return;
    let stopped = false;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await api<Posting>(
          `/api/instagram/jobs/${job.id}/advance`,
          { method: "POST" },
        );
        if (!stopped) {
          setJob(result);
          setError("");
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress("Menyimpan proyek…");
    try {
      const saved = await save();
      if (saved.slides.length < 5 || saved.slides.length > 10)
        throw Error("Posting Instagram mendukung 5–10 slide.");
      if (
        !request.current ||
        request.current.revision !== saved.revision ||
        request.current.caption !== caption
      )
        request.current = {
          key: crypto.randomUUID(),
          revision: saved.revision,
          caption,
        };
      const prepared = await api<Posting & { project: Project }>(
        `/api/projects/${saved.id}/instagram/jobs`,
        {
          method: "POST",
          body: JSON.stringify(request.current),
        },
      );
      if (prepared.status !== "preparing") {
        setJob(prepared);
        return;
      }
      snapshot.current = normalizeProject(prepared.project);
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
      setPreview([]);
      let index = 0;
      for await (const blob of renderSlides(prepared.project, "image/jpeg")) {
        setProgress(`Mengunggah slide ${index + 1} dari ${prepared.total}…`);
        await api(`/api/instagram/jobs/${prepared.id}/upload/${index}`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        urls.current.push(URL.createObjectURL(blob));
        setPreview([...urls.current]);
        index++;
      }
      setJob(await api<Posting>(`/api/instagram/jobs/${prepared.id}`));
      setProgress("");
    } catch (e) {
      setError((e as Error).message);
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!job || busy) return;
    setBusy(true);
    setError("");
    try {
      setJob(
        await api<Posting>(`/api/instagram/jobs/${job.id}/publish`, {
          method: "POST",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const usable =
    connection?.configured && connection.connected && !connection.reconnect;
  return (
    <Modal
      title="Posting ke Instagram"
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="instagram-publisher">
        {!connection && !error && <p role="status">Memeriksa koneksi…</p>}
        {connection && !usable && (
          <p>
            {!connection.configured
              ? "Instagram belum dikonfigurasi untuk akun ini."
              : "Hubungkan Instagram terlebih dahulu."}{" "}
            <a href="/pengaturan#instagram">Buka Pengaturan</a>
          </p>
        )}
        {usable && (
          <>
            <p>
              Posting ke{" "}
              <strong>@{job?.username || connection.username}</strong>
            </p>
            {(!job || job.status === "preparing") && (
              <>
                <div
                  className="instagram-preview"
                  aria-label="Preview slide sesuai urutan"
                >
                  {(preview.length ? preview : snapshot.current.slides).map(
                    (item, i) => (
                      <figure key={i}>
                        {typeof item === "string" ? (
                          <img src={item} alt={`Slide ${i + 1}`} />
                        ) : (
                          <SlideArt
                            project={snapshot.current}
                            slide={item}
                            index={i}
                          />
                        )}
                        <figcaption>Slide {i + 1}</figcaption>
                      </figure>
                    ),
                  )}
                </div>
                {!job && (
                  <>
                    <label htmlFor="instagram-caption">
                      Caption (opsional)
                    </label>
                    <textarea
                      id="instagram-caption"
                      rows={5}
                      value={caption}
                      disabled={busy}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Tulis caption dan hashtag…"
                    />
                    <span className="muted">
                      {count.toLocaleString("id-ID")} / 2.200 karakter
                    </span>
                  </>
                )}
                {project.slides.length > 10 && (
                  <p className="error-note">
                    Proyek memiliki {project.slides.length} slide. Kurangi
                    menjadi maksimal 10 slide atau unduh proyek.
                  </p>
                )}
                {!job && (
                  <button
                    className="button"
                    disabled={
                      busy || count > 2200 || project.slides.length > 10
                    }
                    onClick={() => void prepare()}
                  >
                    {busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Instagram size={16} />
                    )}{" "}
                    Siapkan posting
                  </button>
                )}
                {job && (
                  <>
                    <p>
                      Seluruh {job.total} slide sudah diunggah. Periksa preview
                      dan caption sebelum memposting.
                    </p>
                    <p className="instagram-caption">
                      {job.caption || "Tanpa caption"}
                    </p>
                    <button
                      className="button"
                      disabled={busy || job.expires <= Date.now()}
                      onClick={() => void publish()}
                    >
                      {busy ? "Mengirim…" : "Posting sekarang"}
                    </button>
                  </>
                )}
              </>
            )}
            {job && (
              <div role="status" aria-live="polite" className="instagram-job">
                <strong>{labels[job.status] || job.status}</strong>
                {job.status === "processing" && (
                  <p>
                    {job.ready} / {job.total} slide siap di Instagram.
                  </p>
                )}
                {active(job) && (
                  <p>
                    Biarkan dialog ini terbuka sampai selesai. Jika ditutup,
                    buka kembali Posting ke Instagram untuk melanjutkan proses.
                  </p>
                )}
                {job.error && <p>{job.error}</p>}
                {job.status === "published" && (
                  <a
                    className="button secondary"
                    href={
                      job.permalink ||
                      `https://www.instagram.com/${job.username}/`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka {job.permalink ? "posting" : "profil Instagram"}{" "}
                    <ExternalLink size={15} />
                  </a>
                )}
                {["published", "failed"].includes(job.status) && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setJob(undefined);
                      request.current = undefined;
                      for (const url of urls.current) URL.revokeObjectURL(url);
                      urls.current = [];
                      setPreview([]);
                      snapshot.current = structuredClone(project);
                      void loadHistory().catch(() => {});
                    }}
                  >
                    Buat posting baru
                  </button>
                )}
              </div>
            )}
            {history.length > 0 && (
              <details>
                <summary>Posting sebelumnya</summary>
                <ul className="instagram-history">
                  {history.map((item) => (
                    <li key={item.id}>
                      <span>
                        {new Date(item.created || 0).toLocaleString("id-ID")} ·{" "}
                        {labels[item.status]}
                      </span>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const latest = await api<Posting>(
                              `/api/instagram/jobs/${item.id}`,
                            );
                            if (latest.status === "preparing") {
                              setError(
                                "Persiapan lama belum dikirim. Siapkan posting baru dari proyek saat ini.",
                              );
                              return;
                            }
                            setJob(latest);
                            setError("");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Lihat status
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {busy && (
          <p role="status">
            <Loader2 size={16} className="spin" />{" "}
            {progress || "Mengirim permintaan…"}
          </p>
        )}
        {error && (
          <p role="alert" className="error-note">
            {error}
          </p>
        )}
        {!connection && error && (
          <button className="button secondary" onClick={close}>
            <RefreshCw size={15} /> Tutup dan coba lagi
          </button>
        )}
      </div>
    </Modal>
  );
}
