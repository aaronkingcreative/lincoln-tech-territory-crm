import { TERRITORY_REVIEW_COUNTIES } from '@/data/territory-review';
import { TERRITORY_COUNTIES } from '@/lib/config';

export default function TerritoryReviewPage() {
  const active = new Set([...(TERRITORY_COUNTIES.ID ?? []), ...(TERRITORY_COUNTIES.OR ?? [])]);
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div>
      <p className="text-sm uppercase tracking-[.25em] text-sky-300">Admin boundary planning</p>
      <h1 className="mt-2 text-3xl font-bold">Territory Review</h1>
      <p className="mt-2 max-w-3xl text-slate-400">Use this page to track counties that may belong in Ken King&apos;s Lincoln Tech recruiting territory. Ada County is active now; the remaining candidates are review-only and are not imported until Aaron/Ken explicitly approve them.</p>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-950/30">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-950/70 text-slate-300">
          <tr>{['County','Why it may belong','Status','Known/expected high schools','Include later'].map((h) => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {TERRITORY_REVIEW_COUNTIES.map((row) => {
            const included = active.has(row.county);
            return <tr key={row.county} className="border-t border-slate-800 align-top">
              <td className="p-3 font-semibold text-slate-100">{row.county}</td>
              <td className="max-w-xl p-3 text-slate-300">{row.why}</td>
              <td className="p-3"><span className={included ? 'rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-emerald-100' : 'rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-amber-100'}>{included ? 'Included' : 'Excluded / review only'}</span></td>
              <td className="p-3 text-slate-300">{row.knownExpectedHighSchools ?? 'Unknown until official-source review'}</td>
              <td className="p-3 text-slate-300"><button disabled className="rounded-lg border border-slate-700 px-3 py-2 text-slate-400">Include later</button><p className="mt-2 text-xs text-slate-500">{row.note}</p></td>
            </tr>;
          })}
        </tbody>
      </table>
    </section>
  </main>;
}
