"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./model";
import { Header } from "./studio";
export function AuthForm({ register = false }: { register?: boolean }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    if (register && form.get("password") !== form.get("confirmPassword")) {
      setError("Konfirmasi password tidak sama.");
      const confirmation = e.currentTarget.elements.namedItem(
        "confirmPassword",
      ) as HTMLInputElement;
      confirmation.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const next =
        new URLSearchParams(location.search).get("next") || "/proyek";
      location.assign(
        next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/proyek",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <Header />
      <main className="account-page auth-page">
        <h1>{register ? "Buat ruang untuk idemu." : "Lanjutkan ceritamu."}</h1>
        <p>
          {register
            ? "Daftar untuk menyimpan carousel dan menghubungkan agent."
            : "Masuk untuk membuka proyek dan koneksi agent milikmu."}
        </p>
        <form onSubmit={submit} className="account-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_-]{3,32}"
            />
            <small>3–32 huruf, angka, _ atau -.</small>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={12}
              maxLength={128}
            />
            <small>
              12–128 karakter. Simpan passwordmu; tidak tersedia reset password.
            </small>
          </div>
          {register && (
            <div className="field">
              <label htmlFor="confirm-password">Konfirmasi password</label>
              <input
                id="confirm-password"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-invalid={
                  error === "Konfirmasi password tidak sama." || undefined
                }
                aria-describedby={error ? "auth-error" : undefined}
                onChange={() => setError("")}
              />
            </div>
          )}
          {error && (
            <p id="auth-error" className="error-note" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Memproses…" : register ? "Buat akun" : "Masuk"}
          </button>
        </form>
        <a
          className="text-link"
          href={register ? "/masuk" : "/daftar"}
          onClick={(e) => {
            e.preventDefault();
            location.assign(
              `${register ? "/masuk" : "/daftar"}${location.search}`,
            );
          }}
        >
          {register ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
        </a>
      </main>
    </>
  );
}
type Connections = {
  tokens: { id: string; name: string; created: number; expires: number }[];
  grants: { id: string; name: string; created: number }[];
};
export function Settings() {
  const [data, setData] = useState<Connections>(),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api<Connections>("/api/connections"));
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function revoke(id: string, kind: string) {
    if (!confirm("Cabut akses agent ini?")) return;
    setBusy(true);
    try {
      await api("/api/connections", {
        method: "DELETE",
        body: JSON.stringify({ id, kind }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header active="settings" />
      <main className="account-page settings-page">
        <h1>Hubungkan cara kerjamu.</h1>
        <p>
          Gunakan proyek yang sama dari editor, Claude, atau agent pilihanmu.
        </p>
        <section className="settings-section">
          <h2>Koneksi MCP</h2>
          <p>
            Di Claude, tambahkan konektor kustom dengan URL berikut. Masuk
            menggunakan akun Ruang Slide, lalu izinkan akses.
          </p>
          <label htmlFor="mcp-url">URL server MCP</label>
          <input
            id="mcp-url"
            readOnly
            value="https://carousel.hengker.tech/mcp"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p>
            Agent dapat membaca, membuat, mengedit, dan menghapus proyek. Unduh
            PNG melalui editor.
          </p>
        </section>
        <section className="settings-section">
          <h2>Token pribadi</h2>
          <p>
            Untuk client yang mendukung header autentikasi, gunakan{" "}
            <code>Authorization: Bearer TOKEN</code>. Token berlaku 90 hari.
          </p>
          <form
            className="token-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              setBusy(true);
              setError("");
              setToken("");
              try {
                const value = await api<{ token: string }>("/api/connections", {
                  method: "POST",
                  body: JSON.stringify({
                    name: new FormData(form).get("name"),
                  }),
                });
                setToken(value.token);
                form.reset();
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="token-name">Nama agent</label>
              <input
                id="token-name"
                name="name"
                required
                maxLength={80}
                placeholder="Contoh: Claude Code di laptop"
              />
            </div>
            <button className="button" disabled={busy}>
              Buat token
            </button>
          </form>
          {token && (
            <div className="token-result" role="status">
              <label htmlFor="new-token">
                Salin sekarang. Token ini hanya ditampilkan sekali.
              </label>
              <input
                id="new-token"
                readOnly
                value={token}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="text-link" onClick={() => setToken("")}>
                Tutup token
              </button>
            </div>
          )}
          {!data ? (
            <p>Memuat koneksi…</p>
          ) : data.tokens.length === 0 ? (
            <p>Belum ada token pribadi.</p>
          ) : (
            <ul className="connection-list">
              {data.tokens.map((t) => (
                <li key={t.id}>
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      Berlaku sampai{" "}
                      {new Date(t.expires).toLocaleDateString("id-ID")}
                    </small>
                  </span>
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={() => revoke(t.id, "token")}
                  >
                    Cabut token
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="settings-section">
          <h2>Agent terhubung</h2>
          {data?.grants.length === 0 ? (
            <p>Belum ada agent yang diberi akses melalui login.</p>
          ) : (
            <ul className="connection-list">
              {data?.grants.map((g) => (
                <li key={g.id}>
                  <strong>{g.name}</strong>
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={() => revoke(g.id, "grant")}
                  >
                    Cabut akses
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {error && (
          <p role="alert" className="error-note">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
