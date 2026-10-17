import { useRef, useState, type DragEvent, type HTMLAttributes } from "react";

export function useLibraryMove(kind: "design" | "template", canMove: (source: string, target: string) => boolean, move: (source: string, target: string) => Promise<void>, onError: (message: string) => void) {
  const source = useRef<string | null>(null), saving = useRef(false), suppressClick = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const type = `application/x-imagegen-${kind}-move`;
  const clear = () => { source.current = null; setDragging(null); setOver(null); };
  const accepts = (e: DragEvent, target: string) => !saving.current && !!source.current
    && Array.from(e.dataTransfer.types).some(value => value === type || value === "text/plain") && canMove(source.current, target);
  return {
    source: (id: string, disabled = false): HTMLAttributes<HTMLElement> => ({
      draggable: !disabled && !busy,
      className: dragging === id ? "library-moving" : "",
      onPointerDown: () => { suppressClick.current = false; },
      onClickCapture: e => { if (suppressClick.current && e.detail !== 0) { e.preventDefault(); e.stopPropagation(); } },
      onDragStart: e => {
        if (disabled || saving.current) { e.preventDefault(); return; }
        source.current = id; suppressClick.current = true; setDragging(id);
        e.dataTransfer.setData(type, id);
        // WebKit can omit custom formats; the text fallback still identifies the kind and source.
        e.dataTransfer.setData("text/plain", `${type}:${id}`);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: clear,
    }),
    target: (id: string): HTMLAttributes<HTMLElement> => ({
      className: over === id ? "library-move-target" : "",
      onDragOver: e => { if (accepts(e, id)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(id); } },
      onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(current => current === id ? null : current); },
      onDrop: e => {
        const current = source.current;
        if (!accepts(e, id) || !current || (e.dataTransfer.getData(type) !== current && e.dataTransfer.getData("text/plain") !== `${type}:${current}`)) return;
        e.preventDefault(); e.stopPropagation(); clear(); saving.current = true; setBusy(true);
        void move(current, id).catch(error => onError(String(error))).finally(() => { saving.current = false; setBusy(false); });
      },
    }),
  };
}
