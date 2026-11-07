"use client";
import { useState, type FormEvent } from "react";
import { api } from "./model";
import { Logo } from "./ui";
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
      <main className="auth-page">
        <div className="auth-brand">
          <Logo href="/" />
        </div>
        <h1>{register ? "Buat akun" : "Masuk"}</h1>
        <p>
          {register
            ? "Simpan dan kelola carousel dalam satu tempat."
            : "Masuk untuk melanjutkan carousel-mu."}
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
            {register && <small>3–32 huruf, angka, _ atau -.</small>}
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
            {register && (
              <small>
                12–128 karakter. Simpan passwordmu; tidak tersedia reset
                password.
              </small>
            )}
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
