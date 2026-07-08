"use client";

import { useState } from "react";
import type { ProcessResult } from "@/lib/types";
import UploadForm from "@/components/UploadForm";
import StepsTable from "@/components/StepsTable";
import ProgressIndicator from "@/components/ProgressIndicator";
import ColumnConfig, { defaultEditableColumns } from "@/components/ColumnConfig";

export default function Home() {
  // The column config is the single source of truth: it drives the Gemini prompt, the response
  // schema, and the table headers (Part 2). The server re-derives keys, so the client tracks only
  // label + description.
  const [columns, setColumns] = useState(defaultEditableColumns);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Process Recording to Test Script</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a screen recording of a business process and get an ordered test script.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <ColumnConfig columns={columns} onChange={setColumns} disabled={loading} />
        <UploadForm
          columns={columns}
          onLoading={setLoading}
          onResult={setResult}
          onError={setError}
        />
      </div>

      {loading && <ProgressIndicator />}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {result && <StepsTable result={result} />}
    </main>
  );
}
