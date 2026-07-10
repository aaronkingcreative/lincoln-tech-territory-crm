'use client';

import { useEffect, useState } from 'react';

const actions = [
  ['Discover schools and districts', '/api/admin/discover/start-schools'],
  ['Discover school websites', '/api/admin/discover/start-websites'],
  ['Discover contacts', '/api/admin/discover/start-contacts'],
  ['Run next crawl batch', '/api/admin/discover/run-batch'],
] as const;

export default function DiscoverPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/admin/discover/status');
    const body = await response.json();
    if (response.ok) setStatus(body);
  }
  useEffect(() => { refresh().catch(() => undefined); }, []);
  async function run(label: string, url: string) {
    setLoading(label); setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 5 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Discovery action failed');
      setResult(body); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Discovery action failed'); }
    finally { setLoading(null); }
  }

  return <main className="mx-auto max-w-6xl p-6">
    <h1 className="text-3xl font-bold">Discover schools, websites, and contacts</h1>
    <p className="mt-3 text-slate-300">Admin-only workflow for official-source discovery in Ontario, Oregon and the approved southern Idaho corridor. Crawls run in small batches for Vercel.</p>
    <div className="mt-6 flex flex-wrap gap-3">{actions.map(([label, url]) => <button key={url} onClick={() => run(label, url)} disabled={!!loading} className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60">{loading === label ? 'Running…' : label}</button>)}<button onClick={refresh} className="rounded border border-slate-700 px-4 py-2">View crawl results/errors</button></div>
    {error ? <pre className="mt-6 rounded border border-red-800 bg-red-950 p-4 text-red-100">{error}</pre> : null}
    <section className="mt-6 grid gap-4 md:grid-cols-3">{Object.entries((status?.counts as Record<string, number>) ?? {}).map(([k,v]) => <div className="rounded border border-slate-800 bg-slate-900 p-5" key={k}><div className="text-3xl font-bold">{v}</div><div className="capitalize text-slate-400">{k}</div></div>)}</section>
    <div className="mt-6 grid gap-4 md:grid-cols-2"><pre className="overflow-auto rounded border border-slate-800 bg-slate-950 p-4 text-sm">{JSON.stringify(status, null, 2)}</pre><pre className="overflow-auto rounded border border-slate-800 bg-slate-950 p-4 text-sm">{JSON.stringify(result, null, 2)}</pre></div>
  </main>;
}
