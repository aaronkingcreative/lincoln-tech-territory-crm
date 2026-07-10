'use client';

import Link from 'next/link';
import { useState } from 'react';

type School = Record<string, any>;
type Action = 'edit' | 'log' | 'note' | null;
const priority = ['','high','medium','low'];
const status = ['not_started','contacted','warm','active','not_interested','needs_follow_up'];
const methods = ['phone','email','in_person','other'];
const outcomes = ['no_answer','left_message','reached_contact','scheduled_visit','needs_follow_up','not_interested','other'];
const noteTypes = ['general','contact','visit','correction','follow_up','program'];

export default function SchoolActionsClient({ school }: { school: School }) {
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(path: string, form: HTMLFormElement) {
    setSaving(true); setMessage('');
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMessage(json.error ?? 'Save failed.'); return; }
    setMessage('Saved. Refreshing data…');
    setTimeout(() => window.location.reload(), 500);
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    <Link href={`/schools/${school.id}`} className="min-h-11 rounded-lg border border-slate-700 px-3 py-2">View</Link>
    <button type="button" onClick={() => setAction('edit')} className="min-h-11 rounded-lg border border-slate-700 px-3 py-2">Edit</button>
    <button type="button" onClick={() => setAction('log')} className="min-h-11 rounded-lg bg-sky-400 px-3 py-2 font-semibold text-slate-950">Log call</button>
    <button type="button" onClick={() => setAction('note')} className="min-h-11 rounded-lg border border-slate-700 px-3 py-2">Add note</button>
  </div><p className="text-xs text-slate-500">CRM fields: priority, status, notes, last contact, next follow-up.</p>
  {action ? <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true"><form onSubmit={e => { e.preventDefault(); submit(action === 'edit' ? '/api/schools/update' : action === 'log' ? '/api/contact-logs' : '/api/school-notes', e.currentTarget); }} className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{action === 'edit' ? 'Edit school' : action === 'log' ? 'Log call' : 'Add note'}</h2><p className="text-sm text-slate-400">{school.name}</p></div><button type="button" onClick={() => setAction(null)} className="min-h-11 min-w-11 rounded-full border border-slate-700 text-xl">×</button></div>
    <input type="hidden" name="school_id" value={school.id} />
    {action === 'edit' ? <div className="grid gap-3 sm:grid-cols-2">{['phone','website','address','city','state','zip'].map(f => <label key={f} className="text-sm capitalize">{f}<input name={f} defaultValue={school[f] ?? ''} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label>)}<label className="text-sm">Recruiting priority<select name="recruiting_priority" defaultValue={school.recruiting_priority ?? ''} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">{priority.map(v => <option key={v} value={v}>{v || 'Unset'}</option>)}</select></label><label className="text-sm">Relationship status<select name="relationship_status" defaultValue={school.relationship_status ?? 'not_started'} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">{status.map(v => <option key={v} value={v}>{v}</option>)}</select></label><label className="text-sm">Next follow-up<input type="datetime-local" name="next_follow_up_at" defaultValue={school.next_follow_up_at ? String(school.next_follow_up_at).slice(0,16) : ''} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label>{['outreach_notes','program_notes','special_programs','best_time_to_visit_seniors'].map(f => <label key={f} className="text-sm capitalize sm:col-span-2">{f.replaceAll('_',' ')}<textarea name={f} defaultValue={school[f] ?? ''} className="mt-1 min-h-24 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label>)}</div> : null}
    {action === 'log' ? <div className="grid gap-3 sm:grid-cols-2"><label>Contact method<select name="contact_method" defaultValue="phone" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">{methods.map(v => <option key={v}>{v}</option>)}</select></label><label>Outcome<select name="outcome" defaultValue="needs_follow_up" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">{outcomes.map(v => <option key={v}>{v}</option>)}</select></label><label>Contacted at<input type="datetime-local" name="contacted_at" defaultValue={new Date().toISOString().slice(0,16)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><label>Next follow-up optional<input type="datetime-local" name="next_follow_up_at" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><label className="sm:col-span-2">Notes<textarea required name="notes" className="mt-1 min-h-28 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label></div> : null}
    {action === 'note' ? <div className="grid gap-3"><label>Note type<select name="note_type" defaultValue="general" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2">{noteTypes.map(v => <option key={v}>{v}</option>)}</select></label><label>Note<textarea required name="note" className="mt-1 min-h-36 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label></div> : null}
    {message ? <p className="mt-3 rounded border border-slate-700 p-2 text-sm">{message}</p> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAction(null)} className="min-h-11 rounded-lg border border-slate-700 px-4">Cancel</button><button disabled={saving} className="min-h-11 rounded-lg bg-emerald-400 px-4 font-semibold text-slate-950 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button></div>
  </form></div> : null}</div>;
}
