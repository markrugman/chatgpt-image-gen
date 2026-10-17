import { useEffect, useState } from "react";
import { api } from "./api";
import { candidateComposition } from "./annotationEditing";
import { renderPage } from "./export";
import type { EditBatch, Job, Target, Workspace } from "./types";

export function RegionReview({ w, batch, target, ratio, job, onRefresh, onPreview, onDiscard, notify }: {
  w: Workspace; batch: EditBatch; target: Target; ratio: number; job?: Job;
  onRefresh: () => Promise<void>; onPreview: (url: string | null) => void; notify: (text: string) => void;
  onDiscard: () => void;
}) {
  const [view, setView] = useState("edited"), [working, setWorking] = useState(false);
  const [images, setImages] = useState<{ original: string; edited: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const preview = candidateComposition(w,batch);
    const width = Math.min(1200,w.images.find(i => i.id === batch.source.imageId)?.width || 1000);
    Promise.all([renderPage(w,batch.source,width,Math.round(width/ratio)),renderPage(preview.workspace,preview.composition,width,Math.round(width/ratio))])
      .then(([a,b]) => { if (alive) setImages({ original: a.toDataURL(), edited: b.toDataURL() }); }).catch(e => { if (alive) notify(String(e)); });
    return () => { alive = false; };
  },[batch,w.images.length,ratio]);
  useEffect(() => { onPreview(images ? images[view === "edited" ? "edited" : "original"] : null); return () => onPreview(null); },[images,view,onPreview]);
  const ready = batch.items.every(i => i.candidate && !i.error);
  const ratioChanged = batch.items.some(item => { const a=w.images.find(i=>i.id===item.sourceImageId),b=w.images.find(i=>i.id===item.candidate);return a && b && Math.abs(b.width/b.height/(a.width/a.height)-1)>.02; });
  const act = async (work: () => Promise<unknown>) => { setWorking(true); try { await work(); await onRefresh(); } catch(e) { notify(String(e)); } finally { setWorking(false); } };
  return <div className="region-review-card" aria-label="Review region edit">
    <strong>{job ? "Editing your image…" : ready ? "Compare your edit" : "Your edit needs attention"}</strong>
    <p>{job?.message || batch.items.find(i=>i.error)?.error || "Compare the canvas before applying. Other layers and original assets are kept."}</p>
    {ready && <div className="region-compare-toggle" role="group" aria-label="Compare edit"><button aria-pressed={view==="original"} onClick={()=>setView("original")}>Original</button><button aria-pressed={view==="edited"} onClick={()=>setView("edited")}>Edited</button></div>}
    {ratioChanged && <p role="alert">The aspect ratio changed. Retry to preserve the original framing.</p>}
    {batch.items.length>1 && <p role="alert">This older request has several targets. Discard results and keep instructions for one item before retrying.</p>}
    {!job && <div className="button-row"><button disabled={working} onClick={()=>void act(async()=>{await api("mutate",{action:{op:"annotation_discard",target,batchId:batch.id}});onDiscard();})}>Discard result</button><button disabled={working || batch.items.length!==1} onClick={()=>void act(()=>api("generate_annotations",{target,retryKey:batch.items[0]?.key}))}>Retry edit</button><button className="primary" disabled={working || !ready || ratioChanged} onClick={()=>void act(()=>api("mutate",{action:{op:"annotation_apply",target,batchId:batch.id}}))}>Apply edit</button></div>}
  </div>;
}
