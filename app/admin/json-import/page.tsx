'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HelpIcon from '@/components/HelpIcon';
import { supportedItemTypes } from '@/lib/json-import';
import { readImportApiResponse } from '@/lib/json-import-client';

const prompt = `You are helping me update the Lincoln Tech Territory CRM. Turn my school visit notes into valid JSON for the CRM.

Only include facts I explicitly say. Do not invent names, phone numbers, emails, titles, programs, dates, schools, or contacts.

Use these item types:
school_update
school_create
contact_create
school_note_create
task_create
contact_log_create

Use school_update for school facts like phone, website, address, bell schedule, last visit date, program notes, student/program information, or school-level corrections.
Use school_create or create_if_missing: true if I mention a school that may not already be in the CRM.
Use contact_create for people I met, people I should contact, office staff, counselors, administrators, teachers, CTE instructors, shop teachers, welding teachers, automotive teachers, diesel teachers, agriculture teachers, construction teachers, or career advisors.
Use school_note_create for useful visit notes.
Use task_create for follow-ups or missing information.
Use contact_log_create for calls, emails, or in-person visits.

If district, city, county, state, address, email, or phone are unknown, leave them out. Do not invent them. The CRM can flag incomplete records for verification.

If I say “today,” use today’s date only if the current date is known in the conversation. If the date is unclear, write the phrase in the note instead of inventing a date.

Return only valid JSON.
No markdown.
No explanation.`;
const dailyItemTypes = new Set(['school_update', 'school_create', 'contact_create', 'school_note_create', 'task_create', 'contact_log_create']);
const safeTestNote = { items: [{ type: 'school_note_create', school_name: 'American Falls High School', note_type: 'visit', note: 'Safe test note for the AI Assisted Update field workflow.', source_notes: 'AI Assisted Update safe test.' }] };
const schoolVisitExample = { items: [
  { type: 'school_update', school_name: 'Example High School', create_if_missing: true, phone: '(208) 555-0100', website: 'https://example.edu', last_high_school_visit_at: '2026-09-25', bell_schedule: 'First period starts at 8:10. Lunch starts at 11:45.', source_notes: 'Example field visit note.', overwrite: false },
  { type: 'contact_create', school_name: 'Example High School', contact_name: 'Jane Smith', title: 'CTE Teacher', role_category: 'cte', program_area: 'Automotive and welding', source_notes: 'Example contact from a field visit.', confidence: 'low' },
  { type: 'school_note_create', school_name: 'Example High School', note_type: 'visit', note: 'Example visit note. Ken spoke with Jane Smith about automotive and welding students.', source_notes: 'Example field visit note.' },
  { type: 'task_create', school_name: 'Example High School', title: 'Follow up with Jane Smith', priority: 'medium', status: 'not_started', notes: 'Example follow-up task.', source_notes: 'Example field visit note.' },
  { type: 'contact_log_create', school_name: 'Example High School', contact_method: 'in_person', outcome: 'reached_contact', notes: 'Example in-person visit log.', source_notes: 'Example field visit note.' },
] };
const tone: Record<string,string> = { applied:'border-emerald-700 bg-emerald-950/30', updated:'border-sky-700 bg-sky-950/30', created:'border-emerald-700 bg-emerald-950/30', warnings:'border-amber-700 bg-amber-950/30', failed:'border-red-700 bg-red-950/30', skipped:'border-slate-700 bg-slate-800/50', unchanged:'border-slate-700 bg-slate-800/50' };
function parseError(text: string, err: unknown) { const msg = err instanceof Error ? err.message : 'Invalid JSON'; const m = msg.match(/position (\d+)/); const pos = m ? Number(m[1]) : 0; const before = text.slice(0, pos); const line = before.split('\n').length; const column = before.length - before.lastIndexOf('\n'); const nearby = text.slice(Math.max(0,pos-90), pos+90); return { msg, line, column, nearby }; }
function FieldList({ item }: { item: any }) { const fields = [...(item.fields_changed ?? []), ...(item.fields_skipped ?? [])]; return fields.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{fields.map((f:any,i:number)=><li key={i}><b>{f.label ?? f.field}:</b> {f.from !== undefined ? <>{String(f.from)} → </> : null}{f.to !== undefined ? String(f.to) : ''}{f.reason ? <span className="text-amber-200"> — {f.reason}</span> : null}</li>)}</ul> : null; }
function Card({ title, item, group }: { title: string; item: any; group: string }) { return <div className={`rounded-xl border p-4 ${tone[group] ?? tone.skipped}`}><h3 className="font-semibold">{title}</h3><div className="mt-2 space-y-1 text-sm text-slate-300"><p><b>Type:</b> {item.type}</p>{item.school ? <p><b>School:</b> {item.school}</p> : null}{item.district ? <p><b>District:</b> {item.district}</p> : null}{item.target_name ? <p><b>Target:</b> {item.target_name}</p> : null}{item.reason ? <p className="text-amber-100"><b>Note:</b> {item.reason}</p> : null}{item.suggested_fix ? <p className="text-sky-100"><b>Suggested fix:</b> {item.suggested_fix}</p> : null}{item.database_error ? <details className="rounded border border-red-900 bg-slate-950 p-2"><summary className="cursor-pointer text-red-100">Database error</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(item.database_error, null, 2)}</pre></details> : null}{item.message ? <p>{item.message}</p> : null}{item.source_url ? <p><b>Source:</b> <a href={item.source_url} className="text-sky-300 underline" target="_blank">{item.source_url}</a></p> : null}{item.school_record_id || (item.type==='school_update' && item.record_id) ? <p><b>Record:</b> <Link href={`/schools/${item.school_record_id ?? item.record_id}`} className="text-sky-300 underline">Open school record</Link></p> : null}</div><FieldList item={item}/></div>; }
function statusTitle(data:any) { if (!data) return 'Update result'; if (data.status === 'partial_success') return 'Saved with some items needing attention'; if (data.status === 'failed' || data.ok === false) return 'Update not saved'; return 'Saved'; }

