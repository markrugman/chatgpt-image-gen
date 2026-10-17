import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ImageView, Modal } from "./ui";
import { TemplateDetails } from "./TemplateControls";
import { templateErrors } from "./templateInputs";
import type { Template, TemplateRequest } from "./types";

export function TemplateComposer({ template, answers, hasSubject, preview, previewError, showErrors, current, historicalSettings, onAnswers, onRemove, onLatest, onSettings, onSubject, onImport }: {
  template: Template; answers: Record<string, string>; hasSubject: boolean; preview: TemplateRequest | null; previewError: string; showErrors: boolean;
  current?: Template; historicalSettings: string; onAnswers: (a: Record<string, string>) => void; onRemove: () => void;
  onLatest: () => void; onSettings: () => void; onSubject: (kind: "asset" | "upload") => void; onImport: (files: File[]) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null), [subject, setSubject] = useState(false);
  const errors = templateErrors(template, answers, hasSubject), missing = Object.keys(errors).length;
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (showErrors) summary.current?.focus(); }, [showErrors]);
  const inputs = template.inputs || [];
  return <div className="selected-template configurable-template">
    {template.exampleImageId && <ImageView id={template.exampleImageId} alt="Selected template example" />}
    <button className="template-name text-button" onClick={() => setFocus("")}>{template.name}</button>
    <small>{template.mode === "discuss" ? "Discuss" : "Generate"}</small>
    <button className="text-button" onClick={() => setFocus("")}>Edit details</button>
    <button className="template-remove" aria-label="Remove template" onClick={onRemove}><X size={16} /></button>
    {(inputs.length > 0 || template.subjectRequirement === "required" || template.subjectRequirement === "optional") && <div className="template-status" aria-live="polite">
      {missing ? `${missing} ${missing === 1 ? "detail" : "details"} remaining` : "✓ Ready"}
      {!missing && inputs.map(i => answers[i.id]).filter(Boolean).slice(0,3).map((v,n) => <span key={n} title={v}> · {v}</span>)}
    </div>}
    {!!missing && <div className="template-input-pills">
      {template.subjectRequirement === "required" && !hasSubject && <button onClick={() => setSubject(true)}>Subject: Add image · required</button>}
      {inputs.slice(0, hasSubject || template.subjectRequirement !== "required" ? 3 : 2).map(i => <button key={i.id} onClick={() => setFocus(i.id)} title={`${i.label}: ${answers[i.id] || "Not answered"}`} className={errors[i.id] ? "incomplete" : ""}>{i.kind === "colour" && /^#[0-9a-f]{6}$/i.test(answers[i.id] || "") && <i style={{ background: answers[i.id] }} />}{i.label}: {answers[i.id] || (i.required ? "Enter · required" : "Optional")}</button>)}
      {inputs.length > (hasSubject || template.subjectRequirement !== "required" ? 3 : 2) && <button onClick={() => setFocus("")}>View all · {Object.keys(errors).filter(id => id !== "subject").length} answers remaining</button>}
    </div>}
    {template.subjectRequirement === "optional" && !hasSubject && <button className="text-button" onClick={() => setSubject(true)}>Add Subject (optional)</button>}
    {historicalSettings && <p role="alert">{historicalSettings} <button className="text-button" onClick={onSettings}>Use current document settings</button></p>}
    {(!current || current.deletedAt) ? <small>Template deleted</small> : current.version !== template.version && <small>Template updated <button className="text-button" onClick={onLatest}>Use latest</button></small>}
    {showErrors && (!!missing || previewError) && <div className="template-error-summary" role="alert" tabIndex={-1} ref={summary}><strong>Complete the Template details</strong>{Object.entries(errors).map(([id,error]) => <button className="text-button" key={id} onClick={() => id === "subject" ? setSubject(true) : setFocus(id)}>{error}</button>)}{!missing && previewError && <p>{previewError}</p>}</div>}
    <details className="template-completed-instructions"><summary>View completed instructions</summary>{missing ? <p>{Object.values(errors).join("; ")}</p> : preview ? <pre>{preview.instructions}</pre> : <p>{previewError || "Preparing instructions…"}</p>}</details>
    {focus !== null && <TemplateDetails template={template} answers={answers} focus={focus} showErrors={showErrors} onApply={a => { onAnswers(a); setFocus(null); }} onClose={() => setFocus(null)} />}
    {subject && <Modal title="Add Subject" subtitle="Photographs of the same person, character or object." onClose={() => setSubject(false)}>
      <div className="form-body template-subject-picker"><button className="button secondary" onClick={() => { setSubject(false); onSubject("upload"); }}>Choose an upload</button><button className="button secondary" onClick={() => { setSubject(false); onSubject("asset"); }}>Choose an asset or design page</button>
        <label>Import Subject images<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { const files = Array.from(e.target.files || []); if (files.length) { setSubject(false); onImport(files); } }} /></label>
      </div>
    </Modal>}
  </div>;
}
