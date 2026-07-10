import * as cheerio from 'cheerio';

import { TERRITORY_COUNTIES } from './config';
import { createServiceClient } from './supabase';

const OFFICIAL_SEEDS = [
  { target_type: 'district', target_url: 'https://www.sde.idaho.gov/school-choice/public-schools/', source_domain: 'sde.idaho.gov' },
  { target_type: 'district', target_url: 'https://idahoschools.org/', source_domain: 'idahoschools.org' },
  { target_type: 'school', target_url: 'https://nces.ed.gov/ccd/schoolsearch/', source_domain: 'nces.ed.gov' },
  { target_type: 'district', target_url: 'https://www.ontario.k12.or.us/', source_domain: 'ontario.k12.or.us' },
];
const LINK_KEYWORDS = ['staff','faculty','directory','counseling','counselor','college','career','cte','technical','program','pathway','automotive','welding','construction','engineering','manufacturing','industrial','shop','trades','catalog'];
const ROLE_KEYWORDS = ['principal','assistant principal','counselor','head counselor','college and career','career center','cte director','cte coordinator','automotive','welding','construction','diesel','manufacturing','engineering','robotics','machining','woodworking','industrial technology','shop teacher'];

export async function getDiscoverStatus() {
  const db = createServiceClient();
  const [schools, districts, contacts, queue, lastRun, errors] = await Promise.all([
    db.from('schools').select('id', { count: 'exact', head: true }),
    db.from('districts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('crawl_queue').select('status', { count: 'exact' }).limit(1000),
    db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('crawl_errors').select('*').order('created_at', { ascending: false }).limit(25),
  ]);
  const byStatus = (queue.data ?? []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  return { counts: { schools: schools.count ?? 0, districts: districts.count ?? 0, contacts: contacts.count ?? 0 }, queue: { total: queue.count ?? 0, byStatus }, lastRun: lastRun.data, recentErrors: errors.data ?? [] };
}

async function createRun(run_type: string) {
  const db = createServiceClient();
  const { data } = await db.from('discovery_runs').insert({ run_type, status: 'running' }).select('id').single();
  return data?.id as string | undefined;
}

export async function startSchoolDiscovery() {
  const db = createServiceClient();
  const runId = await createRun('schools');
  let inserted = 0, skipped = 0;
  for (const seed of OFFICIAL_SEEDS) {
    const { error } = await db.from('crawl_queue').upsert({ ...seed, status: 'pending' }, { onConflict: 'target_url' });
    error ? skipped++ : inserted++;
  }
  await db.from('discovery_runs').update({ status: 'complete', completed_at: new Date().toISOString(), rows_inserted: inserted, rows_skipped: skipped }).eq('id', runId);
  return { runId, inserted, skipped, message: 'Queued authoritative Idaho/Ontario discovery sources. Run batches to crawl them.' };
}

export async function startWebsiteDiscovery() {
  const db = createServiceClient();
  const runId = await createRun('websites');
  const { data: rows } = await db.from('schools').select('id,district_id,website,source_url').or('website.not.is.null,source_url.not.is.null');
  let inserted = 0, skipped = 0;
  for (const s of rows ?? []) {
    const url = s.website || s.source_url;
    if (!url) { skipped++; continue; }
    const host = new URL(url).hostname.replace(/^www\./, '');
    const { error } = await db.from('crawl_queue').upsert({ target_type: 'school', target_url: url, source_domain: host, school_id: s.id, district_id: s.district_id, status: 'pending' }, { onConflict: 'target_url' });
    error ? skipped++ : inserted++;
  }
  await db.from('discovery_runs').update({ status: 'complete', completed_at: new Date().toISOString(), rows_inserted: inserted, rows_skipped: skipped }).eq('id', runId);
  return { runId, inserted, skipped };
}

export async function startContactDiscovery() {
  const db = createServiceClient();
  const runId = await createRun('contacts');
  const { data: sources } = await db.from('source_urls').select('school_id,district_id,url').eq('is_official', true);
  let inserted = 0, skipped = 0;
  for (const src of sources ?? []) {
    const host = new URL(src.url).hostname.replace(/^www\./, '');
    const { error } = await db.from('crawl_queue').upsert({ target_type: 'contact_page', target_url: src.url, source_domain: host, school_id: src.school_id, district_id: src.district_id, status: 'pending' }, { onConflict: 'target_url' });
    error ? skipped++ : inserted++;
  }
  await db.from('discovery_runs').update({ status: 'complete', completed_at: new Date().toISOString(), rows_inserted: inserted, rows_skipped: skipped }).eq('id', runId);
  return { runId, inserted, skipped };
}

function absUrl(href: string, base: string) { try { return new URL(href, base).toString(); } catch { return null; } }
function confidence(title: string, email?: string | null) { return email && title ? 'high' : title ? 'medium' : 'low'; }

export async function runDiscoveryBatch(limit = 5) {
  const db = createServiceClient();
  const runId = await createRun('batch');
  const { data: items } = await db.from('crawl_queue').select('*').eq('status', 'pending').order('created_at').limit(limit);
  const summary = { runId, processed: 0, inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };
  for (const item of items ?? []) {
    await db.from('crawl_queue').update({ status: 'running', attempts: (item.attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', item.id);
    try {
      const res = await fetch(item.target_url, { headers: { 'user-agent': 'LincolnTechTerritoryCRM/1.0 official-source discovery' }, signal: AbortSignal.timeout(12000) });
      const html = await res.text();
      const $ = cheerio.load(html);
      const title = $('title').text().trim();
      await db.from('source_urls').upsert({ school_id: item.school_id, district_id: item.district_id, url: item.target_url, page_title: title, http_status: res.status, last_crawled_at: new Date().toISOString(), is_official: true }, { onConflict: 'url' });
      await db.from('crawl_results').insert({ run_id: runId, queue_id: item.id, target_url: item.target_url, http_status: res.status, page_title: title, rows_inserted: 0, rows_updated: 1, rows_skipped: 0 });
      summary.updated++;
      $('a[href]').each((_i, a) => {
        const text = $(a).text().toLowerCase(); const href = $(a).attr('href') ?? '';
        if (!LINK_KEYWORDS.some(k => text.includes(k) || href.toLowerCase().includes(k))) return;
        const url = absUrl(href, item.target_url); if (!url) return;
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!host.endsWith(item.source_domain) && !item.source_domain.endsWith(host)) return;
        db.from('crawl_queue').upsert({ target_type: text.includes('cte') ? 'cte_page' : 'staff_directory', target_url: url, source_domain: host, school_id: item.school_id, district_id: item.district_id, status: 'pending' }, { onConflict: 'target_url' }).then(() => undefined);
      });
      const bodyText = $('body').text();
      const emails = Array.from(new Set(bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
      for (const email of emails.slice(0, 20)) {
        const context = bodyText.slice(Math.max(0, bodyText.indexOf(email) - 160), bodyText.indexOf(email) + 160);
        const role = ROLE_KEYWORDS.find(k => context.toLowerCase().includes(k));
        if (!role) continue;
        const { error } = await db.from('contacts').insert({ email, title: role, school_id: item.school_id, district_id: item.district_id, source_url: item.target_url, source_page_title: title, date_verified: new Date().toISOString().slice(0,10), confidence_score: confidence(role, email), extraction_notes: 'Matched official page email near approved role keyword.', verification_status: 'needs_review' });
        error ? summary.skipped++ : summary.inserted++;
      }
      await db.from('crawl_queue').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', item.id);
      summary.processed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown crawl error';
      summary.errors.push(`${item.target_url}: ${message}`);
      await db.from('crawl_errors').insert({ run_id: runId, queue_id: item.id, target_url: item.target_url, error_message: message });
      await db.from('crawl_queue').update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() }).eq('id', item.id);
    }
  }
  await db.from('discovery_runs').update({ status: 'complete', completed_at: new Date().toISOString(), pages_checked: summary.processed, contacts_found: summary.inserted, rows_inserted: summary.inserted, rows_updated: summary.updated, rows_skipped: summary.skipped, errors: summary.errors }).eq('id', runId);
  return summary;
}

export { TERRITORY_COUNTIES };
