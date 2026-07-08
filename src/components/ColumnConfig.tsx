"use client";

import { DEFAULT_COLUMNS } from "@/lib/columns";

// The client only tracks label + description; the server re-derives unique keys (validateColumns),
// so a stable local `id` is used purely for React list identity and remove operations.
export type EditableColumn = { id: string; label: string; description: string };

export function defaultEditableColumns(): EditableColumn[] {
  // Deterministic ids for the defaults (their column keys) avoid any SSR/client hydration mismatch.
  return DEFAULT_COLUMNS.map((c) => ({ id: c.key, label: c.label, description: c.description }));
}

type Props = {
  columns: EditableColumn[];
  onChange: (cols: EditableColumn[]) => void;
  disabled?: boolean;
};

export default function ColumnConfig({ columns, onChange, disabled }: Props) {
  const update = (id: string, patch: Partial<EditableColumn>) =>
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(columns.filter((c) => c.id !== id));
  const add = () =>
    onChange([...columns, { id: crypto.randomUUID(), label: "", description: "" }]);
  const reset = () => onChange(defaultEditableColumns());

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Columns</h2>
          <p className="text-xs text-zinc-500">
            Define the columns Gemini fills for each step. Different clients use different templates.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="shrink-0 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
        >
          Reset to default
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {columns.map((c) => (
          <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <input
              value={c.label}
              onChange={(e) => update(c.id, { label: e.target.value })}
              placeholder="Label (e.g. Module)"
              disabled={disabled}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50 sm:mt-0 sm:w-48 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <textarea
              value={c.description}
              onChange={(e) => update(c.id, { description: e.target.value })}
              placeholder="What Gemini should put in this column. This instruction steers the extraction, so it defines what the column means."
              disabled={disabled}
              rows={2}
              className="w-full flex-1 resize-y rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={disabled || columns.length <= 1}
              title={columns.length <= 1 ? "At least one column is required" : "Remove column"}
              className="shrink-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        + Add column
      </button>
    </section>
  );
}
