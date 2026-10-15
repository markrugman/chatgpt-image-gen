import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileImage, X } from "lucide-react";
import { isBrowser, imageSource } from "./api";
export type Act = <T = unknown>(action: Record<string, unknown>) => Promise<T>;
export type CreateOptions = {
  kind: "document" | "project" | "organisation" | "asset";
  projectId?: string;
  sourceImageId?: string;
  sourceDocumentId?: string;
};
export function useCompactLayout() {
  const query = "(max-width: 1024px)";
  const [compact, setCompact] = useState(() =>
    isBrowser && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!isBrowser || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

export function ImageView({
  id,
  className = "",
  alt = "",
  style,
}: {
  id?: string | null;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    setSource("");
    if (id)
      imageSource(id)
        .then((s) => {
          if (active) setSource(s);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return source ? (
    <img
      className={className}
      style={style}
      src={source}
      alt={alt}
      draggable={false}
    />
  ) : (
    <div className={`image-placeholder ${className}`} style={style}>
      <FileImage size={26} strokeWidth={1.3} />
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => { e.stopPropagation(); onClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function SectionHeading({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>
        {title}
        {count !== undefined && <span>{count}</span>}
      </h2>
      {action}
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
