import type { ColumnDef } from "./types";
import { buildColumnInstructions } from "./schema";

// The analyst persona. Kept separate from the task so it can be passed as `systemInstruction`.
export const SYSTEM_INSTRUCTION = [
  "You are a business-process analyst.",
  "You are given a screen recording of someone performing a process in an ERP system (SAP, Oracle, and similar).",
  "Produce a consultant-grade test script: an ordered list of discrete, meaningful steps.",
  "Read on-screen field values, labels, and button text accurately. Do not invent steps.",
  "Merge trivial UI micro-actions into one meaningful step.",
  "The recording is silent; rely only on what is visible on screen.",
].join(" ");

// The per-request task prompt. The column set is the single source of truth: it drives this prompt,
// the response schema, and the table headers, so custom columns cannot desync generation.
export function buildTaskPrompt(columns: ColumnDef[]): string {
  return [
    "Analyze the attached screen recording and produce an ordered list of the discrete steps the user performs.",
    "",
    "For each step, fill in exactly these fields:",
    buildColumnInstructions(columns),
    "",
    'Also include a "timestamp" field: the MM:SS time of the clearest frame that represents the step.',
    "The video is sampled at about 1 frame per second, so second-level granularity is expected.",
    "",
    "Return JSON only, matching the provided schema. Do not include prose, markdown, or code fences.",
  ].join("\n");
}
