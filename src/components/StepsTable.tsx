"use client";

import { useEffect, useState } from "react";
import type { ProcessResult, Step } from "@/lib/types";
import Screenshot from "./Screenshot";
import { downloadCsv } from "@/lib/export";

// An in-place editable table cell. Gemini's extraction is a draft: a consultant tweaks it (e.g.
// translate a pt-BR label to English, or fix a misread ID) and the edit is saved when the cell
// loses focus. contentEditable keeps natural cell sizing; commit happens only on blur, so a
// re-render never lands mid-typing.
function EditableCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? "";
        if (next !== value) {
          onCommit(next);
        }
      }}
      className="-mx-1 min-w-[8rem] cursor-text rounded px-1 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 dark:focus:bg-blue-950/40"
    >
      {value}
    </div>
  );
}

type Props = { result: ProcessResult };

export default function StepsTable({ result }: Props) {
  const { columns } = result;

  // The generated steps are a starting point; keep an editable copy and reset it when a new result
  // loads (a fresh upload). Edits live here and feed the CSV export.
  const [steps, setSteps] = useState<Step[]>(result.steps);
  useEffect(() => setSteps(result.steps), [result]);

  const editCell = (i: number, key: string, value: string) =>
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, values: { ...s.values, [key]: value } } : s)),
    );

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">{steps.length} steps &middot; click any cell to edit</p>
        <button
          type="button"
          onClick={() => downloadCsv(result.videoName, columns, steps)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="px-3 py-2 font-medium">#</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Screenshot</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top dark:border-zinc-800">
                <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    <EditableCell
                      value={step.values[c.key] ?? ""}
                      onCommit={(v) => editCell(i, c.key, v)}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{step.timestamp}</td>
                <td className="px-3 py-2">
                  <Screenshot src={step.screenshot} alt={`Step ${i + 1}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
