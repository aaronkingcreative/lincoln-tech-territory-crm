import './globals.css';
import type { Metadata } from 'next';
import Nav from '@/components/Nav';

export const metadata: Metadata = { title: 'Lincoln Tech Idaho Territory Recruiting Manager' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 pb-14 text-slate-100 antialiased sm:pb-0">
        <Nav />
        {children}
      </body>
    </html>
  );
}
