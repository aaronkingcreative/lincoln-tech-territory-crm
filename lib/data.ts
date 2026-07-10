import { createServiceClient, hasSupabaseServiceCredentials } from './supabase';

export type Row = Record<string, unknown>;

export async function getRows(table: string) {
  if (!hasSupabaseServiceCredentials()) return [];

  const { data, error } = await createServiceClient().from(table).select('*').limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function dashboard() {
  if (!hasSupabaseServiceCredentials()) return { schools: 0, contacts: 0, districts: 0 };

  const db = createServiceClient();
  const [schools, contacts, districts] = await Promise.all(
    ['schools', 'contacts', 'districts'].map((table) => db.from(table).select('id', { count: 'exact', head: true })),
  );

  return { schools: schools.count ?? 0, contacts: contacts.count ?? 0, districts: districts.count ?? 0 };
}
