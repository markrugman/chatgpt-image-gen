import type { Template, TemplateInput } from "./types";

export const templateDefaults = (t: Template): Record<string, string> => Object.fromEntries((t.inputs || []).map(i => [i.id, i.defaultValue]));
export function inputError(i: TemplateInput, value: string): string {
  if (!value.trim()) return i.required ? `Enter ${i.label}` : "";
  if (i.kind === "colour" && !/^#[0-9a-f]{6}$/i.test(value)) return `Choose a valid ${i.label}`;
  if (i.kind === "choice" && !i.choices.includes(value)) return `Choose a valid ${i.label}`;
  return "";
}
export function templateErrors(t: Template, answers: Record<string, string>, hasSubject: boolean): Record<string, string> {
  const errors = Object.fromEntries((t.inputs || []).map(i => [i.id, inputError(i, answers[i.id] || "")]).filter(([, e]) => e));
  if (t.subjectRequirement === "required" && !hasSubject) errors.subject = "Add at least one image as Subject";
  return errors;
}
