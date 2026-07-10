import * as cheerio from 'cheerio';

import { TERRITORY_COUNTIES } from './config';
import { importTerritorySchools } from '../scripts/seed-schools';
import { createServiceClient } from './supabase';

const OFFICIAL_SEEDS = [
  { target_type: 'district', target_url: 'https://www.sde.idaho.gov/school-choice/public-schools/', source_domain: 'sde.idaho.gov' },
  { target_type: 'district', target_url: 'https://idahoschools.org/', source_domain: 'idahoschools.org' },
  { target_type: 'school', target_url: 'https://nces.ed.gov/ccd/schoolsearch/', source_domain: 'nces.ed.gov' },
  { target_type: 'district', target_url: 'https://www.ontario.k12.or.us/', source_domain: 'ontario.k12.or.us' },
];
const LINK_KEYWORDS = ['staff','faculty','directory','counseling','counselor','college','career','cte','technical','program','pathway','automotive','welding','construction','engineering','manufacturing','industrial','shop','trades','catalog'];

type QueueSeed = {
  target_type: 'district' | 'school' | 'staff_directory' | 'cte_page' | 'contact_page';
  target_url: string;
  source_domain?: string;
  school_id?: string | null;
  district_id?: string | null;
};

type QueueResult = { url: string; action: 'created' | 'skipped' | 'updated'; reason?: string; status?: string };

