'use client';
import { useState } from 'react';

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
export default function HelpIcon({ topic }: { topic: string }) { const [open,setOpen]=useState(false); return <span className="relative inline-flex align-middle"><button type="button" onClick={()=>setOpen(!open)} className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-500/50 bg-slate-950 text-sm font-bold text-sky-200" aria-label={`Help: ${topic}`}>?</button>{open?<span className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-sm font-normal text-slate-200 shadow-2xl"><b className="block text-sky-200">{topic}</b>{HELP_TEXT[topic] ?? 'Plain-English help for this part of the CRM.'}</span>:null}</span> }