function ResultPanel({ result, onCopy, onReset }: { result:any; onCopy: () => void; onReset: () => void }) {
  const statusClass = result.status === 'failed' ? 'border-red-700 bg-red-950/30' : result.status === 'partial_success' ? 'border-amber-700 bg-amber-950/30' : 'border-emerald-700 bg-emerald-950/30';
  const schoolsUpdated = result.updated?.filter((x:any)=>x.type==='school_update').length ?? 0;
  const schoolsCreated = result.created?.filter((x:any)=>x.type==='school_create' || x.type==='school_update').length ?? 0;
  const contactsCreated = result.created?.filter((x:any)=>String(x.type).startsWith('contact')).length ?? 0;
  const notesCreated = result.created?.filter((x:any)=>x.type==='school_note_create').length ?? 0;
  const tasksCreated = result.created?.filter((x:any)=>x.type==='task_create').length ?? 0;
  const logsCreated = result.created?.filter((x:any)=>x.type==='contact_log_create').length ?? 0;
  return <section id="ai-update-result" tabIndex={-1} className={`scroll-mt-4 rounded-2xl border p-5 outline-none ${statusClass}`}><div className="flex flex-col items-start justify-between gap-5 lg:flex-row"><div><p className="text-sm uppercase tracking-[.2em] text-slate-300">Update result</p><h2 className="mt-1 text-3xl font-bold">{statusTitle(result)}</h2><dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-200 sm:grid-cols-3"><div><dt className="text-slate-400">Schools updated</dt><dd>{schoolsUpdated}</dd></div><div><dt className="text-slate-400">Schools created</dt><dd>{schoolsCreated}</dd></div><div><dt className="text-slate-400">Contacts added</dt><dd>{contactsCreated}</dd></div><div><dt className="text-slate-400">Notes added</dt><dd>{notesCreated}</dd></div><div><dt className="text-slate-400">Tasks added</dt><dd>{tasksCreated}</dd></div><div><dt className="text-slate-400">Logs added</dt><dd>{logsCreated}</dd></div><div><dt className="text-slate-400">Warnings</dt><dd>{result.warnings?.length ?? 0}</dd></div><div><dt className="text-slate-400">Blocked items</dt><dd>{result.failed?.length ?? 0}</dd></div><div><dt className="text-slate-400">Items failed</dt><dd>{result.failed?.length ?? 0}</dd></div></dl></div><div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-1"><Link href="/schools" className="grid min-h-12 place-items-center rounded-xl bg-sky-400 px-4 font-semibold text-slate-950">Open updated schools</Link><button onClick={onCopy} className="min-h-12 rounded-xl border border-slate-600 px-4">Copy import summary</button><button onClick={onReset} className="min-h-12 rounded-xl bg-emerald-400 px-4 font-semibold text-slate-950">Start another update</button><button onClick={onReset} className="min-h-12 rounded-xl border border-slate-600 px-4">Clear JSON</button></div></div><details className="mt-4"><summary className="cursor-pointer font-semibold">Technical details</summary><pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre></details></section>;
}

