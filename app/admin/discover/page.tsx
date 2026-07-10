'use client';

import { useEffect, useState } from 'react';
import HelpIcon from '@/components/HelpIcon';

const actions = [
  ['Discover Schools and Districts', '/api/admin/discover/start-schools'],
  ['Discover School Websites', '/api/admin/discover/start-websites'],
  ['Discover Contacts', '/api/admin/discover/start-contacts'],
  ['Run Next Crawl Batch', '/api/admin/discover/run-batch'],
] as const;

function Stat({ label, value, tone = '' }: { label: string; value: unknown; tone?: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className={`text-2xl font-bold ${tone}`}>{String(value ?? 0)}</div><div className="text-sm text-slate-400">{label}</div></div>;
}

function summarize(body: any) {
  const summary = body?.summary ?? body ?? {};
  if (summary.message) return summary.message;
  if ('inserted' in summary || 'skipped' in summary) return `Completed. Inserted ${summary.inserted ?? 0}, updated ${summary.updated ?? 0}, skipped ${summary.skipped ?? 0}.`;
  return 'Completed.';
}

export default function DiscoverPage() {
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [actionState, setActionState] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState('');

  async function refresh() {
    const response = await fetch('/api/admin/discover/status', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Status refresh failed');
    setStatus(body);
    setRefreshed(new Date().toLocaleTimeString());
  }

  useEffect(() => { refresh().catch((e) => setError(e instanceof Error ? e.message : 'Status refresh failed')); }, []);

  async function run(label: string, url: string) {
    setLoading(label);
    setError(null);
    setActionState((current) => ({ ...current, [label]: { state: 'Running' } }));
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 5 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Discovery action failed');
      setActionState((current) => ({ ...current, [label]: { state: 'Completed', at: new Date().toLocaleString(), summary: summarize(body), raw: body } }));
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Discovery action failed';
      setError(message);
      setActionState((current) => ({ ...current, [label]: { state: 'Failed', at: new Date().toLocaleString(), summary: message } }));
    } finally {
      setLoading(null);
    }
  }

  const by = status?.queue?.byStatus ?? {};
  const last = status?.lastRun;
  const duplicates = status?.queue?.duplicateTargets ?? [];

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div><p className="text-sm uppercase tracking-[.25em] text-sky-300">Human-guided crawl workflow</p><h1 className="mt-2 text-3xl font-bold">Discover schools, websites, and contacts <HelpIcon topic="How to use Discovery" /></h1><p className="mt-2 text-slate-400">Use these controls in order. Status cards read live crawl_queue and discovery_runs data and include duplicate/contact-debug visibility.</p></div>

    <section className="rounded-2xl border border-sky-900/60 bg-slate-900 p-6"><h2 className="text-xl font-semibold">Step guidance</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-300"><li>Run Discover Schools and Districts.</li><li>Run Discover School Websites.</li><li>Run Discover Contacts.</li><li>Run Crawl Batch until pending is 0 or progress stalls.</li></ol><p className="mt-3 text-sm text-amber-100">Stop before more batches if pending grows unexpectedly or duplicate targets appear below.</p></section>

    {status?.stuckRunning ? <div className="rounded-xl border border-amber-700 bg-amber-950 p-4 text-amber-100">Some discovery runs appear stuck. Ask Aaron to reset stale runs.</div> : null}

    <section className="grid gap-4 md:grid-cols-4"><Stat label="Pending" value={by.pending} /><Stat label="Running" value={by.running} /><Stat label="Complete" value={by.complete} /><Stat label="Failed" value={by.failed} /><Stat label="Recent batch processed" value={status?.lastSuccessfulBatch?.pages_checked ?? 0} /><Stat label="Contacts in database" value={status?.counts?.contacts ?? 0} tone={(status?.counts?.contacts ?? 0) === 0 ? 'text-amber-200' : 'text-emerald-200'} /><Stat label="Last successful batch" value={status?.lastSuccessfulBatch?.completed_at ?? 'none'} /><Stat label="Last failed batch" value={status?.lastFailedBatch?.completed_at ?? 'none'} /></section>

    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">Queued targets by type</h2><div className="mt-2 flex flex-wrap gap-2 text-sm">{Object.entries(status?.queue?.byType ?? {}).map(([key, value]) => <span key={key} className="rounded-full bg-slate-950 px-3 py-1">{key}: {String(value)}</span>)}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-semibold">Duplicate queue targets</h2>{duplicates.length ? <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm text-amber-100">{duplicates.map((row: any) => <li key={`${row.target_type}-${row.target_url}`}>{row.count}× {row.target_type}: {row.target_url}</li>)}</ul> : <p className="mt-2 text-sm text-slate-400">No duplicate normalized queue targets detected.</p>}<details className="mt-3"><summary className="cursor-pointer text-sm text-sky-200">Safe duplicate cleanup SQL</summary><pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{status?.cleanupSql}</pre></details></div></section>

    <div className="grid gap-3 md:grid-cols-2">{actions.map(([label, url]) => { const state = actionState[label] ?? { state: 'Not run yet' }; const tone = state.state === 'Completed' ? 'border-emerald-700 bg-emerald-950/30' : state.state === 'Failed' ? 'border-red-700 bg-red-950/30' : state.state === 'Running' ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800 bg-slate-900'; return <div key={url} className={`rounded-xl border p-4 ${tone}`}><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{label}</h3><p className="text-sm text-slate-300">{state.state}{state.at ? ` · ${state.at}` : ''}</p></div><button onClick={() => run(label, url)} disabled={!!loading} className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60">{loading === label ? 'Running…' : 'Run'}</button></div>{state.summary ? <p className="mt-3 text-sm text-slate-100">{state.summary}</p> : null}{state.raw ? <details className="mt-3"><summary className="cursor-pointer text-sm text-sky-200">Technical details</summary><pre className="mt-2 max-h-72 overflow-auto text-xs text-slate-300">{JSON.stringify(state.raw, null, 2)}</pre></details> : null}</div>; })}</div>

    <div className="flex flex-wrap gap-3"><button onClick={() => refresh().catch((e) => setError(e instanceof Error ? e.message : 'Status refresh failed'))} className="rounded-xl border border-slate-700 px-4 py-2">Refresh Status</button><span className="py-2 text-sm text-slate-400">Last refreshed: {refreshed || 'not yet'}</span></div>
    {error ? <pre className="rounded-xl border border-red-800 bg-red-950 p-4 text-red-100">{error}</pre> : null}
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h2 className="mb-2 font-semibold">Recent discovery runs and raw status</h2><pre className="max-h-96 overflow-auto text-xs text-slate-300">{JSON.stringify({ lastRun: last, recentRuns: status?.recentRuns, recentErrors: status?.recentErrors }, null, 2)}</pre></section>
  </main>;
}
