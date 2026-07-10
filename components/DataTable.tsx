'use client';

import { useMemo, useState } from 'react';
import { ScrollableTable } from './ScrollableTable';

export function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('');
  const cols = useMemo(() => Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 14), [rows]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const missingField = filter.startsWith('missing:') ? filter.slice(8) : '';
    const hasField = filter.startsWith('has:') ? filter.slice(4) : '';
    return rows
      .filter((r) => !q || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)))
      .filter((r) => !missingField || !String(r[missingField] ?? '').trim())
      .filter((r) => !hasField || !!String(r[hasField] ?? '').trim())
      .sort((a, b) => sort ? String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) : 0);
  }, [rows, query, filter, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search table…" className="min-w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="all">All rows</option><option value="missing:website">Missing website</option><option value="has:website">Has website</option><option value="missing:phone">Missing phone</option><option value="missing:source_url">Missing source URL</option><option value="missing:date_verified">Needs verification date</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="">Original order</option>{cols.map((c) => <option key={c} value={c}>Sort by {c}</option>)}</select>
        <div className="ml-auto py-2 text-sm text-slate-400">Showing {filtered.length} of {rows.length}</div>
      </div>
      <ScrollableTable className="rounded-xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/30">
        <table className="min-w-full text-sm text-slate-300"><thead className="sticky top-0 bg-slate-950/90 text-slate-100"><tr>{cols.map((c) => <th className="border-b border-slate-800 p-3 text-left font-semibold" key={c}>{c}</th>)}</tr></thead>
          <tbody>{filtered.map((r, i) => <tr className="transition odd:bg-slate-900 even:bg-slate-900/60 hover:bg-slate-800/70" key={String(r.id ?? i)}>{cols.map((c) => <td className="max-w-xs truncate border-b border-slate-800 p-3 align-top" key={c}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody></table>
        {!filtered.length ? <div className="p-8 text-center text-slate-400">No rows match the current filters.</div> : null}
      </ScrollableTable>
    </div>
  );
}