function HumanSummary({ data, result=false }: { data:any; result?:boolean }) { if(!data) return <p className="text-sm text-slate-400">Validate an update to see a recruiter-friendly preview here.</p>; const groups = result ? ['updated','created','skipped','unchanged','warnings','failed'] : ['updated','created','warnings','failed','skipped','unchanged']; const groupLabel: Record<string, string> = { updated: 'Will update', created: 'Will add', warnings: 'Needs review', failed: 'Blocking error', skipped: 'Not changing', unchanged: 'Already up to date' }; return <div className="space-y-4"><h2 className="text-2xl font-bold">{result ? statusTitle(data) : 'Preview changes before import'}</h2>{groups.map(g => data[g]?.length ? <section key={g}><h3 className="mb-2 font-semibold text-slate-100">{result ? g[0].toUpperCase() + g.slice(1) : groupLabel[g]} ({data[g].length})</h3><div className="grid gap-3 md:grid-cols-2">{data[g].map((item:any,i:number)=><Card key={`${g}-${i}`} title={titleFor(item, result)} item={item} group={g}/>)}</div></section> : null)}{result && missing(data).length ? <section className="rounded-xl border border-amber-700 bg-amber-950/30 p-4"><h3 className="font-semibold text-amber-100">Still missing</h3><ul className="mt-2 list-disc pl-5 text-sm text-amber-50">{missing(data).map(x=><li key={x}>{x}</li>)}</ul></section> : null}</div>; }
function titleFor(item:any, result:boolean) { const t=String(item.type).replaceAll('_',' '); if(item.type==='school_create') return result ? `Created school: ${item.school ?? item.target_name}` : 'Will create school'; if((item.type==='school_update' && !result && String(item.reason ?? '').includes('create_if_missing')) || String(item.reason ?? '').includes('needing verification')) return 'Will create school'; if(item.type==='school_update') return result ? `Updated school: ${item.school ?? item.target_name}` : 'Will update school'; if(item.type==='school_note_create') return result ? `Added note: ${item.school ?? ''}` : 'Will add note'; if(item.type==='task_create') return result ? `Added task: ${item.target_name ?? ''}` : 'Will add follow-up task'; if(item.type==='contact_log_create') return result ? 'Added contact log' : 'Will add contact log'; if(item.type==='contact_create') return result ? 'Added contact' : 'Will add contact'; return result ? t : 'Needs review'; }
function missing(data:any){ const s=JSON.stringify(data).toLowerCase(); return ['Principal contact','Counselor contact','CTE/shop contact','Contact emails'].filter(x=>s.includes(x.toLowerCase().split(' ')[0]) || (x==='Contact emails' && s.includes('email is missing'))); }
function payloadItems(payload: unknown): any[] { return typeof payload === 'object' && payload !== null && 'items' in payload && Array.isArray((payload as { items?: unknown }).items) ? (payload as { items: any[] }).items : []; }
type ImportApiBody = Record<string, any>;

