import type { ProcessResult } from "@/lib/types";

type Props = { result: ProcessResult };

export default function StepsTable({ result }: Props) {
  const { columns, steps } = result;

  return (
    <div className="mt-8 overflow-x-auto">
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
                  {step.values[c.key] ?? ""}
                </td>
              ))}
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{step.timestamp}</td>
              <td className="px-3 py-2">
                {step.screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={step.screenshot} alt={`Step ${i + 1}`} className="h-16 rounded" />
                ) : (
                  <span className="text-xs text-zinc-400">no frame</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
