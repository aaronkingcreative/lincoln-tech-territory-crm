'use client';

import { useState } from 'react';
import HelpIcon from '@/components/HelpIcon';

type CountSummary = { inserted?: number; updated?: number; skipped?: number };
type ImportResult = {
  importedBy?: string;
  importedAt?: string;
  summary?: {
    districts?: CountSummary;
    schools?: CountSummary & { missingRequiredData?: number };
    errors?: string[];
  };
};

function count(summary: CountSummary | undefined, key: keyof CountSummary) {
  return Number(summary?.[key] ?? 0);
}

export default function ImportSchoolsPage() {
  const [result, setResult] = useState<ImportResult | null>(null);
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

  const schoolSummary = result?.summary?.schools;
  const districtSummary = result?.summary?.districts;
  const nothingChanged = result
    ? count(schoolSummary, 'inserted') + count(schoolSummary, 'updated') + count(districtSummary, 'inserted') + count(districtSummary, 'updated') === 0
    : false;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <p className="text-sm uppercase tracking-[.25em] text-sky-300">Admin workflow</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-100">Run a School Import <HelpIcon topic="What does Run a School Import do?"/></h1>
        <p className="mt-3 text-slate-300">
          This button loads the approved school and district list into the website. Use it after Aaron or Codex adds new territory schools, fixes the approved school list, or adds a new county such as Ada County. It updates the website’s baseline roster so the dashboard can measure what schools are included and what information is still missing.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">When should I press this?</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>Press this after new schools, districts, or counties have been added to the approved territory list.</li><li>Press this after Aaron or Codex tells you the territory baseline has been updated.</li><li>Press this if the dashboard says expected schools are missing after a territory update.</li><li>It is safe to run more than once. It should update existing records instead of creating duplicates.</li></ul></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">What this does</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>Adds approved schools and districts that are missing.</li><li>Updates baseline school and district records if the approved list has changed.</li><li>Helps the dashboard know what schools are expected in the territory.</li><li>Helps the Coverage Review compare expected schools against found schools.</li></ul></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">What this does NOT do</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>It does not search the internet for new contacts.</li><li>It does not call schools.</li><li>It does not find counselors, principals, or CTE/shop contacts by itself.</li><li>It should not erase notes, call logs, or manual updates.</li></ul></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">What should I do after pressing it?</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>Read the result message.</li><li>Check how many schools and districts were added or updated.</li><li>Open Territory Coverage Review.</li><li>If schools are still missing, ask Aaron to review the territory list.</li><li>If the roster looks complete, use Discover or AI Assisted Update to help fill missing phones, websites, and contacts.</li></ul></div>
      </section>

      <button className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={runImport} type="button">{loading ? 'Importing…' : 'Run School Import'}</button>
      {error ? <pre className="overflow-auto rounded border border-red-800 bg-red-950 p-4 text-red-100">{error}</pre> : null}
      {result ? <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100"><h2 className="text-2xl font-bold">Import Complete</h2>{nothingChanged ? <p className="mt-3 rounded-xl border border-amber-700 bg-amber-950 p-3 text-amber-100">No new schools or districts were added. This usually means the current approved roster is already loaded.</p> : null}<div className="mt-4 grid gap-4 md:grid-cols-2"><div><h3 className="font-semibold text-sky-200">Schools:</h3><ul className="mt-2 list-disc pl-5 text-slate-300"><li>{count(schoolSummary, 'inserted')} added</li><li>{count(schoolSummary, 'updated')} updated</li><li>{count(schoolSummary, 'skipped')} skipped</li></ul></div><div><h3 className="font-semibold text-sky-200">Districts:</h3><ul className="mt-2 list-disc pl-5 text-slate-300"><li>{count(districtSummary, 'inserted')} added</li><li>{count(districtSummary, 'updated')} updated</li><li>{count(districtSummary, 'skipped')} skipped</li></ul></div></div><p className="mt-4 text-sm text-slate-400">Ran at: {result.importedAt ? new Date(result.importedAt).toLocaleString() : 'Unknown'} · Ran by: {result.importedBy ?? 'Unknown admin'}</p><p className="mt-4 rounded-xl border border-sky-900 bg-slate-900 p-4 text-slate-200"><b>Next step:</b> Open Territory Coverage Review to confirm the roster looks correct. Then use Discover or AI Assisted Update to fill missing phone, website, principal, counselor, and CTE/shop contact information.</p>{result.summary?.errors?.length ? <pre className="mt-4 overflow-auto rounded border border-red-800 bg-red-950 p-4 text-red-100">{result.summary.errors.join('\n')}</pre> : null}</section> : null}
    </main>
  );
}
