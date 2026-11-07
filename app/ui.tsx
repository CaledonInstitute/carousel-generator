"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { House, Layers, LogOut, Menu, Settings2, X } from "lucide-react";
import { api } from "./model";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="logo" aria-label="Carousel Generator, beranda">
      <span className="logo-mark">
        <i />
        <i />
      </span>
      {!compact && <span className="logo-name">Carousel<span>Generator</span></span>}
    </a>
  );
}
export function Header({ active = "" }: { active?: string }) {
  const workspace = active === "projects" || active === "settings";
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
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const links = () => Array.from(header.current?.querySelectorAll<HTMLElement>('a,button:not(:disabled)') ?? []).filter((node) => node.offsetParent !== null && !node.classList.contains("nav-scrim"));
    const close = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const nodes = links();
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
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
      document.body.style.overflow = oldOverflow;
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
    <header ref={header} className={`site-header${workspace ? " app-sidebar" : ""}${open ? " menu-open" : ""}`}>
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
        <span>{open ? "Tutup" : "Menu"}</span>
      </button>
      {open && <button className="nav-scrim" aria-label="Tutup navigasi" onClick={() => { setOpen(false); toggle.current?.focus(); }} />}
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
              {workspace && (item.key === "home" ? <House size={19} /> : item.key === "projects" ? <Layers size={19} /> : <Settings2 size={19} />)}
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

export function Button({
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
      type="button"
      className={`button ${secondary ? "secondary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function IconButton({
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
        if (!nodes?.length) { e.preventDefault(); return; }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
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
