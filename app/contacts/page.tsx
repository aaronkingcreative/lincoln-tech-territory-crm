import { getRows } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
export default async function Page(){ const rows = await getRows('contacts'); return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-4 text-2xl font-bold capitalize">contacts</h1><DataTable rows={rows as Record<string, unknown>[]} /></main> }
