import { useEffect, useRef, useState, type DragEvent } from "react";
import { LoaderCircle, Upload, X } from "lucide-react";
import { importImageFile } from "./api";
import { activeOrganisations, type Workspace } from "./types";
import { Modal } from "./ui";
import { LibraryImages } from "./LibraryImages";

type Reveal = (organisationId: string) => void;
export type UploadControls = {
  busy: boolean;
  chooseFiles: (reveal: Reveal) => void;
  addFiles: (files: File[], reveal: Reveal) => void;
};
type Batch = { files: File[]; reveal: Reveal };

export function useUploads(w: Workspace, selectedOrganisation: string, refresh: () => Promise<void>) {
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<{ organisationId: string; reveal: Reveal } | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Batch | null>(null);
  const [destination, setDestination] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ message: string; failures: string[] } | null>(null);
  const organisations = activeOrganisations(w);

  async function upload(batch: Batch, organisationId: string) {
    const name = organisations.find(o => o.id === organisationId)?.name || "Organisation";
    setPending(null);
    batch.reveal(organisationId);
    const failures: string[] = [];
    let saved = 0;
    for (const [index, file] of batch.files.entries()) {
      setProgress(`Uploading ${index + 1} of ${batch.files.length} to ${name}: ${file.name}`);
      try {
        await importImageFile(file, organisationId);
        saved++;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try { await refresh(); }
    catch (error) { failures.push(`Could not refresh Uploads: ${String(error)}`); }
    setProgress("");
    setResult({ message: `${saved} of ${batch.files.length} images uploaded to ${name}`, failures });
    locked.current = false;
    setBusy(false);
  }

  function start(files: File[], organisationId: string, reveal: Reveal) {
    if (!files.length || locked.current) return;
    locked.current = true;
    setBusy(true);
    setResult(null);
    const batch = { files, reveal };
    if (organisationId === "all") {
      setDestination("");
      setPending(batch);
    } else void upload(batch, organisationId);
  }
  const controls: UploadControls = {
    busy,
    chooseFiles: reveal => {
      if (locked.current) return;
      picker.current = { organisationId: selectedOrganisation, reveal };
      input.current?.click();
    },
    addFiles: (files, reveal) => start(files, selectedOrganisation, reveal),
  };
  const cancel = () => { setPending(null); locked.current = false; setBusy(false); };
  return { controls, ui: <>
    <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" aria-label="Upload images"
      onChange={e => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        const selection = picker.current;
        picker.current = null;
        if (selection) start(files, selection.organisationId, selection.reveal);
      }} />
    {pending && <Modal title="Choose upload organisation" onClose={cancel}>
      <form onSubmit={e => { e.preventDefault(); if (destination && organisations.some(o => o.id === destination)) void upload(pending, destination); }}>
        <div className="form-body">
          <p>Choose where to save {pending.files.length} image{pending.files.length === 1 ? "" : "s"}.</p>
          <label>Organisation<select aria-label="Upload organisation" value={destination} onChange={e => setDestination(e.target.value)} required>
            <option value="" disabled>Choose an organisation</option>
            {organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select></label>
          {!organisations.length && <p>Create an organisation before uploading images.</p>}
        </div>
        <div className="modal-footer"><button type="button" className="button secondary" onClick={cancel}>Cancel</button><button className="button primary" disabled={!destination || !organisations.some(o => o.id === destination)}>Upload images</button></div>
      </form>
    </Modal>}
    {(progress || result) && <aside className="upload-feedback" aria-label="Upload progress">
      <div role="status">{progress ? <><LoaderCircle size={16} className="spin" />{progress}</> : result?.message}</div>
      {result && <>
        {!!result.failures.length && <ul>{result.failures.map((failure, i) => <li key={i}>{failure}</li>)}</ul>}
        <button className="icon-button" aria-label="Dismiss upload results" onClick={() => setResult(null)}><X size={16} /></button>
      </>}
    </aside>}
  </> };
}

export function useUploadDrop(onFiles?: (files: File[], event: DragEvent) => void) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const enabled = !!onFiles;
  useEffect(() => { if (!enabled) { depth.current = 0; setDragging(false); } }, [enabled]);
  const isFiles = (e: DragEvent) => !!onFiles && (Array.from(e.dataTransfer.types).includes("Files") || Array.from(e.dataTransfer.items).some(item => item.kind === "file"));
  return { dragging, dropProps: {
    onDragEnter: (e: DragEvent) => { if (isFiles(e)) { e.preventDefault(); depth.current++; setDragging(true); } },
    onDragOver: (e: DragEvent) => { if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } },
    onDragLeave: (e: DragEvent) => { if (isFiles(e) && --depth.current <= 0) { depth.current = 0; setDragging(false); } },
    onDrop: (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      onFiles?.(Array.from(e.dataTransfer.files), e);
    },
  } };
}

export function UploadDrawer({ w, orgId, uploads, onReference, onPlace }: {
  w: Workspace; orgId?: string | null; uploads: UploadControls;
  onReference: React.ComponentProps<typeof LibraryImages>["onReference"];
  onPlace: React.ComponentProps<typeof LibraryImages>["onPlace"];
}) {
  const [destination, setDestination] = useState<{ id: string; batch: number } | null>(null);
  const reveal: Reveal = id => setDestination(previous => ({ id, batch: (previous?.batch || 0) + 1 }));
  const { dragging, dropProps } = useUploadDrop(files => uploads.addFiles(files, reveal));
  return <div className={`editor-library upload-drop-zone ${dragging ? "upload-dragging" : ""}`} {...dropProps}>
    <div className="panel-heading">YOUR UPLOADS</div>
    {dragging && <div className="upload-drop-hint">Drop images to upload</div>}
    <LibraryImages key={destination?.batch || 0} w={w} orgId={destination?.id || orgId} kind="upload" onReference={onReference} onPlace={onPlace} clickToPlace
      uploadCard={<button className="mini-asset library-image-trigger upload-card" disabled={uploads.busy} onClick={() => uploads.chooseFiles(reveal)} aria-label="Upload images">
        <span className="mini-asset-preview"><Upload size={30} /></span><strong>Upload images</strong>
      </button>} />
  </div>;
}
