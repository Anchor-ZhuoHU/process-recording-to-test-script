import type { ColumnDef } from "./types";

// The default client template: the three columns a consultant test script always has.
export const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    key: "action",
    label: "Action",
    description: "High-level action taken, e.g. 'Create purchase requisition'.",
  },
  {
    key: "description",
    label: "Description",
    description: "What the user did in detail: fields filled, buttons clicked, values entered.",
  },
  {
    key: "expectedResult",
    label: "Expected Result",
    description: "The expected system state or response after this step.",
  },
];

const MAX_COLUMNS = 12;

// Turn a human label into a stable, JS-identifier-safe object key. camelCase of the alnum words.
export function slugify(label: string): string {
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return "column";
  }

  return words
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
}

export type ValidateResult =
  | { ok: true; columns: ColumnDef[]; notes: string[] }
  | { ok: false; errors: string[] };

// Normalize arbitrary column input into unique-keyed ColumnDefs. Tolerant by design so a bad
// template degrades (drops junk entries) instead of crashing the run. This is the Part 2 guard.
export function validateColumns(input: unknown): ValidateResult {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["columns must be an array"] };
  }

  const notes: string[] = [];
  const columns: ColumnDef[] = [];
  const usedKeys = new Set<string>();

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) {
      continue; // drop entries without a usable label
    }
    const description =
      typeof record.description === "string" ? record.description.trim() : "";

    // Derive a unique key; on collision append -2, -3, ...
    let key = slugify(label);
    if (usedKeys.has(key)) {
      let n = 2;
      while (usedKeys.has(`${key}-${n}`)) {
        n++;
      }
      key = `${key}-${n}`;
    }
    usedKeys.add(key);

    columns.push({ key, label, description });
  }

  if (columns.length === 0) {
    return { ok: false, errors: ["at least one column with a non-empty label is required"] };
  }

  if (columns.length > MAX_COLUMNS) {
    notes.push(`kept the first ${MAX_COLUMNS} columns (received ${columns.length})`);
    columns.length = MAX_COLUMNS;
  }

  return { ok: true, columns, notes };
}
