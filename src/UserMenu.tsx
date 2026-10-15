import { useEffect, useId, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

const themeKey = "imagegen-theme";

export function initializeTheme() {
  try {
    document.documentElement.dataset.theme = localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    toggle.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div className="user-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button className="user-avatar" ref={trigger} aria-label="User menu" aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>M</button>
    {open && <div className="user-menu-popup" id={menuId} role="menu" aria-label="Appearance" onKeyDown={event => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        toggle.current?.focus();
      }
    }}>
      <button ref={toggle} role="menuitemcheckbox" aria-checked={dark} onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
        try { localStorage.setItem(themeKey, next ? "dark" : "light"); } catch { /* Keep the theme usable when storage is unavailable. */ }
      }}>
        {dark ? <Moon size={17} /> : <Sun size={17} />}
        <span>Dark mode</span>
        <span className={`theme-switch ${dark ? "on" : ""}`} aria-hidden="true"><span /></span>
      </button>
    </div>}
  </div>;
}
