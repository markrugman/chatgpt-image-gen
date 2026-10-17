import { useEffect, useRef, useState, type PointerEvent } from "react";
import { regionBetween, regionPlacement, regionPoint, type RegionFrame } from "./annotationEditing";
import { overlayId } from "./overlayOperations";
import type { RegionNote } from "./types";

export function RegionCanvas({ frame, targetKey, sourceImageId, targetName, notes, editingNote, saving, onSave, onDone }: {
  frame: RegionFrame; targetKey: string; sourceImageId: string; targetName: string; notes: RegionNote[];
  editingNote: RegionNote | null; saving: boolean; onSave: (note: RegionNote) => Promise<void>; onDone: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const start = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const [region, setRegion] = useState<ReturnType<typeof regionBetween> | null>(editingNote);
  const [text, setText] = useState(editingNote?.text || ""), [error, setError] = useState("");
  const submitting = useRef(false), touchSubmit = useRef(false);
  useEffect(() => { setRegion(editingNote); setText(editingNote?.text || ""); setError(""); }, [editingNote?.id]);
  useEffect(() => { if (region && !start.current) input.current?.focus({ preventScroll: true }); }, [region]);
  const style = (r: { x: number; y: number; width: number; height: number }) => {
    const p = regionPlacement(frame, r);
    return { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%`, transform: `rotate(${p.rotation}deg)` };
  };
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = surface.current!.getBoundingClientRect();
    return regionPoint(frame, { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };
  const clamp = (p: { x: number; y: number }) => ({ x: Math.max(0,Math.min(1,p.x)), y: Math.max(0,Math.min(1,p.y)) });
  const placement = region && regionPlacement(frame, region);
  const submit = async () => {
    if (!region || !text.trim() || saving || submitting.current) return;
    submitting.current = true;
    try {
      await onSave({ id: editingNote?.id || overlayId(), targetKey, sourceImageId, ...region, text: text.trim(), enabled: true });
      setRegion(null); setText("");
    } catch(e) { setError(String(e)); }
    finally { submitting.current = false; }
  };
  return <div className="region-canvas-tools" onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone(); } }}>
    <div className="region-draw-surface" ref={surface} data-region-surface data-edit-target={targetKey} aria-label={`Draw edit region on ${targetName}`}
      onPointerDown={e => {
        if (e.button !== 0 || saving) return;
        e.stopPropagation(); e.preventDefault();
        if (!e.isPrimary) { start.current = null; setRegion(null); return; }
        const p = point(e);
        if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
        e.currentTarget.setPointerCapture(e.pointerId); start.current = { pointer: e.pointerId, ...p }; setRegion(null); setError("");
      }}
      onPointerMove={e => { if (start.current?.pointer === e.pointerId) setRegion(regionBetween(start.current, clamp(point(e)))); }}
      onPointerUp={e => {
        if (start.current?.pointer !== e.pointerId) return;
        const next = regionBetween(start.current, clamp(point(e))); start.current = null;
        setRegion(next.width > .005 && next.height > .005 ? next : null);
      }}
      onPointerCancel={() => { start.current = null; setRegion(null); }} />
    <div className="region-focus-outline" style={style({ x: 0, y: 0, width: 1, height: 1 })} />
    {notes.filter(n => n.targetKey === targetKey && n.sourceImageId === sourceImageId && n.id !== editingNote?.id).map(n => <div key={n.id} className="region-canvas-box" style={style(n)}><b>{notes.findIndex(item => item.id === n.id) + 1}</b></div>)}
    {region && <div className="region-canvas-box pending" style={style(region)}><b>{editingNote ? notes.findIndex(n => n.id === editingNote.id)+1 : notes.length+1}</b></div>}
    <div className="region-focus-label"><span>Editing {targetName} · drag to mark an area</span><button onClick={onDone} onPointerUp={e=>{if(e.pointerType==="touch"){e.preventDefault();onDone();}}} disabled={saving}>Done</button></div>
    {region && placement && <form className="region-inline-instruction" style={{ left: `clamp(8px, ${placement.x*100}%, max(8px, calc(100% - 308px)))`, top: `clamp(8px, ${(placement.y+placement.height)*100}%, max(8px, calc(100% - 100px)))` }}
      onPointerDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void submit(); }}>
      <input ref={input} aria-label="Region instruction" placeholder="Describe this change…" maxLength={6000} value={text} onChange={e => setText(e.target.value)} disabled={saving} />
      <button type="submit" disabled={saving || !text.trim()} onPointerDown={()=>{touchSubmit.current=false;}} onPointerUp={e=>{if(e.pointerType==="touch"){e.preventDefault();touchSubmit.current=true;void submit();}}} onClick={e=>{if(touchSubmit.current){e.preventDefault();touchSubmit.current=false;}}}>{editingNote ? "Update" : "Add"}</button>
      <button type="button" aria-label="Cancel region" disabled={saving} onClick={() => { setRegion(null); setText(""); }} onPointerUp={e=>{if(e.pointerType==="touch"){e.preventDefault();setRegion(null);setText("");}}}>×</button>
      {error && <small role="alert">{error}</small>}
    </form>}
  </div>;
}
