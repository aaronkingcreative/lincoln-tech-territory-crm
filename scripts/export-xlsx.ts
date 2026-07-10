import { writeFileSync, mkdirSync } from 'node:fs';
import { utils, write } from 'xlsx';
import { db } from './shared';

mkdirSync('exports', { recursive: true });
const wb = utils.book_new();
for (const t of ['districts', 'schools', 'contacts', 'recruiting_notes', 'contact_logs', 'crawl_queue', 'crawl_errors', 'source_urls']) {
  const { data, error } = await db().from(t).select('*');
  if (!error) utils.book_append_sheet(wb, utils.json_to_sheet(data ?? []), t.slice(0, 31));
}
writeFileSync('exports/lincoln-tech-territory.xlsx', write(wb, { type: 'buffer', bookType: 'xlsx' }));
