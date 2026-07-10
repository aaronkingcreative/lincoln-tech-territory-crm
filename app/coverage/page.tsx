export const dynamic = 'force-dynamic';

import CoverageClient from '@/components/CoverageClient';
import { buildCoverage, getTerritoryData, schoolFlags } from '@/lib/coverage';

function Stat({label,value}:{label:string;value:unknown}){return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-2xl font-bold">{String(value)}</div><div className="text-slate-400">{label}</div></div>}
export default async function CoveragePage() {
  const { schools, contacts } = await getTerritoryData();
  const coverage = buildCoverage(schools, contacts).map(d=>({...d,schools:d.schools.map(x=>({...x,found:x.found?{...x.found,_flags:schoolFlags(x.found,contacts)}:x.found}))}));
  const expectedSchools=coverage.reduce((n,d)=>n+d.expectedCount,0); const missingSchools=coverage.reduce((n,d)=>n+d.missingCount,0); const needContacts=schools.filter(s=>!contacts.some(c=>c.school_id===s.id)).length;
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"><div><p className="text-sm uppercase tracking-[.25em] text-sky-300">Expected vs found</p><h1 className="mt-2 text-3xl font-bold">Territory coverage review</h1><p className="mt-2 text-slate-400">This page compares the expected territory baseline against the live database. Use it to verify that every district and school is present, then review missing phone, website, principal, counselor, and CTE/shop contact fields.</p></div><div className="grid gap-4 md:grid-cols-4"><Stat label="Expected districts" value={coverage.length}/><Stat label="Expected schools" value={expectedSchools}/><Stat label="Missing schools" value={missingSchools}/><Stat label="Schools needing contact discovery" value={needContacts}/></div><CoverageClient coverage={coverage} contacts={contacts}/></main>;
}
