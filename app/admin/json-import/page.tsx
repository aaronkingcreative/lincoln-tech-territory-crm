'use client';
import { useState } from 'react';
import HelpIcon from '@/components/HelpIcon';
import { schemaExample } from '@/lib/json-import';

const prompt = `I am updating my Lincoln Tech Territory CRM. Convert the information below into the website's update format. Only use facts explicitly provided. Do not invent names, titles, emails, phone numbers, websites, dates, or contacts. If something is missing, leave it blank. Return only JSON using the schema provided.`;
const examples = [
  'I found this counselor on the school website. Please create an update for the Lincoln Tech Territory CRM.',
  'I called this school today. They said to call back in September and ask for the CTE teacher. Please create a call log and follow-up task.',
  'This school website has a new phone number. Please create an update for the CRM.',
  'Here is copied staff directory text. Extract only principals, counselors, career advisors, CTE, automotive, welding, diesel, shop, construction, robotics, and industrial technology contacts. Do not invent missing emails or phone numbers.',
];

export default function JsonImportPage() {
  const [text, setText] = useState(JSON.stringify(schemaExample, null, 2));
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function call(url: string) {
    setError('');
    setResult(null);
    try {
      const json = JSON.parse(text);
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Request failed');
      url.includes('validate') ? setPreview(body) : setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid update format');
    }
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-24 sm:p-6">
    <div><p className="text-sm uppercase tracking-[.25em] text-sky-300">Admin workflow</p><h1 className="mt-2 text-3xl font-bold">AI Assisted Update <HelpIcon topic="What is AI Assisted Update?"/></h1><p className="mt-2 text-slate-400">AI Assisted Update lets you use ChatGPT to help update this website without needing Aaron or Codex for every small change. You can tell ChatGPT what needs to be added, corrected, or logged. ChatGPT will turn your information into a special update format that this website can read. Then you paste that update here, preview it, and approve it before anything changes.</p></div>

    <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">What can I use this for?</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300"><li>Add a contact you found on a school website.</li><li>Add a phone number or website that is missing.</li><li>Correct a school detail.</li><li>Add a call note.</li><li>Add a follow-up reminder.</li><li>Add a task.</li><li>Record that a school needs more research.</li><li>Request a future website improvement for Aaron.</li></ul></div><div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Important safety note</h2><p className="mt-3 text-slate-300">This page will preview the update before saving it. It should not overwrite existing information unless the update specifically says to overwrite. Do not import anything unless you trust the source.</p><p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-300">JSON is just a structured update format that websites can read. You do not need to write it by hand. ChatGPT can create it for you. Your job is to describe the update clearly, copy the result, preview it here, and approve it if it looks right.</p></div></section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">How to use it</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-300"><li>Copy the prompt from this page.</li><li>Open ChatGPT.</li><li>Tell ChatGPT what you want to update.</li><li>Paste any school website text, staff directory text, or voice note transcript.</li><li>Ask ChatGPT to return the update in the website’s update format.</li><li>Copy the update ChatGPT gives you.</li><li>Paste it into this page.</li><li>Click Validate.</li><li>Review the preview carefully.</li><li>Click Import only if it looks correct.</li></ol></section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Copyable examples</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{examples.map((example, index) => <div key={example} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm font-semibold text-sky-200">Example {index + 1}</p><p className="mt-2 text-slate-300">“{example}”</p><button onClick={() => navigator.clipboard.writeText(example)} className="mt-3 min-h-11 rounded-xl border border-slate-700 px-4 text-sm">Copy Example</button></div>)}</div></section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Copyable ChatGPT prompt</h2><button onClick={() => navigator.clipboard.writeText(`${prompt}\n\nSchema:\n${JSON.stringify(schemaExample, null, 2)}`)} className="min-h-11 rounded-xl bg-sky-400 px-4 font-semibold text-slate-950">Copy Prompt</button></div><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-200">{prompt}{'\n\nSupported update format (JSON):\n'}{JSON.stringify(schemaExample, null, 2)}</pre></section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Paste the update format here</h2><textarea value={text} onChange={event => setText(event.target.value)} className="mt-3 min-h-[360px] w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-sm"/><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => call('/api/admin/json-import/validate')} className="min-h-11 rounded-xl border border-slate-700 px-4">Validate and Preview</button><button onClick={() => call('/api/admin/json-import/apply')} disabled={!preview?.valid} className="min-h-11 rounded-xl bg-emerald-400 px-4 font-semibold text-slate-950 disabled:opacity-50">Import Previewed Update</button></div>{error ? <p className="mt-3 rounded-xl border border-red-800 bg-red-950 p-3 text-red-100">{error}</p> : null}</section>
    <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Preview changes before import</h2><pre className="mt-3 max-h-96 overflow-auto text-xs text-slate-300">{JSON.stringify(preview, null, 2)}</pre></div><div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Import result</h2><pre className="mt-3 max-h-96 overflow-auto text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre></div></section>
  </main>;
}
