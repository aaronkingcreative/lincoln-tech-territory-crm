import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Lincoln Tech Idaho Territory Recruiting Manager' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <nav className="border-b border-slate-800 bg-slate-900/95 shadow-sm shadow-slate-950/30">
          <div className="mx-auto flex max-w-7xl gap-4 p-4 text-sm font-medium text-slate-200">
            <Link className="transition hover:text-sky-300" href="/">
              Dashboard
            </Link>
            <Link className="transition hover:text-sky-300" href="/schools">
              Schools
            </Link>
            <Link className="transition hover:text-sky-300" href="/districts">
              Districts
            </Link>
            <Link className="transition hover:text-sky-300" href="/contacts">
              Contacts
            </Link>
            <Link className="transition hover:text-sky-300" href="/map">
              Map
            </Link>
            <Link className="transition hover:text-sky-300" href="/admin/import-schools">
              Import
            </Link>
            <a className="transition hover:text-sky-300" href="/api/export">
              Export XLSX
            </a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
