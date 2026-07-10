import { createServiceClient } from './supabase';
export type Row = Record<string, unknown>;
export async function getRows(table: string) { const { data, error } = await createServiceClient().from(table).select('*').limit(500); if (error) throw error; return data ?? []; }
export async function dashboard() {
  const db = createServiceClient();
  const [schools, contacts, districts] = await Promise.all(['schools','contacts','districts'].map(t=>db.from(t).select('id', { count:'exact', head:true })));
  return { schools: schools.count ?? 0, contacts: contacts.count ?? 0, districts: districts.count ?? 0 };
}
