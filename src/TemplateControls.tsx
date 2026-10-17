import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { inputError } from "./templateInputs";
import type { Template, TemplateInput } from "./types";

export function TemplateDetails({ template, answers, focus, showErrors, onApply, onClose }: {
  template: Template; answers: Record<string, string>; focus?: string; showErrors?: boolean;
  onApply: (answers: Record<string, string>) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...answers });
  const [checked, setChecked] = useState(!!showErrors);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = focus && body.current?.querySelector<HTMLElement>(`[data-input="${focus}"]`);
    if (target) target.focus();
  }, [focus]);
  const errors = (template.inputs || []).filter(i => !!draft[i.id]?.trim() && inputError(i, draft[i.id] || ""));
  return <Modal title="Template details" subtitle={template.name} onClose={onClose}>
    <form className="template-details-form" onSubmit={e => { e.preventDefault(); setChecked(true); if (!errors.length) onApply(draft); else body.current?.querySelector<HTMLElement>(`[data-input="${errors[0].id}"]`)?.focus(); }}>
      <div className="form-body" ref={body}>
        <p className="muted">Edit these values here; they take priority over conflicting additional instructions.</p>
        {template.usageNotes && <p>{template.usageNotes}</p>}
        {checked && errors.length > 0 && <div role="alert" className="error">Correct the highlighted answers, or Cancel to keep your previous answers.</div>}
        {(template.inputs || []).map(i => {
          const value = draft[i.id] || "", error = checked ? inputError(i, value) : "";
          const props = { "data-input": i.id, id: `answer-${i.id}`, "aria-invalid": !!error, "aria-describedby": error ? `answer-error-${i.id}` : undefined, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft(d => ({ ...d, [i.id]: e.target.value })) };
          return <div className="template-answer" key={i.id}>
            <label htmlFor={props.id}>{i.label}{!i.required && " (optional)"}</label>
            {i.kind === "choice" ? <select {...props}><option value="">Choose…</option>{i.choices.map(c => <option key={c}>{c}</option>)}</select>
              : i.kind === "colour" ? <div className="template-colour"><input type="color" aria-label={`${i.label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={e => setDraft(d => ({ ...d, [i.id]: e.target.value }))} /><input {...props} placeholder="#3366ff" spellCheck={false} />{!i.required && <button type="button" className="text-button" onClick={() => setDraft(d => ({ ...d, [i.id]: "" }))}>Clear</button>}</div>
              : <textarea {...props} rows={2} />}
            {error && <p id={`answer-error-${i.id}`} className="error">{error}</p>}
          </div>;
        })}
        {!template.inputs?.length && <p>This Template has no configurable answers.</p>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Apply</button></div>
    </form>
  </Modal>;
}

export function TemplateInputDialog({ input, selection, hasOptionalPhrase, onSave, onRemove, onClose }: {
  input?: TemplateInput; selection: string; hasOptionalPhrase: boolean;
  onSave: (input: TemplateInput, markPhrase: boolean) => void; onRemove?: () => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<TemplateInput>(input || { id: "", label: "", kind: "text", required: true, defaultValue: "", choices: [] });
  const [markPhrase, setMarkPhrase] = useState(false), [error, setError] = useState("");
  const canMark = !!input && selection.includes(`{{${input.id}}}`) && !selection.includes("{{#") && !selection.includes("{{/");
  return <Modal title={input ? "Edit input" : "Insert input"} onClose={onClose}>
    <form className="template-details-form" onSubmit={e => {
      e.preventDefault();
      if (!draft.label.trim()) { setError("Enter a name for this input."); return; }
      if (draft.kind === "choice" && (!draft.choices.length || draft.choices.some(c => !c.trim()) || new Set(draft.choices).size !== draft.choices.length)) { setError("Enter distinct choices, one per line."); return; }
      if (draft.defaultValue && inputError({ ...draft, required: false }, draft.defaultValue)) { setError("Choose a valid default answer."); return; }
      if (!draft.required && !hasOptionalPhrase && !markPhrase) { setError("Insert this input first, then select its complete optional phrase in the prompt and edit the input."); return; }
      onSave({ ...draft, label: draft.label.trim() }, markPhrase);
    }}>
      <div className="form-body">
        <label>Input name<input aria-label="Input name" autoFocus placeholder="e.g. Hat colour" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} /></label>
        <label>Answer type<select aria-label="Answer type" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as TemplateInput["kind"], defaultValue: "", choices: [] }))}><option value="text">Text</option><option value="colour">Colour</option><option value="choice">Choose from a list</option></select></label>
        {draft.kind === "choice" && <label>Choices<textarea aria-label="Choices" rows={4} placeholder={"Running through the woods\nSitting under a tree"} value={draft.choices.join("\n")} onChange={e => setDraft(d => ({ ...d, choices: e.target.value.split("\n") }))} /></label>}
        <details><summary>Defaults and optional wording</summary>
          <label>Default answer (optional){draft.kind === "choice" ? <select aria-label="Default answer (optional)" value={draft.defaultValue} onChange={e => setDraft(d => ({ ...d, defaultValue: e.target.value }))}><option value="">No default</option>{draft.choices.filter(Boolean).map((c,n) => <option key={n}>{c}</option>)}</select> : <input value={draft.defaultValue} placeholder={draft.kind === "colour" ? "#3366ff" : "No default"} onChange={e => setDraft(d => ({ ...d, defaultValue: e.target.value }))} />}</label>
          <label className="template-checkbox"><input type="checkbox" checked={draft.required} onChange={e => setDraft(d => ({ ...d, required: e.target.checked }))} />An answer is required</label>
          {!draft.required && <p className="muted">An empty answer omits its whole phrase. Select that phrase in the prompt before opening this editor.</p>}
          {!draft.required && canMark && <label className="template-checkbox"><input type="checkbox" checked={markPhrase} onChange={e => setMarkPhrase(e.target.checked)} />Omit the selected phrase when empty</label>}
          {!draft.required && hasOptionalPhrase && <p className="muted">Optional wording is already configured.</p>}
        </details>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer">{onRemove && <button type="button" className="text-button danger-text" onClick={onRemove}>Remove input</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{input ? "Save input" : "Insert input"}</button></div>
    </form>
  </Modal>;
}
