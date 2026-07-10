import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = { title: 'Lincoln Tech Idaho Territory Recruiting Manager' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="bg-slate-50 text-slate-900"><nav className="border-b bg-white"><div className="mx-auto flex max-w-7xl gap-4 p-4 text-sm font-medium"><Link href="/">Dashboard</Link><Link href="/schools">Schools</Link><Link href="/districts">Districts</Link><Link href="/contacts">Contacts</Link><Link href="/map">Map</Link><a href="/api/export">Export XLSX</a></div></nav>{children}</body></html>;
}