export default function JsonImportPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<any[] | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState<'validate' | 'apply' | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const textChangedSincePreview = previewText !== null && text !== previewText;
  const blockingErrors = preview?.failed?.length ?? 0;
  const hasPreviewCards = !!preview && ((preview.updated?.length ?? 0) + (preview.created?.length ?? 0) + (preview.warnings?.length ?? 0) + (preview.skipped?.length ?? 0) + (preview.unchanged?.length ?? 0) > 0);
  const hasCommitItems = !!preview && ((preview.updated?.length ?? 0) + (preview.created?.length ?? 0) + (preview.unchanged?.length ?? 0) > 0);
  const readyToCommit = !!previewPayload?.length && !textChangedSincePreview && hasCommitItems && loading === null && result?.status !== 'success';
  const duplicateAlreadyImported = !!preview?.already_imported;
  const duplicateWasPartial = duplicateAlreadyImported && ['partial_success','failed'].includes(String(preview?.previous_import_run?.status ?? ''));
  const failedTypes = Array.from(new Set((preview?.previous_import_run?.result_summary?.failed ?? []).map((x:any)=>String(x.type ?? 'unknown'))));
  const commitDisabledReason = loading === 'apply' ? 'Import is currently running' : loading === 'validate' ? 'Validate and Preview is currently running' : !text.trim() ? 'Paste JSON first' : textChangedSincePreview ? 'JSON changed. Validate and Preview first' : result?.status === 'success' ? 'Commit already completed' : !preview ? 'Validate and Preview first' : blockingErrors > 0 && !hasCommitItems ? 'Preview failed' : !previewPayload?.length || !hasCommitItems ? 'No valid items to commit' : error?.msg ? 'Server error' : null;
  const commitLabel = loading === 'apply' ? 'Committing...' : result?.status === 'success' ? 'Committed' : result?.status === 'failed' || error ? 'Retry Commit' : duplicateWasPartial ? 'Retry failed items / Commit again anyway' : duplicateAlreadyImported ? 'Commit again anyway' : readyToCommit || hasPreviewCards ? 'Commit Update' : 'Validate first';
  useEffect(() => {
    if (!result) return;
    requestAnimationFrame(() => {
      const target = document.getElementById('ai-update-result');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    });
  }, [result]);
  async function call(url: string) {
    const isValidate=url.includes('validate');
    setError(null);
    if(isValidate) setResult(null);
    setLoading(isValidate ? 'validate' : 'apply');
    try {
      const parsed = JSON.parse(text);
      const payload = !isValidate && previewPayload ? { items: previewPayload } : parsed;
      const sentItems = payloadItems(payload);
      if (!isValidate) console.log('AI Assisted Update commit clicked', { mode: duplicateWasPartial ? 'retry_or_commit_again' : duplicateAlreadyImported ? 'commit_again_anyway' : 'commit', inputHash: preview?.input_hash, retryMode: duplicateWasPartial, itemCount: sentItems.length, contactCreateCount: sentItems.filter((item:any)=>item?.type === 'contact_create').length });
      const response = await fetch(url, { method:'POST', headers:{'content-type':'application/json','x-ai-update-commit-mode': !isValidate && duplicateWasPartial ? 'retry_or_commit_again' : !isValidate && duplicateAlreadyImported ? 'commit_again_anyway' : isValidate ? 'validate' : 'commit'}, body:JSON.stringify(payload) });
      const apiResult = await readImportApiResponse(response);
      if (!apiResult.ok) throw new Error(apiResult.details ? `${apiResult.message} ${apiResult.details}` : apiResult.message);
      const body: ImportApiBody = typeof apiResult.body === 'object' && apiResult.body !== null ? apiResult.body as ImportApiBody : {};
      if (isValidate) {
        const normalized = body?.summary?.preview ?? [];
        setPreview(body);
        setPreviewPayload(Array.isArray(normalized) ? normalized : []);
        setPreviewText(text);
      } else {
        setResult(body);
        console.log('AI Assisted Update apply result', { runId: body?.run_id, createdContacts: body?.created?.filter((item:any)=>String(item.type).startsWith('contact')).length ?? 0, failedContacts: body?.failed?.filter((item:any)=>String(item.type).startsWith('contact')).length ?? 0 });
        router.refresh();
      }
    } catch (err) {
      const parsedJsonError = err instanceof SyntaxError ? parseError(text, err) : null;
      const parsedError = parsedJsonError ? { ...parsedJsonError, kind: 'json', msg: `Invalid JSON import payload: ${parsedJsonError.msg}` } : { kind: 'api', msg: err instanceof Error ? err.message : 'Importer API request failed' };
      setError(parsedError);
      if (!isValidate) {
        setResult({ ok: false, status: 'failed', run_id: null, updated: [], created: [], skipped: [], warnings: [], failed: [{ type: 'commit_error', target_name: 'AI Assisted Update commit', reason: parsedError.msg }] });
      }
    } finally { setLoading(null); }
  }
  const copyResult = () => navigator.clipboard.writeText(JSON.stringify(result ?? preview ?? {}, null, 2));
  const copyPrompt = async () => { await navigator.clipboard.writeText(prompt); setPromptCopied(true); window.setTimeout(() => setPromptCopied(false), 2500); };
  const loadJson = (value: unknown) => onTextChange(JSON.stringify(value, null, 2));
  const friendlyError = error?.kind === 'json'
    ? 'The pasted text is not valid JSON. Ask ChatGPT to return only valid JSON with no markdown.'
    : /column|relation|schema|table|database/i.test(error?.msg ?? '')
      ? 'The CRM database is missing a field or table needed for this update. Ask Aaron to run the latest Supabase patch.'
      : /ambiguous|more than one/i.test(error?.msg ?? '')
        ? 'This school name matched more than one record. Add city, county, or state and try again.'
        : /school name|school_name/i.test(error?.msg ?? '')
          ? 'This item is missing a school name.'
          : /duplicate|already exist/i.test(error?.msg ?? '')
            ? 'This may already exist. Review before committing.'
            : error?.msg;
  const resetWorkflow = () => { setText(''); setPreview(null); setPreviewPayload(null); setPreviewText(null); setResult(null); setError(null); };
  const onTextChange = (value:string) => { setText(value); setPreview(null); setPreviewPayload(null); setPreviewText(null); setResult(null); setError(null); };
  const commitSummary = preview ? { schoolUpdates: preview.updated?.filter((x:any)=>x.type==='school_update').length ?? 0, newSchools: preview.created?.filter((x:any)=>x.type==='school_create' || x.type==='school_update').length ?? 0, contacts: preview.created?.filter((x:any)=>String(x.type).startsWith('contact')).length ?? 0, warnings: preview.warnings?.length ?? 0, errors: blockingErrors } : null;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
    {result ? <ResultPanel result={result} onCopy={copyResult} onReset={resetWorkflow}/> : null}
    <header>
      <h1 className="text-3xl font-bold sm:text-4xl">AI Assisted Update <HelpIcon topic="What is AI Assisted Update?"/></h1>
      <p className="mt-2 text-lg text-slate-300">Paste JSON from ChatGPT after a school visit. Preview the update, then commit only what looks right.</p>
      <p className="mt-3 max-w-4xl text-slate-400">Use this when you have notes from a school visit, phone call, staff conversation, bell schedule, contact, task, or follow-up. ChatGPT turns your notes into JSON. This page previews the JSON before saving it to the CRM.</p>
    </header>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">How this works</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{['Talk to ChatGPT about the school visit.','Copy the JSON ChatGPT gives you.','Paste the JSON below and preview it.','Commit the update if it looks right.'].map((step, index)=><li key={step} className="flex gap-3 rounded-xl bg-slate-950 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-400 font-bold text-slate-950">{index + 1}</span><span className="text-sm text-slate-200">{step}</span></li>)}</ol>
    </section>

    <section className="rounded-2xl border border-sky-700 bg-sky-950/30 p-5 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div><h2 className="text-2xl font-semibold">Copy this prompt into ChatGPT</h2><p className="mt-2 text-sm text-sky-100">For safety, dictate notes while parked or use hands-free voice input.</p></div><div className="w-full sm:w-auto"><button onClick={copyPrompt} className="min-h-12 w-full rounded-xl bg-sky-400 px-6 font-semibold text-slate-950 sm:w-auto">Copy Prompt</button>{promptCopied ? <p role="status" className="mt-2 text-center text-sm font-semibold text-emerald-300">Prompt copied.</p> : null}</div></div>
      <details className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4"><summary className="cursor-pointer font-semibold">Read the prompt</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-slate-300">{prompt}</pre></details>
    </section>

    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">What can this update?</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>School phone, website, address, bell schedule, last visit date, and program notes</li><li>Contacts like principals, counselors, office staff, shop teachers, and CTE teachers</li><li>Visit notes and phone-call notes</li><li>Follow-up tasks</li><li>New schools that need to be added and verified later</li></ul></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Everyday update types</h2><ul className="mt-3 space-y-2 text-sm text-slate-300">{supportedItemTypes.filter(item=>dailyItemTypes.has(item.type)).map(item=><li key={item.type}><b>{item.type}</b> — {item.label}</li>)}</ul><details className="mt-4 rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer font-semibold">Advanced item types</summary><ul className="mt-3 space-y-2 text-sm text-slate-300">{supportedItemTypes.filter(item=>!dailyItemTypes.has(item.type)).map(item=><li key={item.type}><b>{item.type}</b> — {item.label}</li>)}</ul></details></div>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <h2 className="text-2xl font-semibold">Paste JSON update here</h2><p className="mt-2 text-slate-400">Paste the JSON ChatGPT gave you. Then click Validate and Preview before committing.</p>
      <textarea aria-label="JSON update" value={text} onChange={event=>onTextChange(event.target.value)} placeholder="Paste the JSON ChatGPT gave you here." className="mt-4 min-h-[360px] w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-base"/>
      <div className="mt-4 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-100"><b>Example only.</b> Preview it, but do not commit unless you intentionally want example data.</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><button onClick={()=>loadJson(safeTestNote)} className="min-h-12 rounded-xl border border-slate-600 px-4 font-semibold">Load Safe Test Note</button><button onClick={()=>loadJson(schoolVisitExample)} className="min-h-12 rounded-xl border border-amber-600 px-4 font-semibold text-amber-100">Load School Visit Example</button><button onClick={resetWorkflow} className="min-h-12 rounded-xl border border-slate-600 px-4">Clear JSON</button></div>
      {commitSummary ? <div className={`mt-4 rounded-xl border p-4 ${blockingErrors ? 'border-amber-700 bg-amber-950/30' : 'border-emerald-800 bg-emerald-950/30'}`}><h3 className="font-semibold">{blockingErrors && hasCommitItems ? 'Valid items are ready; some items need review.' : blockingErrors ? 'Blocking error' : 'Safe to commit after you review the preview.'}</h3><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2"><li>Schools to update: {commitSummary.schoolUpdates}</li><li>Schools to create: {commitSummary.newSchools}</li><li>Contacts to add: {commitSummary.contacts}</li><li>Needs review: {commitSummary.warnings}</li><li>Blocking errors: {commitSummary.errors}</li></ul>{blockingErrors ? <ul className="mt-3 list-disc pl-5 text-sm text-red-100">{preview.failed.map((item:any,index:number)=><li key={index}>{item.reason ?? item.target_name ?? 'Blocking error'}</li>)}</ul> : null}</div> : null}
      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-100"><h3 className="text-lg font-semibold">{friendlyError}</h3><details className="mt-3"><summary className="cursor-pointer font-semibold">Technical details</summary><p className="mt-2 text-sm">{error.msg}</p>{error.line ? <p className="mt-1 text-sm">Line {error.line}, column {error.column}</p> : null}{error.nearby ? <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs">{error.nearby}</pre> : null}</details></div> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={()=>call('/api/admin/json-import/validate')} disabled={loading !== null || !text.trim()} className="min-h-14 rounded-xl border border-sky-500 px-5 text-lg font-semibold disabled:opacity-50">{loading === 'validate' ? 'Validating...' : 'Validate and Preview'}</button><div><button onClick={()=>call('/api/admin/json-import/apply')} disabled={!readyToCommit} className="min-h-14 w-full rounded-xl bg-emerald-400 px-5 text-lg font-semibold text-slate-950 disabled:opacity-50">{commitLabel}</button><p className={`mt-2 text-sm ${commitDisabledReason ? 'text-slate-400' : 'text-emerald-200'}`}>{commitDisabledReason ?? 'Preview is ready. Only the valid previewed items will be saved.'}</p></div></div>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6"><HumanSummary data={preview}/><details className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4"><summary className="cursor-pointer font-semibold">Technical details</summary><pre className="mt-3 max-h-96 overflow-auto text-xs text-slate-300">{JSON.stringify(preview, null, 2)}</pre></details></section>
    {result ? <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-4 text-xl font-semibold">Saved item details</h2><HumanSummary data={result} result/></section> : null}
  </main>;
}
