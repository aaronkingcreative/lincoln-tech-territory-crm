'use client';

import { useState } from 'react';

export default function ImportSchoolsPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/admin/import-schools', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Import failed');
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-bold text-slate-100">Import territory schools</h1>
      <p className="mt-3 text-slate-300">
        Runs the protected Supabase seed importer against the embedded <code>data/territory-schools.ts</code> seed module,
        so it works on Vercel without reading a CSV from the filesystem. Only approved admin emails can access this page and API route.
      </p>
      <button
        className="mt-6 rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        onClick={runImport}
        type="button"
      >
        {loading ? 'Importing…' : 'Run school import'}
      </button>
      {error ? <pre className="mt-6 overflow-auto rounded border border-red-800 bg-red-950 p-4 text-red-100">{error}</pre> : null}
      {result ? (
        <pre className="mt-6 overflow-auto rounded border border-slate-800 bg-slate-950 p-4 text-slate-100">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
