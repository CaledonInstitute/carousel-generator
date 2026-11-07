"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Layers, LogOut, Menu, Settings2, X } from "lucide-react";
import { api } from "./model";

export function Logo({
  compact = false,
  href = "/proyek",
}: {
  compact?: boolean;
  href?: string;
}) {
  return (
    <a href={href} className="logo" aria-label="Carousel Generator">
      <span className="logo-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      {!compact && (
        <span className="logo-name">
          Carousel<span>Generator</span>
        </span>
      )}
    </a>
  );
}
export function Header({ active = "" }: { active?: string }) {
  const [user, setUser] = useState<{ username: string }>();
  const [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [account, setAccount] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false),
    [error, setError] = useState("");
  const header = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null),
    profile = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ username: string }>("/api/auth/me")
      .then((value) => {
        if (!cancelled) setUser(value);
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
    if (!account) return;
    menu.current?.querySelector<HTMLElement>("a")?.focus();
    const outside = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !profile.current?.contains(e.target as Node)
      )
        setAccount(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAccount(false);
        profile.current?.focus();
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(
          menu.current?.querySelectorAll<HTMLElement>("a,button") ?? [],
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (current + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        items[next]?.focus();
      }
      if (e.key === "Tab") setAccount(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
    };
  }, [account]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    header.current?.querySelector<HTMLElement>(".site-navigation a")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        setOpen(false);
        setAccount(false);
        toggle.current?.focus();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          header.current?.querySelectorAll<HTMLElement>(
            "a,button:not(:disabled)",
          ) ?? [],
        ).filter(
          (n) => n.offsetParent !== null && !n.classList.contains("nav-scrim"),
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => {
      if (desktop.matches) {
        setOpen(false);
        setAccount(false);
      }
    };
    document.addEventListener("keydown", key);
    desktop.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
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
    <header
      ref={header}
      className={`site-header app-sidebar${open ? " menu-open" : ""}`}
    >
      <Logo />
      <button
        ref={toggle}
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-navigation"
        aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
        onClick={() => {
          setOpen(!open);
          setAccount(false);
        }}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
        <span>Menu</span>
      </button>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Tutup navigasi"
          onClick={() => {
            setOpen(false);
            setAccount(false);
            toggle.current?.focus();
          }}
        />
      )}
      <div
        id="site-navigation"
        className={`site-navigation${open ? " is-open" : ""}`}
      >
        <nav aria-label="Navigasi utama">
          <a
            href="/proyek"
            className={active === "projects" ? "active" : undefined}
            aria-current={active === "projects" ? "page" : undefined}
          >
            <Layers size={19} />
            Dashboard
          </a>
        </nav>
        <div className="account-nav" aria-busy={loading}>
          {loading ? (
            <span className="account-loading">
              <span className="sr-only">Memuat akun…</span>
            </span>
          ) : (
            user && (
              <>
                <button
                  ref={profile}
                  type="button"
                  className="nav-profile"
                  aria-label={`Menu akun ${user.username}`}
                  aria-expanded={account}
                  aria-haspopup="menu"
                  aria-controls="account-menu"
                  onClick={() => setAccount(!account)}
                >
                  <span className="nav-avatar" aria-hidden="true">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="nav-username">{user.username}</span>
                  <span aria-hidden="true">⌃</span>
                </button>
                {account && (
                  <div
                    ref={menu}
                    id="account-menu"
                    className="account-menu"
                    role="menu"
                    aria-label="Akun"
                  >
                    <a role="menuitem" href="/pengaturan">
                      <Settings2 size={17} />
                      Pengaturan
                    </a>
                    <button
                      role="menuitem"
                      className="nav-logout"
                      disabled={loggingOut}
                      onClick={() => void logout()}
                    >
                      <LogOut size={17} />
                      {loggingOut ? "Keluar…" : "Keluar"}
                    </button>
                  </div>
                )}
              </>
            )
          )}
          {error && (
            <p className="nav-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
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
        if (!nodes?.length) {
          e.preventDefault();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
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
