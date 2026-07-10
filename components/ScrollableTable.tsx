'use client';

import { ReactNode, UIEvent, useState } from 'react';

export function ScrollableTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [scrolled, setScrolled] = useState(false);
  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollLeft > 12) setScrolled(true);
  }
  return <div className={`relative ${className}`}>
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-2 rounded-full border border-sky-400/40 bg-slate-950/95 px-3 py-1 text-xs font-semibold text-sky-100 shadow-lg shadow-slate-950/40 sm:hidden">
      <span>{scrolled ? 'More columns' : 'Swipe left to see more'}</span><span aria-hidden="true" className="text-lg leading-none">→</span>
    </div>
    <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 bg-gradient-to-l from-slate-950/90 to-transparent sm:hidden" />
    <div onScroll={onScroll} className="overflow-x-auto">{children}</div>
  </div>;
}
