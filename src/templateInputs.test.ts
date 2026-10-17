import { describe, expect, it } from "vitest";
import { inputError, templateDefaults, templateErrors } from "./templateInputs";
import type { Template } from "./types";

const template = { subjectRequirement: "required", inputs: [
  { id: "colour", label: "Hat colour", kind: "colour", required: true, defaultValue: "#3366ff", choices: [] },
  { id: "doing", label: "Doing", kind: "choice", required: true, defaultValue: "", choices: ["Run", "Sit"] },
  { id: "title", label: "Title", kind: "text", required: false, defaultValue: "", choices: [] },
] } as Template;
describe("Template readiness", () => {
  it("counts only missing or invalid details and requires an explicit Subject", () => {
    const answers = templateDefaults(template);
    expect(Object.keys(templateErrors(template, answers, false))).toEqual(["doing", "subject"]);
    answers.doing = "Run";
    expect(templateErrors(template, answers, true)).toEqual({});
    answers.colour = "blue";
    expect(templateErrors(template, answers, true)).toEqual({ colour: "Choose a valid Hat colour" });
  });
  it("rejects arbitrary choices and permits clearing optional answers", () => {
    expect(inputError(template.inputs![1], "Fly")).toBeTruthy();
    expect(inputError(template.inputs![2], "")).toBe("");
    expect(inputError(template.inputs![0], "#Aa03fF")).toBe("");
  });
});
