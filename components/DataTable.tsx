export function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 12);

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/30">
      <table className="min-w-full text-sm text-slate-300">
        <thead className="bg-slate-950/60 text-slate-100">
          <tr>
            {cols.map((c) => (
              <th className="border-b border-slate-800 p-2 text-left font-semibold" key={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className="transition odd:bg-slate-900 even:bg-slate-900/60 hover:bg-slate-800/70" key={String(r.id ?? i)}>
              {cols.map((c) => (
                <td className="border-b border-slate-800 p-2 align-top" key={c}>
                  {String(r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
