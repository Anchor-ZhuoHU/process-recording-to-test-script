"use client";

import { useState } from "react";
import { DEFAULT_COLUMNS } from "@/lib/columns";
import type { ProcessResult } from "@/lib/types";
import UploadForm from "@/components/UploadForm";
import StepsTable from "@/components/StepsTable";

export default function Home() {
  // M4 makes this editable via ColumnConfig; for now it is the fixed default template.
  const [columns] = useState(DEFAULT_COLUMNS);
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

      <UploadForm
        columns={columns}
        onLoading={setLoading}
        onResult={setResult}
        onError={setError}
      />

      {loading && <p className="mt-6 text-sm text-zinc-500">Generating test script...</p>}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {result && <StepsTable result={result} />}
    </main>
  );
}
