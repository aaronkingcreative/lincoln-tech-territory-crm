export const dynamic = 'force-dynamic';
import HelpIcon from '@/components/HelpIcon';
import SchoolsClient from '@/components/SchoolsClient';
import { getTerritoryData, missingItems } from '@/lib/coverage';
export default async function Page(){ const { schools, contacts } = await getTerritoryData(); const rows = schools.map((s) => ({ s, miss: missingItems(s, contacts) })); return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6"><div><p className="text-sm uppercase tracking-[.25em] text-sky-300">Recruiter Rolodex</p><h1 className="mt-2 text-3xl font-bold">Schools <HelpIcon topic="Schools page"/></h1><p className="mt-2 text-slate-400">Search, filter, and sort schools by district, county, type, relationship status, and missing outreach fields.</p></div><SchoolsClient rows={rows}/></main> }
