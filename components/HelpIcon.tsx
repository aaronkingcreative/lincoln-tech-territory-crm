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
  'How to use Discovery': 'Discovery helps fill missing data after the approved school roster is loaded. First, use Discover Schools and Districts to confirm the territory list. Then use Discover School Websites to look for official school and district websites. Then use Discover Contacts to queue staff/contact pages that may contain principals, counselors, CTE teachers, shop teachers, and career contacts. Run Next Crawl Batch processes a small group of queued pages at a time. Run it more than once until the pending queue reaches 0, or until several runs stop finding anything useful.\n\nMini workflow:\n1. Run Discover Schools and Districts.\n2. Run Discover School Websites.\n3. Run Discover Contacts.\n4. Run Next Crawl Batch.\n5. Review what changed.\n6. Repeat crawl batches if the pending queue still has items.\n7. Use manual updates or AI Assisted Update for anything the crawler cannot find.',
  'What does Run a School Import do?': 'Use this when the approved school list has been changed or expanded. For example, if Ada County is added to the territory, this button loads those new schools and districts into the website. It is safe to run again because it updates existing records instead of creating duplicates. This does not search the web for contacts. After running it, check Territory Coverage Review to confirm the schools are included.',
  'Discover Schools and Districts': 'Finds or verifies approved districts and schools from the known territory roster.',
  'Discover School Websites': 'Looks for official school websites and queues likely pages for review.',
  'Discover Contacts': 'Queues staff and contact pages for principal, counselor, CTE, shop, and trades contact discovery.',
  'Run Next Crawl Batch': 'This processes a small number of queued discovery tasks. Run it multiple times because the tool works through school and district pages in batches. Stop when the pending queue reaches 0, or when several runs produce no new useful updates.',
  'Crawl Queue': 'Shows pending, completed, failed, and skipped discovery tasks so Ken knows whether the crawler still has useful work.',
  'Export XLSX': 'Downloads a boss-friendly workbook with mission status, progress, schools, contacts, missing data, logs, and imports.',
  'Missing Data': 'Highlights schools missing phone, website, principal, counselor, CTE/shop contacts, or source information.',
  'Contact Logs': 'Call and outreach notes that show what happened, when, by whom, and what follow-up is needed.',
  'Follow-up Dates': 'Dates Ken should revisit a school or contact after a call, email, or visit.',
  'What is AI Assisted Update?': 'This tool lets you use ChatGPT to prepare updates for the website. For example, you can tell ChatGPT, ‘Add this counselor to Boise High School’ or paste a copied staff page and ask ChatGPT to format the useful contacts for this website. Then paste the result here. The website will check it, show a preview, and let you approve it before saving. This is useful when the crawler cannot find something automatically or when you learn new information from a phone call.',
};
export default function HelpIcon({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return <span className="relative inline-flex align-middle">
    <button type="button" onClick={() => setOpen(!open)} className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-500/50 bg-slate-950 text-sm font-bold text-sky-200" aria-label={`Help: ${topic}`} aria-expanded={open} aria-controls={id}>?</button>
    {open ? <>
      <button type="button" aria-label="Close help" className="fixed inset-0 z-40 cursor-default bg-slate-950/60 sm:hidden" onClick={() => setOpen(false)} />
      <span id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="fixed inset-x-4 top-1/2 z-50 max-h-[min(80dvh,640px)] -translate-y-1/2 overflow-y-auto whitespace-pre-line rounded-2xl border border-slate-700 bg-slate-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-left text-sm font-normal text-slate-200 shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-10 sm:max-h-[70vh] sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:translate-y-0 sm:p-3">
        <span className="flex items-start justify-between gap-3">
          <b id={`${id}-title`} className="block text-base text-sky-200 sm:text-sm">{topic}</b>
          <button type="button" onClick={() => setOpen(false)} className="-mr-1 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg text-slate-100 sm:min-h-9 sm:min-w-9" aria-label="Close help">×</button>
        </span>
        <span className="mt-2 block leading-6">{HELP_TEXT[topic] ?? 'Plain-English help for this part of the CRM.'}</span>
      </span>
    </> : null}
  </span>;
}