async function queueDiscoverySource(db: ReturnType<typeof createServiceClient>, seed: QueueSeed): Promise<QueueResult> {
  let url: URL;
  try {
    url = new URL(seed.target_url);
  } catch {
    return { url: seed.target_url, action: 'skipped', reason: 'invalid URL' };
  }

  url.hash = '';
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const targetUrl = url.toString();
  const sourceDomain = seed.source_domain ?? url.hostname.replace(/^www\./, '');
  const { data: existing, error: lookupError } = await db
    .from('crawl_queue')
    .select('id,status')
    .eq('target_url', targetUrl)
    .eq('target_type', seed.target_type)
    .maybeSingle();

  if (lookupError) return { url: targetUrl, action: 'skipped', reason: `lookup failed: ${lookupError.message}` };
  if (existing?.id) {
    if (false && (existing.status === 'failed' || existing.status === 'skipped')) {
      const { error: updateError } = await db
        .from('crawl_queue')
        .update({ status: 'pending', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      return updateError
        ? { url: targetUrl, action: 'skipped', reason: `requeue failed: ${updateError.message}`, status: existing.status }
        : { url: targetUrl, action: 'updated', reason: `requeued from ${existing.status}`, status: 'pending' };
    }
    return { url: targetUrl, action: 'skipped', reason: `already exists with status ${existing.status}`, status: existing.status };
  }

  const { error } = await db.from('crawl_queue').insert({
    target_type: seed.target_type,
    target_url: targetUrl,
    source_domain: sourceDomain,
    school_id: seed.school_id ?? null,
    district_id: seed.district_id ?? null,
    status: 'pending',
  });
  return error
    ? { url: targetUrl, action: 'skipped', reason: `insert failed: ${error.message}` }
    : { url: targetUrl, action: 'created', status: 'pending' };
}

async function getQueueCounts(db: ReturnType<typeof createServiceClient>) {
  const { data } = await db.from('crawl_queue').select('status,target_type').limit(50000);
  return (data ?? []).reduce<Record<string, any>>((acc, row: any) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    acc.byType[row.target_type] = (acc.byType[row.target_type] ?? 0) + 1;
    return acc;
  }, { pending: 0, running: 0, complete: 0, failed: 0, skipped: 0, byType: {} });
}

const ROLE_KEYWORDS = ['principal','assistant principal','counselor','head counselor','college and career','career center','cte director','cte coordinator','automotive','welding','construction','diesel','manufacturing','engineering','robotics','machining','woodworking','industrial technology','shop teacher'];

export async function getDiscoverStatus() {
  const db = createServiceClient();
  const [schools, districts, contacts, queue, lastRun, errors] = await Promise.all([
    db.from('schools').select('id', { count: 'exact', head: true }),
    db.from('districts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('crawl_queue').select('status,target_type', { count: 'exact' }).limit(50000),
    db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(10),
    db.from('crawl_errors').select('*').order('created_at', { ascending: false }).limit(25),
  ]);
  const byStatus = (queue.data ?? []).reduce<Record<string, number>>((acc, row: any) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, { pending: 0, running: 0, complete: 0, failed: 0, skipped: 0 });
  const byType = (queue.data ?? []).reduce<Record<string, number>>((acc, row: any) => { acc[row.target_type] = (acc[row.target_type] ?? 0) + 1; return acc; }, {});
  const runs = lastRun.data ?? [];
  return { counts: { schools: schools.count ?? 0, districts: districts.count ?? 0, contacts: contacts.count ?? 0 }, queue: { total: queue.count ?? 0, byStatus, byType }, lastRun: runs[0], recentRuns: runs, lastSuccessfulBatch: runs.find((r:any)=>r.run_type==='batch'&&r.status==='complete'), lastFailedBatch: runs.find((r:any)=>r.run_type==='batch'&&r.status==='failed'), stuckRunning: runs.filter((r:any)=>r.status==='running').length, recentErrors: errors.data ?? [] };
}

async function createRun(run_type: string) {
  const db = createServiceClient();
  const { data } = await db.from('discovery_runs').insert({ run_type, status: 'running' }).select('id').single();
  return data?.id as string | undefined;
}

export async function startSchoolDiscovery() {
  const db = createServiceClient();
  const runId = await createRun('schools');
  const seedSummary = await importTerritorySchools();

  const queueSeeds: QueueSeed[] = [...(OFFICIAL_SEEDS as QueueSeed[])];
  const { data: schools } = await db.from('schools').select('id,district_id,website,source_url');
  for (const school of schools ?? []) {
    if (school.source_url) queueSeeds.push({ target_type: 'school', target_url: school.source_url, school_id: school.id, district_id: school.district_id });
    if (school.website && school.website !== school.source_url) queueSeeds.push({ target_type: 'school', target_url: school.website, school_id: school.id, district_id: school.district_id });
  }

  const queueResults: QueueResult[] = [];
  for (const seed of queueSeeds) queueResults.push(await queueDiscoverySource(db, seed));

  const inserted = queueResults.filter((result) => result.action === 'created').length;
  const requeued = queueResults.filter((result) => result.action === 'updated').length;
  const skipped = queueResults.filter((result) => result.action === 'skipped').length;
  const queueCounts = await getQueueCounts(db);
  const message = inserted || requeued
    ? 'Imported embedded territory school baseline and queued official sources for verification/enrichment.'
    : 'Imported embedded territory school baseline; no new crawl_queue rows were created.';

  await db.from('discovery_runs').update({
    status: 'complete',
    completed_at: new Date().toISOString(),
    rows_inserted: seedSummary.schools.inserted + seedSummary.districts.inserted + inserted,
    rows_updated: seedSummary.schools.updated + seedSummary.districts.updated + requeued,
    rows_skipped: seedSummary.schools.skipped + seedSummary.districts.skipped + skipped,
    errors: [...seedSummary.errors, ...queueResults.filter((result) => result.action === 'skipped').map((result) => `${result.url}: ${result.reason}`)],
  }).eq('id', runId);

  return { runId, inserted, requeued, skipped, queueCreated: inserted, queueCounts, seedSummary, queueResults, message };
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
    const result = await queueDiscoverySource(db, { target_type: 'school', target_url: url, source_domain: host, school_id: s.id, district_id: s.district_id });
    result.action === 'created' ? inserted++ : skipped++;
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
    const result = await queueDiscoverySource(db, { target_type: 'contact_page', target_url: src.url, source_domain: host, school_id: src.school_id, district_id: src.district_id });
    result.action === 'created' ? inserted++ : skipped++;
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
  const initialQueueCounts = await getQueueCounts(db);
  const summary = { runId, processed: 0, inserted: 0, updated: 0, skipped: 0, queued_new: 0, queued_duplicate_skipped: 0, queued_existing_skipped: 0, errors: [] as string[], queueCounts: initialQueueCounts, message: '' };
  if (!(items ?? []).length) {
    summary.message = initialQueueCounts.pending > 0
      ? 'No rows were selected even though pending crawl_queue rows exist; check the batch limit and queue query.'
      : 'No pending crawl_queue rows to process. Use discovery start actions to create pending rows or inspect running/failed counts.';
    await db.from('discovery_runs').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      errors: [summary.message],
    }).eq('id', runId);
    return summary;
  }
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
      const linkQueueWrites: Promise<QueueResult>[] = [];
      const seenLinks = new Set<string>();
      const perDomain = new Map<string, number>();
      $('a[href]').each((_i, a) => {
        const text = $(a).text().toLowerCase(); const href = $(a).attr('href') ?? '';
        if (!LINK_KEYWORDS.some(k => text.includes(k) || href.toLowerCase().includes(k))) return;
        const url = absUrl(href, item.target_url); if (!url) return;
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!host.endsWith(item.source_domain) && !item.source_domain.endsWith(host)) return;
        if (seenLinks.has(url)) { summary.queued_duplicate_skipped++; return; }
        seenLinks.add(url);
        const domainCount = perDomain.get(host) ?? 0;
        if (domainCount >= 8 || linkQueueWrites.length >= 15) { summary.queued_existing_skipped++; return; }
        perDomain.set(host, domainCount + 1);
        linkQueueWrites.push(queueDiscoverySource(db, { target_type: text.includes('cte') ? 'cte_page' : 'staff_directory', target_url: url, source_domain: host, school_id: item.school_id, district_id: item.district_id }));
      });
      const linkResults = await Promise.all(linkQueueWrites);
      summary.queued_new += linkResults.filter(r=>r.action==='created').length;
      summary.queued_existing_skipped += linkResults.filter(r=>r.action!=='created').length;
      const bodyText = $('body').text();
      const emails = Array.from(new Set<string>(bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
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
  summary.queueCounts = await getQueueCounts(db);
  summary.message = `Batch complete. Processed ${summary.processed} queued pages. Updated ${summary.updated} records. Pending queue: ${summary.queueCounts.pending}.`;
  await db.from('discovery_runs').update({ status: 'complete', completed_at: new Date().toISOString(), pages_checked: summary.processed, contacts_found: summary.inserted, rows_inserted: summary.inserted + summary.queued_new, rows_updated: summary.updated, rows_skipped: summary.skipped + summary.queued_existing_skipped + summary.queued_duplicate_skipped, errors: summary.errors }).eq('id', runId);
  return summary;
}

export { TERRITORY_COUNTIES };
