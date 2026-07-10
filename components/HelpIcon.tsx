'use client';
import { useEffect, useId, useState } from 'react';

export const HELP_TEXT: Record<string, string> = {
  Dashboard: 'This is Ken’s Mission Control. Start here to see the current priority, progress gaps, follow-ups, and what to do next.',
  'Current Mission': 'One clear recruiting objective at a time. Complete it when done, then choose the next logical mission from the list.',
  'Progress Command Center': 'Boss-report progress bars for roster, phone, website, contact, outreach, follow-up, and reviewed district coverage.',
  'Boss Update Snapshot': 'Plain-English summary Ken can share with Lincoln Tech leadership about territory status and biggest gap.',
  'Plan of Action': 'A tap-friendly checklist for the practical steps Ken should take next during territory cleanup and outreach.',
  'Territory Coverage Review': 'Confirms which expected districts and schools are in the CRM and what is still missing.',
  'Schools page': 'Use this as the recruiter Rolodex. Tap phone numbers, log calls, review gaps, and set follow-up priorities.',
  'Districts page': 'Review district-level offices, websites, and contacts that may help reach multiple schools.',
  'Contacts page': 'Review discovered and manually added people. Prioritize principals, counselors, and CTE/shop contacts.',
  'Map page': 'Use the map for territory awareness. Approximate city markers are labeled and are not exact driving directions.',
  'Discover page': 'Admin tools for guided discovery. Run batches, then review what changed and what still needs manual work.',
  'Import Territory Schools': 'Seeds the approved school roster so baseline coverage can be measured against expected territory schools.',
  'Run School Import': 'Imports the approved territory school list. Run this when the baseline roster needs to be seeded or refreshed.',
  'Discover Schools and Districts': 'Finds or verifies approved districts and schools from the known territory roster.',
  'Discover School Websites': 'Looks for official school websites and queues likely pages for review.',
  'Discover Contacts': 'Queues staff and contact pages for principal, counselor, CTE, shop, and trades contact discovery.',
  'Run Next Crawl Batch': 'This processes a small number of queued discovery tasks. Run it multiple times because the tool works through school and district pages in batches. Stop when the pending queue reaches 0, or when several runs produce no new useful updates.',
  'Crawl Queue': 'Shows pending, completed, failed, and skipped discovery tasks so Ken knows whether the crawler still has useful work.',
  'Export XLSX': 'Downloads a boss-friendly workbook with mission status, progress, schools, contacts, missing data, logs, and imports.',
  'Missing Data': 'Highlights schools missing phone, website, principal, counselor, CTE/shop contacts, or source information.',
  'Contact Logs': 'Call and outreach notes that show what happened, when, by whom, and what follow-up is needed.',
  'Follow-up Dates': 'Dates Ken should revisit a school or contact after a call, email, or visit.',
  'AI JSON Import': 'Paste JSON created from Ken/Aaron-provided notes. The importer validates, previews, and imports without inventing contacts.',
};
export default function HelpIcon({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return <span className="relative inline-flex align-middle">
    <button type="button" onClick={() => setOpen(!open)} className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-500/50 bg-slate-950 text-sm font-bold text-sky-200" aria-label={`Help: ${topic}`} aria-expanded={open} aria-controls={id}>?</button>
    {open ? <>
      <button type="button" aria-label="Close help" className="fixed inset-0 z-40 cursor-default bg-slate-950/60 sm:hidden" onClick={() => setOpen(false)} />
      <span id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="fixed inset-x-3 top-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] text-left text-sm font-normal text-slate-200 shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-10 sm:max-h-[70vh] sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:p-3">
        <span className="flex items-start justify-between gap-3">
          <b id={`${id}-title`} className="block text-base text-sky-200 sm:text-sm">{topic}</b>
          <button type="button" onClick={() => setOpen(false)} className="-mr-1 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg text-slate-100 sm:min-h-9 sm:min-w-9" aria-label="Close help">×</button>
        </span>
        <span className="mt-2 block leading-6">{HELP_TEXT[topic] ?? 'Plain-English help for this part of the CRM.'}</span>
      </span>
    </> : null}
  </span>;
}
