export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient, hasSupabaseServiceCredentials } from '@/lib/supabase';
import { missingItems } from '@/lib/coverage';

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-slate-100">{children || <span className="text-amber-200">Missing</span>}</div></div>; }
export default async function SchoolDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseServiceCredentials()) notFound();
  const db = createServiceClient();
  const [{ data: school }, { data: contacts }, { data: logs }, { data: notes }, { data: tasks }, { data: sources }] = await Promise.all([
    db.from('schools').select('*,districts(*)').eq('id', id).single(),
    db.from('contacts').select('*').eq('school_id', id).order('name'),
    db.from('contact_logs').select('*').eq('school_id', id).order('contacted_at', { ascending: false }).limit(50),
    db.from('school_notes').select('*').eq('school_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('recruiting_tasks').select('*').eq('school_id', id).order('due_date', { ascending: true }).limit(50),
    db.from('source_urls').select('*').eq('school_id', id).order('last_crawled_at', { ascending: false }).limit(50),
  ]);
  if (!school) notFound();
  const missing = missingItems(school, contacts ?? []);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 sm:p-6"><Link href="/schools" className="text-sky-300 underline">← Back to schools</Link><div><p className="text-sm uppercase tracking-[.25em] text-sky-300">School detail</p><h1 className="mt-2 text-4xl font-bold">{school.name}</h1><p className="mt-2 text-slate-400">{school.districts?.name ?? 'No district'} · {school.county ?? 'No county'}</p></div>
  <section className="grid gap-3 md:grid-cols-3"><Field label="District">{school.districts?.name}</Field><Field label="Address">{[school.address, school.city, school.state, school.zip].filter(Boolean).join(', ')}</Field><Field label="Phone">{school.phone ? <a className="text-sky-300 underline" href={`tel:${String(school.phone).replace(/[^+\d]/g,'')}`}>{school.phone}</a> : null}</Field><Field label="Website">{school.website ? <a className="text-sky-300 underline" href={school.website} target="_blank" rel="noreferrer">{school.website}</a> : null}</Field><Field label="Follow-up date">{school.next_follow_up_at}</Field><Field label="Recruiting priority">{school.recruiting_priority}</Field><Field label="Relationship status">{school.relationship_status}</Field><Field label="School type">{school.school_type}</Field><Field label="Territory status">{school.territory_status}</Field><Field label="Missing data summary">{missing.join(', ') || 'None flagged'}</Field><Field label="Source URL">{school.source_url ? <a className="text-sky-300 underline" href={school.source_url}>{school.source_url}</a> : null}</Field></section>
  <section className="grid gap-4 lg:grid-cols-2"><Panel title="Contacts" rows={contacts ?? []} fields={['name','title','email','phone','program_area']} /><Panel title="Contact logs" rows={logs ?? []} fields={['contacted_at','contact_method','outcome','notes']} /><Panel title="Notes" rows={notes ?? []} fields={['created_at','note_type','note','created_by_email']} /><Panel title="Tasks" rows={tasks ?? []} fields={['title','status','priority','due_date','notes']} /><Panel title="Source URLs" rows={sources ?? []} fields={['url','page_title','http_status','last_crawled_at','notes']} /></section></main>;
}
function Panel({ title, rows, fields }: { title: string; rows: any[]; fields: string[] }) { return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-3 space-y-3">{rows.length ? rows.map((r, i) => <div key={r.id ?? i} className="rounded-xl bg-slate-950 p-3 text-sm">{fields.map(f => <div key={f}><b className="text-slate-400">{f}: </b>{String(r[f] ?? '')}</div>)}</div>) : <p className="text-slate-400">No records yet.</p>}</div></section>; }
