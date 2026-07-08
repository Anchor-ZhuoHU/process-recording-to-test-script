import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import type { ColumnDef } from "./types";

// One bullet per column, injected into the task prompt so the model knows what each column means.
export function buildColumnInstructions(columns: ColumnDef[]): string {
  return columns
    .map((c) => `- ${c.label} (key: ${c.key}): ${c.description || "no extra guidance"}`)
    .join("\n");
}

// Tolerant parser for ONE step of the model's JSON output. Each configured column and the timestamp
// fall back to a safe default on a missing or wrong-typed value (`.catch`), and unknown keys are
// dropped by the default object behavior. So a bad template degrades a cell, it never throws.
// This is the Part 2 "does not break generation" guarantee on the parsing side.
export function buildStepZod(columns: ColumnDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of columns) {
    shape[c.key] = z.string().catch("");
  }
  shape.timestamp = z.string().catch("00:00");

  return z.object(shape);
}

// The Gemini responseSchema for the whole result: an ARRAY of step objects, each with a STRING
// property per configured column plus a STRING `timestamp`. Built from the SAME columns array that
// drives the prompt and the table, so custom columns stay in lockstep. `propertyOrdering` locks the
// key order (verified to matter for output quality in the live-API probe, D4 / D10).
export function buildResponseSchema(columns: ColumnDef[]): Schema {
  const properties: Record<string, Schema> = {
    timestamp: {
      type: Type.STRING,
      description: "Time this step occurs in the video, format MM:SS (e.g. 01:15).",
    },
  };
  for (const c of columns) {
    properties[c.key] = {
      type: Type.STRING,
      description: c.description || c.label,
    };
  }

  const ordering = ["timestamp", ...columns.map((c) => c.key)];

  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties,
      required: ordering,
      propertyOrdering: ordering,
    },
  };
}
