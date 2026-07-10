export const dynamic = "force-dynamic";

import { getRows } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import HelpIcon from '@/components/HelpIcon';
export default async function Page(){ const rows = await getRows('contacts'); return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-4 text-2xl font-bold capitalize">Contacts <HelpIcon topic="Contacts page"/></h1><DataTable rows={rows as Record<string, unknown>[]} /></main> }
