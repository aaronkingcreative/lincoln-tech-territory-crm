'use client';

import { ReactNode, UIEvent, useState } from 'react';

export function ScrollableTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [scrolled, setScrolled] = useState(false);
  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollLeft > 12) setScrolled(true);
  }
  return <div className={`relative ${className}`}>
    <div className="mb-2 flex justify-end sm:hidden">
      <div className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-slate-950/95 px-3 py-1 text-xs font-semibold text-sky-100 shadow-lg shadow-slate-950/40">
        <span>{scrolled ? 'More columns available' : 'Swipe left to see more'}</span><span aria-hidden="true" className="text-lg leading-none">→</span>
      </div>
    </div>
    {!scrolled ? <div className="pointer-events-none absolute bottom-0 right-0 top-12 z-[1] w-10 bg-gradient-to-l from-slate-950/80 to-transparent sm:hidden" /> : null}
    <div onScroll={onScroll} className="overflow-x-auto">{children}</div>
  </div>;
}
