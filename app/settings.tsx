"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { api } from "./model";
import { Header, Modal } from "./studio";

type Connections = {
  tokens: { id: string; name: string; created: number; expires: number }[];
  grants: { id: string; name: string; created: number }[];
};
type PendingAccess = { id: string; name: string; kind: "grant" | "token" };
const MCP_URL = "https://carousel.hengker.tech/mcp";
const AUTH_HEADER = "Authorization: Bearer TOKEN_PRIBADI";
const date = (value: number) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(value);

export function Settings({ username }: { username: string }) {
  const [data, setData] = useState<Connections>();
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [client, setClient] = useState<"claude" | "other">("claude");
  const [copied, setCopied] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingAccess>();
  const [revoking, setRevoking] = useState(false);
  const [section, setSection] = useState("hubungkan");
  const tokenInput = useRef<HTMLInputElement>(null);
  const refreshSequence = useRef(0);
  const busy = creating || revoking;

  async function refresh() {
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    try {
      const value = await api<Connections>("/api/connections");
      if (sequence === refreshSequence.current) {
        setData(value);
        setLoadError("");
      }
    } catch (e) {
      if (sequence === refreshSequence.current)
        setLoadError((e as Error).message);
    } finally {
      if (sequence === refreshSequence.current) setRefreshing(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setSection(entry.target.id);
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: 0 },
    );
    document
      .querySelectorAll(".settings-content > section[id]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  async function copy(value: string, key: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setNotice(`${label} tersalin.`);
      setError("");
    } catch {
      setError(
        "Penyalinan otomatis tidak tersedia. Pilih teksnya, lalu salin secara manual.",
      );
    }
  }
  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || token) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) {
      setError("Isi nama agent agar token mudah dikenali.");
      tokenInput.current?.focus();
      return;
    }
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const value = await api<{ token: string }>("/api/connections", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setToken(value.token);
      setShowToken(false);
      form.reset();
      setNotice(
        `Token untuk ${name} berhasil dibuat. Salin dan simpan sekarang.`,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  async function revoke() {
    if (!pending || busy) return;
    setRevoking(true);
    setError("");
    try {
      await api("/api/connections", {
        method: "DELETE",
        body: JSON.stringify({ id: pending.id, kind: pending.kind }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              tokens: current.tokens.filter(
                (t) => pending.kind !== "token" || t.id !== pending.id,
              ),
              grants: current.grants.filter(
                (g) => pending.kind !== "grant" || g.id !== pending.id,
              ),
            }
          : current,
      );
      setNotice(`Akses ${pending.name} telah dicabut.`);
      setPending(undefined);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(false);
    }
  }
  function copyButton(value: string, key: string, label: string) {
    return (
      <button
        className="settings-copy"
        type="button"
        onClick={() => void copy(value, key, label)}
      >
        {copied === key ? <Check size={16} /> : <Copy size={16} />}
        <span>{copied === key ? "Tersalin" : "Salin"}</span>
        <span className="sr-only"> {label}</span>
      </button>
    );
  }

  return (
    <>
      <Header active="settings" />
      <main className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-heading">
            <h2>Pengaturan</h2>
            <p>Ruang kerja pribadimu.</p>
          </div>
          <nav aria-label="Bagian pengaturan">
            {[
              { id: "hubungkan", label: "Hubungkan MCP", icon: Plug },
              { id: "akses-agent", label: "Akses agent", icon: ShieldCheck },
              { id: "token-pribadi", label: "Token pribadi", icon: KeyRound },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={section === item.id ? "location" : undefined}
                onClick={() => setSection(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {section === item.id && <ChevronRight size={15} />}
              </a>
            ))}
          </nav>
          <div className="settings-identity">
            <span className="settings-avatar" aria-hidden="true">
              {username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong title={username}>{username}</strong>
              <span>Akun Ruang Slide</span>
            </div>
          </div>
          <a className="settings-back" href="/proyek">
            Kembali ke proyek <ChevronRight size={14} />
          </a>
        </aside>
        <div className="settings-content">
          <section id="hubungkan" className="settings-connect">
            <div className="settings-page-heading">
              <h1>
                Ide dari percakapan.
                <br />
                Langsung jadi carousel.
              </h1>
              <p>
                Hubungkan agent ke Ruang Slide. Susun materi di chat, lalu
                lanjutkan desain di editor yang sama.
              </p>
            </div>
            <div className="mcp-endpoint">
              <div className="mcp-endpoint-heading">
                <span className="mcp-symbol" aria-hidden="true">
                  <Plug size={24} />
                </span>
                <div>
                  <h2>Satu koneksi ke ruang kerjamu.</h2>
                  <p>Untuk Claude dan client MCP lainnya.</p>
                </div>
              </div>
              <label htmlFor="mcp-url">URL server MCP</label>
              <div className="mcp-url-field">
                <input
                  id="mcp-url"
                  readOnly
                  value={MCP_URL}
                  onFocus={(e) => e.currentTarget.select()}
                />
                {copyButton(MCP_URL, "url", "URL MCP")}
              </div>
              <div className="mcp-endpoint-footer">
                <Link2 size={14} />
                <span>Proyek web dan agent selalu memakai data yang sama.</span>
              </div>
            </div>
            <div className="mcp-setup">
              <div className="mcp-setup-heading">
                <h2>Mulai dari client yang kamu pakai.</h2>
                <div
                  className="client-picker"
                  role="group"
                  aria-label="Pilih client MCP"
                >
                  <button
                    type="button"
                    aria-pressed={client === "claude"}
                    onClick={() => setClient("claude")}
                  >
                    Claude.ai
                  </button>
                  <button
                    type="button"
                    aria-pressed={client === "other"}
                    onClick={() => setClient("other")}
                  >
                    Agent lain
                  </button>
                </div>
              </div>
              {client === "claude" ? (
                <div className="setup-content">
                  <ol className="connection-steps">
                    <li>
                      <span aria-hidden="true">1</span>
                      <div>
                        <h3>Tambahkan konektor di Claude</h3>
                        <p>
                          Buka Customize, pilih Connectors, lalu Add custom
                          connector.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span aria-hidden="true">2</span>
                      <div>
                        <h3>Tempel URL Ruang Slide</h3>
                        <p>
                          Beri nama “Ruang Slide”, lalu gunakan URL server MCP
                          di atas. Jika diminta memilih OAuth client, pilih
                          “Register automatically”.
                        </p>
                      </div>
                    </li>
                    <li>
                      <span aria-hidden="true">3</span>
                      <div>
                        <h3>Masuk dan izinkan akses</h3>
                        <p>
                          Pakai akun <strong>{username}</strong>. Setelah
                          terhubung, minta Claude membuat atau mengedit
                          carousel.
                        </p>
                      </div>
                    </li>
                  </ol>
                  <div className="setup-links">
                    <a
                      className="button"
                      href="https://claude.ai/customize/connectors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Buka konektor Claude <ExternalLink size={16} />
                    </a>
                    <a
                      href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Petunjuk Claude <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="setup-content other-client">
                  <h3>Gunakan URL yang sama.</h3>
                  <p>
                    Jika client mendukung login melalui browser, sambungkan URL
                    MCP lalu masuk ke Ruang Slide. Jika client memerlukan token,
                    buat token pribadi di bawah.
                  </p>
                  <div className="header-example">
                    <div>
                      <span>
                        Header autentikasi untuk client berbasis token
                      </span>
                      {copyButton(AUTH_HEADER, "header", "contoh header")}
                    </div>
                    <code>{AUTH_HEADER}</code>
                  </div>
                  <a className="settings-inline-link" href="#token-pribadi">
                    Buat token pribadi <ChevronRight size={15} />
                  </a>
                </div>
              )}
            </div>
            <div className="agent-capabilities">
              <ShieldCheck size={19} />
              <p>
                Agent yang diizinkan dapat membaca, membuat, mengedit, dan{" "}
                <strong>menghapus proyek</strong>. Unduh PNG tetap melalui
                editor.
              </p>
            </div>
          </section>

          <section id="akses-agent" className="settings-access">
            <div className="settings-section-title">
              <div>
                <h2>Agent yang punya akses</h2>
                <p>Koneksi yang kamu izinkan melalui login browser.</p>
              </div>
              <button
                className="settings-refresh"
                type="button"
                disabled={refreshing || busy}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "spin" : undefined}
                />
                Perbarui
              </button>
            </div>
            {loadError && (
              <div className="settings-feedback is-error" role="alert">
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                >
                  Coba lagi
                </button>
              </div>
            )}
            {!data ? (
              <div className="settings-empty">
                {loadError ? (
                  <>
                    <Unplug size={25} />
                    <h3>Koneksi belum dapat dimuat.</h3>
                    <p>Coba muat ulang daftar untuk melihat akses agent.</p>
                  </>
                ) : (
                  <>
                    <Loader2 size={24} className="spin" />
                    <p>Memuat akses agent…</p>
                  </>
                )}
              </div>
            ) : data.grants.length === 0 ? (
              <div className="settings-empty">
                <span className="settings-empty-icon">
                  <Plug size={24} />
                </span>
                <h3>Ruangmu belum terhubung.</h3>
                <p>
                  Tambahkan Ruang Slide di client pilihanmu. Koneksinya akan
                  muncul di sini setelah kamu memberi izin.
                </p>
                <a className="settings-inline-link" href="#hubungkan">
                  Hubungkan agent <ChevronRight size={15} />
                </a>
              </div>
            ) : (
              <ul className="settings-connections">
                {data.grants.map((grant) => (
                  <li key={grant.id}>
                    <span className="connection-icon">
                      <Plug size={20} />
                    </span>
                    <div className="connection-info">
                      <strong>{grant.name}</strong>
                      <span>Terhubung sejak {date(grant.created)}</span>
                    </div>
                    <span className="connection-state">
                      <i />
                      Diizinkan
                    </span>
                    <button
                      type="button"
                      className="settings-revoke"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setPending({ ...grant, kind: "grant" });
                      }}
                    >
                      Cabut akses
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="token-pribadi" className="settings-tokens">
            <div className="settings-section-title">
              <div>
                <h2>Token untuk agent pilihanmu</h2>
                <p>Buat akses untuk client yang memakai token pribadi.</p>
              </div>
              <span className="token-lifetime">
                <KeyRound size={14} />
                Berlaku 90 hari
              </span>
            </div>
            <form className="settings-token-form" onSubmit={createToken}>
              <div>
                <label htmlFor="token-name">Nama agent atau perangkat</label>
                <input
                  ref={tokenInput}
                  id="token-name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Misalnya, agent di laptop kerja"
                  disabled={creating || Boolean(token)}
                  autoComplete="off"
                />
              </div>
              <button className="button" disabled={busy || Boolean(token)}>
                {creating ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <KeyRound size={16} />
                )}
                {creating ? "Membuat token…" : "Buat token"}
              </button>
            </form>
            {token && (
              <div className="settings-new-token">
                <div className="new-token-heading">
                  <CheckCheck size={19} />
                  <div>
                    <h3>Token siap dipakai.</h3>
                    <p>
                      Salin dan simpan sekarang. Setelah ditutup, token tidak
                      dapat dilihat kembali.
                    </p>
                  </div>
                </div>
                <label className="sr-only" htmlFor="new-token">
                  Token pribadi baru
                </label>
                <div className="new-token-field">
                  <input
                    id="new-token"
                    type={showToken ? "text" : "password"}
                    readOnly
                    value={token}
                    autoComplete="off"
                    spellCheck={false}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    className="token-visibility"
                    type="button"
                    aria-label={
                      showToken ? "Sembunyikan token" : "Tampilkan token"
                    }
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                  {copyButton(token, "token", "token pribadi")}
                </div>
                <button
                  className="token-acknowledge"
                  type="button"
                  onClick={() => {
                    setToken("");
                    setShowToken(false);
                    setNotice(
                      "Token ditutup. Kamu tetap dapat mencabutnya dari daftar di bawah.",
                    );
                    requestAnimationFrame(() => tokenInput.current?.focus());
                  }}
                >
                  Sudah saya simpan <Check size={15} />
                </button>
              </div>
            )}
            {data &&
              (data.tokens.length === 0 ? (
                <p className="settings-token-empty">
                  Belum ada token aktif. Beri nama agent di atas untuk membuat
                  yang pertama.
                </p>
              ) : (
                <ul className="settings-connections token-connections">
                  {data.tokens.map((item) => (
                    <li key={item.id}>
                      <span className="connection-icon">
                        <KeyRound size={19} />
                      </span>
                      <div className="connection-info">
                        <strong>{item.name}</strong>
                        <span>
                          Dibuat {date(item.created)}
                          <span className="token-expiry">
                            Berlaku sampai {date(item.expires)}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="settings-revoke"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setPending({ ...item, kind: "token" });
                        }}
                      >
                        Cabut token
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
            <p className="settings-footnote">
              <ShieldCheck size={15} />
              Token memberi akses ke seluruh proyek milikmu. Cabut saat agent
              sudah tidak digunakan.
            </p>
          </section>
          <div
            className="settings-announcements"
            aria-live="polite"
            role="status"
          >
            {notice && !error && (
              <p>
                <Check size={16} />
                {notice}
              </p>
            )}
          </div>
          {error && !pending && (
            <div
              className="settings-feedback settings-action-error is-error"
              role="alert"
            >
              <p>{error}</p>
              <button
                type="button"
                aria-label="Tutup pesan kesalahan"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
        </div>
      </main>
      {pending && (
        <Modal
          title={
            pending.kind === "grant" ? "Cabut akses agent?" : "Cabut token ini?"
          }
          close={() => {
            if (!revoking) {
              setPending(undefined);
              setError("");
            }
          }}
        >
          <div className="settings-revoke-dialog">
            <span className="revoke-dialog-icon">
              <Unplug size={26} />
            </span>
            <p>
              <strong>{pending.name}</strong> akan kehilangan akses ke proyekmu.
              Proyek yang sudah dibuat tetap tersimpan.
            </p>
            <p>
              {pending.kind === "grant"
                ? "Untuk menghubungkan kembali, beri izin ulang melalui client."
                : "Token yang dicabut tidak bisa dipakai lagi. Buat token baru jika masih diperlukan."}
            </p>
            {error && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            <div className="action-row">
              <button
                className="button secondary"
                type="button"
                disabled={revoking}
                onClick={() => {
                  setPending(undefined);
                  setError("");
                }}
              >
                Batal
              </button>
              <button
                className="settings-danger-button"
                type="button"
                disabled={revoking}
                onClick={() => void revoke()}
              >
                {revoking
                  ? "Mencabut…"
                  : pending.kind === "grant"
                    ? "Cabut akses"
                    : "Cabut token"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
