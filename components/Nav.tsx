'use client';
import Link from 'next/link';
import { useState } from 'react';

const primaryLinks = [['/','Dashboard'],['/schools','Schools'],['/coverage','Coverage'],['/admin/territory-review','Tasks']] as const;
const moreLinks = [['/districts','Districts'],['/contacts','Contacts'],['/map','Map'],['/admin/discover','Discover'],['/admin/import-schools','Run a School Import'],['/admin/json-import','AI Assisted Update']] as const;
const desktopLinks = [...primaryLinks, ...moreLinks] as const;

export default function Nav(){
  const[open,setOpen]=useState(false);
  const close=()=>setOpen(false);
  return <>
    <nav className="border-b border-slate-800 bg-slate-900/95 shadow-sm shadow-slate-950/30">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 p-4 text-sm font-medium text-slate-200">
        <Link href="/" className="min-w-0 truncate font-semibold text-slate-50">Lincoln Tech CRM</Link>
        <button className="min-h-11 shrink-0 rounded-lg border border-slate-700 px-3 sm:hidden" onClick={()=>setOpen(!open)} aria-label="Open navigation menu" aria-expanded={open}>☰ Menu</button>
        <div className="hidden flex-wrap gap-4 sm:flex">{desktopLinks.map(([href,label])=><Link key={href} className="transition hover:text-sky-300" href={href}>{label}</Link>)}<a className="transition hover:text-sky-300" href="/api/export">Export XLSX</a></div>
      </div>
      {open?<div className="grid gap-1 border-t border-slate-800 p-3 sm:hidden">{[...desktopLinks].map(([href,label])=><Link key={href} onClick={close} className="min-h-11 rounded-lg px-3 py-3 hover:bg-slate-800" href={href}>{label}</Link>)}<a onClick={close} className="min-h-11 rounded-lg px-3 py-3 hover:bg-slate-800" href="/api/export">Export XLSX</a></div>:null}
    </nav>
    <div className="fixed inset-x-0 bottom-0 z-[1000] grid grid-cols-5 border-t border-slate-800 bg-slate-900/95 px-1 pb-[env(safe-area-inset-bottom)] text-center text-[11px] shadow-2xl shadow-slate-950 sm:hidden">
      {[...primaryLinks, ['/more','More'] as const].map(([href,label])=>href==='/more'?<button key={href} onClick={()=>setOpen(!open)} className="min-w-0 px-1 py-3 font-medium text-slate-100" aria-label="Open more navigation" aria-expanded={open}>More</button>:<Link key={href} className="min-w-0 truncate px-1 py-3 font-medium text-slate-100" href={href}>{label}</Link>)}
    </div>
  </>;
}
