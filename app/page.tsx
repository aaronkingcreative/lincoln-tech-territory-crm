export const dynamic = "force-dynamic";

import { dashboard } from '@/lib/data';
const queues = ['missing principal','missing counselor','missing CTE/shop contact','missing email','broken website','source older than 12 months','low-confidence matches'];
export default async function Home(){ const d=await dashboard(); return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-bold">Lincoln Tech Idaho Territory Recruiting Manager</h1><div className="mt-6 grid gap-4 md:grid-cols-3">{Object.entries(d).map(([k,v])=><div className="rounded-xl bg-white p-6 shadow" key={k}><div className="text-3xl font-bold">{v}</div><div className="capitalize text-slate-600">{k}</div></div>)}</div><h2 className="mt-8 text-xl font-semibold">Review queue</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{queues.map(q=><div className="rounded bg-white p-4 shadow" key={q}>{q}</div>)}</div></main> }
