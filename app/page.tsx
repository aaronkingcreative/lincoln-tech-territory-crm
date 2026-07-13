export const dynamic = 'force-dynamic';

import Link from 'next/link';
import HelpIcon from '@/components/HelpIcon';
import { DbRow, getTerritoryData, hasValue, missingItems, recruitingProgress, schoolFlags } from '@/lib/coverage';

function pct(v: number, m: number) {
  return Math.round(m ? (v / m) * 100 : 0);
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/20">{children}</section>;
}

function Progress({ label, value, max, explain }: { label: string; value: number; max: number; explain: string }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
        <b>{label}</b>
        <span className="text-sky-200">{pct(value, max)}% · {value} / {max}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800">
        <div className="h-3 rounded-full bg-gradient-to-r from-blue-900 via-sky-500 to-sky-300" style={{ width: `${pct(value, max)}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">{explain}</p>
    </div>
  );
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateKey = (v: unknown) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : '');
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asRecord = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const asUnknownArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asArray = (v: unknown): Record<string, unknown>[] => asUnknownArray(v).filter(isRecord);
const asStringArray = (v: unknown): string[] => asUnknownArray(v).filter((item): item is string => typeof item === 'string');
const itemName = (x: Record<string, unknown>) => String(x.target_name ?? x.school_name ?? x.name ?? 'Unnamed item');
const itemReason = (x: Record<string, unknown>) => String(x.reason ?? x.error ?? 'No reason recorded');

function RunNames({ title, items }: { title: string; items: Record<string, unknown>[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <ul className="mt-1 list-disc pl-5 text-sm text-slate-300">
        {items.slice(0, 5).map((x, i) => (
          <li key={`${title}-${i}`}>{itemName(x)}{title.includes('Failed') ? ` — ${itemReason(x)}` : ''}</li>
        ))}
      </ul>
    </div>
  );
}

function changedText(s: DbRow) {
  const parts = ['phone', 'website', 'address', 'program_notes', 'special_programs', 'student_population_total', 'grade_enrollment'].filter((key) => hasValue(s[key]));
  return parts.length ? `Has ${parts.slice(0, 3).join(', ')}${parts.length > 3 ? '…' : ''}` : 'Changed by AI Assisted Update';
}

const metricDetails = [
  'Front desk phone: schools.phone non-empty',
  'Website: schools.website non-empty',
  'Street address: schools.address non-empty',
  'Principal/contact: linked contact title/role contains principal',
  'Counselor/contact: linked contact title/role contains counselor/career',
  'Program info: special_programs/program_notes/CTE fields/profile notes or linked trades/career/workforce contact',
  'Bell schedule: bell_schedule or bell_schedule_url non-empty',
  'Student population: student_population_total is not null/non-empty',
  'Grade enrollment: grade_enrollment is an object with at least one meaningful grade value',
  'Ready for outreach: phone plus website/address plus a useful contact, program note, or enrollment clue',
];

export default async function Home() {
  const { schools, contacts, aiUpdateRuns } = await getTerritoryData();
  const progress = recruitingProgress(schools, contacts);
  const today = todayKey();
  const todaysRuns = aiUpdateRuns.filter((run) => dateKey(run.started_at) === today);
  const latest = aiUpdateRuns[0];
  const latestSummary = asRecord(latest?.result_summary);
  const latestIds = new Set(asStringArray(latest?.affected_record_ids));
  const recentByDate = schools
    .filter((school) => hasValue(school.last_ai_update_at) || hasValue(school.ai_created_at))
    .sort((a, b) => String(b.last_ai_update_at ?? b.ai_created_at ?? '').localeCompare(String(a.last_ai_update_at ?? a.ai_created_at ?? '')));
  const latestSchools = (recentByDate.length ? recentByDate : schools.filter((school) => latestIds.has(String(school.id)))).slice(0, 10);
  const gaps = schools
    .map((school) => ({ school, miss: missingItems(school, contacts), flags: schoolFlags(school, contacts) }))
    .filter((gap) => gap.miss.length)
    .slice(0, 10);
  const ready = schools.filter((school) => schoolFlags(school, contacts).ready);
  const needsVerification = schools.filter((school) => schoolFlags(school, contacts).needs_verification);
  const todayUpdated = schools.filter((school) => dateKey(school.last_ai_update_at) === today).length;
  const todayCreated = schools.filter((school) => dateKey(school.ai_created_at) === today).length;
  const contactsToday = contacts.filter((contact) => dateKey(contact.created_at) === today || dateKey(contact.last_ai_update_at) === today).length;
  const failures = asArray(latestSummary.failed);
  const missingFailures = aiUpdateRuns
    .slice(0, 5)
    .some((run) => asArray(asRecord(run.result_summary).failed).some((failure) => /missing|blocked|not created|school/i.test(`${failure.reason} ${failure.type}`)));

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[.25em] text-sky-300">Recruiting Data Progress <HelpIcon topic="Dashboard"/></p>
          <h1 className="mt-2 text-4xl font-bold text-slate-100">How close is each school to being useful for outreach?</h1>
          <p className="mt-2 max-w-3xl text-slate-400">AI Assisted Update is the primary way to add verified school data. Paste notes, school website text, or a ChatGPT-generated JSON update. Preview it, then commit verified changes to the CRM.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/json-import" className="min-h-11 rounded-xl bg-sky-400 px-4 py-3 font-semibold text-slate-950">Update school data with AI Assisted Update</Link>
          <a href="/api/export" className="min-h-11 rounded-xl border border-slate-700 px-4 py-3">Export XLSX</a>
        </div>
      </section>

      <Card>
        <h2 className="text-2xl font-semibold">Progress Command Center</h2>
        <p className="mt-2 rounded-xl border border-sky-900 bg-slate-950 p-3 text-sm text-slate-300">Total schools only increases when a new school is created. Updating existing schools improves the progress bars but does not increase the total.</p>
        {missingFailures ? <p className="mt-2 rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-100">Some schools were not created because they were blocked or failed. Review latest AI Assisted Update result.</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {progress.cards.map(([label, value, max, explain]) => <Progress key={label} label={label} value={value} max={max} explain={explain}/>)}
        </div>
        <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
          <summary className="cursor-pointer font-semibold text-sky-200">Metric details</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {metricDetails.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </details>
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-xl font-semibold">Updated today by AI Assisted Update</h2>
          {todaysRuns.length ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <dt className="text-slate-400">Schools updated today</dt><dd>{todayUpdated || Number(latest?.updated_count ?? 0)}</dd>
                <dt className="text-slate-400">Schools created today</dt><dd>{todayCreated}</dd>
                <dt className="text-slate-400">Contacts created today</dt><dd>{contactsToday}</dd>
                <dt className="text-slate-400">Items failed today</dt><dd>{todaysRuns.reduce((count, run) => count + (Number(run.failed_count) || 0), 0)}</dd>
                <dt className="text-slate-400">Latest run status</dt><dd>{String(latest?.status ?? 'none')}</dd>
                <dt className="text-slate-400">Latest run ID</dt><dd className="break-all">{String(latest?.id ?? 'none')}</dd>
              </dl>
              <RunNames title="Updated schools" items={asArray(latestSummary.updated)}/>
              <RunNames title="Created schools" items={asArray(latestSummary.created)}/>
              <RunNames title="Failed schools" items={failures}/>
            </>
          ) : <p className="mt-3 text-sm text-slate-400">No AI Assisted Update runs recorded today.</p>}
          <Link href="/admin/json-import" className="mt-4 inline-block rounded-lg border border-sky-700 px-3 py-2 text-sky-200">Open AI Assisted Update</Link>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Ready for outreach</h2>
          <p className="mt-3 text-4xl font-bold text-emerald-200">{ready.length}</p>
          <p className="text-sm text-slate-400">Phone plus website/address plus a useful contact, program note, or enrollment clue.</p>
          <p className="mt-3 text-sm text-amber-100">Schools needing verification: {needsVerification.length}</p>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Quick links</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <Link className="rounded-lg bg-slate-950 p-3 text-sky-200" href="/admin/json-import">Open AI Assisted Update</Link>
            <Link className="rounded-lg bg-slate-950 p-3" href="/coverage">View schools updated in latest import</Link>
            <a className="rounded-lg bg-slate-950 p-3 text-emerald-200" href="/api/export">Export XLSX</a>
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="text-2xl font-semibold">Recently updated by AI Assisted Update</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {latestSchools.length ? latestSchools.map((school) => (
            <Link key={String(school.id)} href={`/schools/${String(school.id)}`} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <b className="text-sky-300 underline">{String(school.name ?? 'Unnamed school')}</b>
              <p className="text-sm text-slate-300">{String(asRecord(school.districts).name ?? 'Unknown district')} · {[school.city, school.county].filter(hasValue).map(String).join(', ') || 'Location not recorded'}</p>
              <p className="text-xs text-slate-400">{changedText(school)}</p>
              {schoolFlags(school, contacts).needs_verification ? <span className="mt-2 inline-block rounded-full bg-amber-900 px-2 py-1 text-xs text-amber-100">Needs verification</span> : null}
            </Link>
          )) : <p className="text-slate-400">No affected schools recorded yet.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Top missing recruiting data</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {gaps.map(({ school, miss }) => (
            <Link key={String(school.id)} href={`/schools/${String(school.id)}`} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <b>{String(school.name)}</b>
              <p className="text-sm text-amber-100">Missing: {miss.join(', ')}</p>
            </Link>
          ))}
        </div>
      </Card>
    </main>
  );
}
