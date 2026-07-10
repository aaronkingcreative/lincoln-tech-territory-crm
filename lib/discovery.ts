import * as cheerio from 'cheerio';

import { TERRITORY_COUNTIES } from './config';
import { importTerritorySchools } from '../scripts/seed-schools';
import { createServiceClient } from './supabase';

const OFFICIAL_SEEDS = [
  { target_type: 'district', target_url: 'https://www.sde.idaho.gov/school-choice/public-schools/', source_domain: 'sde.idaho.gov' },
  { target_type: 'district', target_url: 'https://idahoschools.org/', source_domain: 'idahoschools.org' },
  { target_type: 'school', target_url: 'https://nces.ed.gov/ccd/schoolsearch/', source_domain: 'nces.ed.gov' },
  { target_type: 'district', target_url: 'https://www.ontario.k12.or.us/', source_domain: 'ontario.k12.or.us' },
] as const;

const LINK_KEYWORDS = ['staff', 'faculty', 'directory', 'counseling', 'counselor', 'college', 'career', 'cte', 'technical', 'program', 'pathway', 'automotive', 'welding', 'construction', 'engineering', 'manufacturing', 'industrial', 'shop', 'trades', 'catalog'];
const ROLE_KEYWORDS = ['principal', 'assistant principal', 'counselor', 'head counselor', 'college and career', 'career center', 'cte director', 'cte coordinator', 'automotive', 'welding', 'construction', 'diesel', 'manufacturing', 'engineering', 'robotics', 'machining', 'woodworking', 'industrial technology', 'shop teacher'];
const STATUS_VALUES = ['pending', 'running', 'complete', 'failed', 'skipped'] as const;
const MAX_DISCOVERED_LINKS_PER_PAGE = 8;
const MAX_DISCOVERED_LINKS_PER_DOMAIN = 5;
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_)/i;

type TargetType = 'district' | 'school' | 'staff_directory' | 'cte_page' | 'contact_page';
type QueueSeed = { target_type: TargetType; target_url: string; source_domain?: string; school_id?: string | null; district_id?: string | null };
type QueueResult = { url: string; action: 'created' | 'skipped'; reason?: string; status?: string; duplicateCount?: number };
type Db = ReturnType<typeof createServiceClient>;

type QueueCounts = Record<(typeof STATUS_VALUES)[number], number> & { byType: Record<string, number> };

type DuplicateQueueTarget = {
  target_url: string;
  target_type: string;
  count: number;
  statuses: Record<string, number>;
};

type BatchSummary = {
  runId?: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  contact_candidates: number;
  emails_found: number;
  role_matches: number;
  queued_new: number;
  queued_duplicate_skipped: number;
  queued_existing_skipped: number;
  errors: string[];
  queueCounts: QueueCounts;
  message: string;
};

function emptyQueueCounts(): QueueCounts {
  return { pending: 0, running: 0, complete: 0, failed: 0, skipped: 0, byType: {} };
}

function normalizeTargetUrl(input: string) {
  const url = new URL(input);
  url.hash = '';
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.pathname = url.pathname.replace(/\/+/g, '/').replace(/\/index\.(html?|php)$/i, '').replace(/\/$/, '') || '/';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

function hostFor(input: string, fallback?: string | null) {
  try { return new URL(input).hostname.toLowerCase().replace(/^www\./, ''); } catch { return fallback?.replace(/^www\./, '') ?? ''; }
}

function sameDomain(child: string, parent: string) {
  return child === parent || child.endsWith(`.${parent}`) || parent.endsWith(`.${child}`);
}

function absUrl(href: string, base: string) { try { return normalizeTargetUrl(new URL(href, base).toString()); } catch { return null; } }
function confidence(title: string, email?: string | null) { return email && title ? 'high' : title ? 'medium' : 'low'; }
function roleFromContext(context: string) { const lower = context.toLowerCase(); return ROLE_KEYWORDS.find((keyword) => lower.includes(keyword)); }

async function finalizeRun(db: Db, runId: string | undefined, status: 'complete' | 'failed', summary: Partial<BatchSummary> & Record<string, unknown>) {
  if (!runId) return;
  await db.from('discovery_runs').update({
    status,
    completed_at: new Date().toISOString(),
    pages_checked: summary.processed ?? 0,
    contacts_found: summary.inserted ?? 0,
    rows_inserted: Number(summary.inserted ?? 0) + Number(summary.queued_new ?? 0),
    rows_updated: summary.updated ?? 0,
    rows_skipped: Number(summary.skipped ?? 0) + Number(summary.queued_duplicate_skipped ?? 0) + Number(summary.queued_existing_skipped ?? 0),
    errors: summary.errors ?? [],
  }).eq('id', runId);
}

async function createRun(db: Db, run_type: string) {
  const { data, error } = await db.from('discovery_runs').insert({ run_type, status: 'running' }).select('id').single();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function queueDiscoverySource(db: Db, seed: QueueSeed): Promise<QueueResult> {
  let targetUrl: string;
  try { targetUrl = normalizeTargetUrl(seed.target_url); } catch { return { url: seed.target_url, action: 'skipped', reason: 'invalid URL' }; }

  const sourceDomain = (seed.source_domain ?? hostFor(targetUrl)).toLowerCase().replace(/^www\./, '');
  const wwwVariant = (() => { try { const url = new URL(targetUrl); url.hostname = `www.${url.hostname}`; return url.toString(); } catch { return targetUrl; } })();
  const variants = [...new Set([targetUrl, targetUrl.replace(/\/$/, ''), `${targetUrl.replace(/\/$/, '')}/`, wwwVariant, wwwVariant.replace(/\/$/, ''), `${wwwVariant.replace(/\/$/, '')}/`])];
  const { data: existingRows, error: lookupError } = await db
    .from('crawl_queue')
    .select('id,status,target_url,target_type')
    .eq('target_type', seed.target_type)
    .in('target_url', variants)
    .order('created_at', { ascending: true })
    .limit(25);

  if (lookupError) return { url: targetUrl, action: 'skipped', reason: `lookup failed: ${lookupError.message}` };
  if ((existingRows ?? []).length > 0) {
    const first = existingRows![0];
    return { url: targetUrl, action: 'skipped', reason: `already exists with status ${first.status}`, status: first.status, duplicateCount: existingRows!.length };
  }

  const { error } = await db.from('crawl_queue').insert({
    target_type: seed.target_type,
    target_url: targetUrl,
    source_domain: sourceDomain,
    school_id: seed.school_id ?? null,
    district_id: seed.district_id ?? null,
    status: 'pending',
  });

  return error ? { url: targetUrl, action: 'skipped', reason: `insert failed: ${error.message}` } : { url: targetUrl, action: 'created', status: 'pending' };
}

async function getQueueCounts(db: Db): Promise<QueueCounts> {
  const counts = emptyQueueCounts();
  const statusCounts = await Promise.all(STATUS_VALUES.map(async (status) => {
    const { count, error } = await db.from('crawl_queue').select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw error;
    return [status, count ?? 0] as const;
  }));
  for (const [status, count] of statusCounts) counts[status] = count;

  const { data, error } = await db.from('crawl_queue').select('target_type').limit(50000);
  if (error) throw error;
  for (const row of data ?? []) counts.byType[row.target_type] = (counts.byType[row.target_type] ?? 0) + 1;
  return counts;
}

async function getQueueDuplicates(db: Db) {
  const { data, error } = await db.from('crawl_queue').select('target_url,target_type,status').limit(50000);
  if (error) throw error;
  const seen = new Map<string, DuplicateQueueTarget>();
  for (const row of data ?? []) {
    const normalized = (() => { try { return normalizeTargetUrl(String(row.target_url ?? '')); } catch { return String(row.target_url ?? ''); } })();
    const targetType = String(row.target_type ?? 'unknown');
    const status = String(row.status ?? 'unknown');
    const key = `${targetType}|${normalized}`;
    const current: DuplicateQueueTarget = seen.get(key) ?? { target_url: normalized, target_type: targetType, count: 0, statuses: {} };
    current.count += 1;
    current.statuses[status] = (current.statuses[status] ?? 0) + 1;
    seen.set(key, current);
  }
  return [...seen.values()].filter((row) => row.count > 1).sort((a, b) => b.count - a.count).slice(0, 20);
}

export async function getDiscoverStatus() {
  const db = createServiceClient();
  const [schools, districts, contacts, queueCounts, runs, errors, duplicateTargets] = await Promise.all([
    db.from('schools').select('id', { count: 'exact', head: true }),
    db.from('districts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    getQueueCounts(db),
    db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(20),
    db.from('crawl_errors').select('*').order('created_at', { ascending: false }).limit(25),
    getQueueDuplicates(db),
  ]);
  for (const result of [schools, districts, contacts, runs, errors]) if ('error' in result && result.error) throw result.error;
  const recentRuns = runs.data ?? [];
  return {
    counts: { schools: schools.count ?? 0, districts: districts.count ?? 0, contacts: contacts.count ?? 0 },
    queue: { total: STATUS_VALUES.reduce((total, status) => total + queueCounts[status], 0), byStatus: queueCounts, byType: queueCounts.byType, duplicateTargets },
    lastRun: recentRuns[0],
    recentRuns,
    lastSuccessfulBatch: recentRuns.find((r: any) => r.run_type === 'batch' && r.status === 'complete'),
    lastFailedBatch: recentRuns.find((r: any) => r.run_type === 'batch' && r.status === 'failed'),
    stuckRunning: recentRuns.filter((r: any) => r.status === 'running' && Date.now() - new Date(r.started_at).getTime() > 10 * 60 * 1000).length,
    recentErrors: errors.data ?? [],
    cleanupSql: "-- Review first, then archive duplicate pending queue rows; do not delete manually-entered schools/contacts.\nwith ranked as (select id, row_number() over (partition by lower(regexp_replace(target_url, '/+$', '')), target_type order by case status when 'complete' then 0 when 'running' then 1 when 'pending' then 2 else 3 end, created_at) as rn from public.crawl_queue) update public.crawl_queue q set status = 'skipped', last_error = 'Duplicate queue target skipped by admin cleanup', updated_at = now() from ranked r where q.id = r.id and r.rn > 1 and q.status = 'pending';",
  };
}

export async function startSchoolDiscovery() {
  const db = createServiceClient();
  const runId = await createRun(db, 'schools');
  const errors: string[] = [];
  try {
    const seedSummary = await importTerritorySchools();
    const queueSeeds: QueueSeed[] = OFFICIAL_SEEDS.map((seed) => ({ ...seed })) as QueueSeed[];
    const { data: schools, error } = await db.from('schools').select('id,district_id,website,source_url');
    if (error) throw error;
    for (const school of schools ?? []) {
      if (school.source_url) queueSeeds.push({ target_type: 'school', target_url: school.source_url, school_id: school.id, district_id: school.district_id });
      if (school.website && school.website !== school.source_url) queueSeeds.push({ target_type: 'school', target_url: school.website, school_id: school.id, district_id: school.district_id });
    }
    const queueResults: QueueResult[] = [];
    for (const seed of queueSeeds) queueResults.push(await queueDiscoverySource(db, seed));
    const inserted = queueResults.filter((result) => result.action === 'created').length;
    const skipped = queueResults.filter((result) => result.action === 'skipped').length;
    errors.push(...seedSummary.errors, ...queueResults.filter((result) => result.action === 'skipped' && result.reason?.startsWith('lookup failed')).map((result) => `${result.url}: ${result.reason}`));
    const summary = { runId, processed: 0, inserted: seedSummary.schools.inserted + seedSummary.districts.inserted + inserted, updated: seedSummary.schools.updated + seedSummary.districts.updated, skipped: seedSummary.schools.skipped + seedSummary.districts.skipped + skipped, queued_new: inserted, queued_duplicate_skipped: queueResults.filter((r) => r.duplicateCount && r.duplicateCount > 1).length, queued_existing_skipped: skipped, errors, queueCounts: await getQueueCounts(db), message: inserted ? 'Imported territory baseline and queued new official sources.' : 'Imported territory baseline; all queue targets already existed.' };
    await finalizeRun(db, runId, 'complete', summary);
    return { ...summary, seedSummary, queueResults };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'School discovery failed';
    await finalizeRun(db, runId, 'failed', { errors: [message] });
    throw error;
  }
}

export async function startWebsiteDiscovery() {
  const db = createServiceClient();
  const runId = await createRun(db, 'websites');
  try {
    const { data: rows, error } = await db.from('schools').select('id,district_id,website,source_url').or('website.not.is.null,source_url.not.is.null');
    if (error) throw error;
    let inserted = 0, skipped = 0, duplicateSkipped = 0;
    for (const school of rows ?? []) {
      const url = school.website || school.source_url;
      if (!url) { skipped++; continue; }
      const result = await queueDiscoverySource(db, { target_type: 'school', target_url: url, source_domain: hostFor(url), school_id: school.id, district_id: school.district_id });
      if (result.action === 'created') inserted++; else { skipped++; if ((result.duplicateCount ?? 0) > 1) duplicateSkipped++; }
    }
    const summary = { runId, processed: 0, inserted, updated: 0, skipped, queued_new: inserted, queued_duplicate_skipped: duplicateSkipped, queued_existing_skipped: skipped - duplicateSkipped, errors: [], queueCounts: await getQueueCounts(db), message: `Website discovery queued ${inserted} new pages and skipped ${skipped} existing/duplicate pages.` };
    await finalizeRun(db, runId, 'complete', summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Website discovery failed';
    await finalizeRun(db, runId, 'failed', { errors: [message] });
    throw error;
  }
}

export async function startContactDiscovery() {
  const db = createServiceClient();
  const runId = await createRun(db, 'contacts');
  try {
    const { data: sources, error } = await db.from('source_urls').select('school_id,district_id,url').eq('is_official', true);
    if (error) throw error;
    let inserted = 0, skipped = 0, duplicateSkipped = 0;
    for (const src of sources ?? []) {
      const result = await queueDiscoverySource(db, { target_type: 'contact_page', target_url: src.url, source_domain: hostFor(src.url), school_id: src.school_id, district_id: src.district_id });
      if (result.action === 'created') inserted++; else { skipped++; if ((result.duplicateCount ?? 0) > 1) duplicateSkipped++; }
    }
    const summary = { runId, processed: 0, inserted, updated: 0, skipped, queued_new: inserted, queued_duplicate_skipped: duplicateSkipped, queued_existing_skipped: skipped - duplicateSkipped, errors: [], queueCounts: await getQueueCounts(db), message: `Contact discovery queued ${inserted} new contact pages and skipped ${skipped} existing/duplicate pages.` };
    await finalizeRun(db, runId, 'complete', summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contact discovery failed';
    await finalizeRun(db, runId, 'failed', { errors: [message] });
    throw error;
  }
}

function emailCandidates($: cheerio.CheerioAPI, bodyText: string) {
  const fromText = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const fromMailto: string[] = [];
  $('a[href^="mailto:"]').each((_i, link) => {
    const href = $(link).attr('href') ?? '';
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (email) fromMailto.push(email);
  });
  return [...new Set([...fromText, ...fromMailto].map((email) => email.toLowerCase()))];
}

export async function runDiscoveryBatch(limit = 5) {
  const db = createServiceClient();
  const runId = await createRun(db, 'batch');
  const initialQueueCounts = await getQueueCounts(db);
  const summary: BatchSummary = { runId, processed: 0, inserted: 0, updated: 0, skipped: 0, contact_candidates: 0, emails_found: 0, role_matches: 0, queued_new: 0, queued_duplicate_skipped: 0, queued_existing_skipped: 0, errors: [], queueCounts: initialQueueCounts, message: '' };

  try {
    const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 5, 10));
    const { data: items, error } = await db.from('crawl_queue').select('*').eq('status', 'pending').order('created_at').limit(safeLimit);
    if (error) throw error;

    if (!(items ?? []).length) {
      summary.message = initialQueueCounts.pending > 0 ? 'No rows were selected even though pending crawl_queue rows exist; check RLS/status values.' : 'No pending crawl_queue rows to process.';
      await finalizeRun(db, runId, 'complete', summary);
      return summary;
    }

    for (const item of items ?? []) {
      const canonicalItemUrl = (() => { try { return normalizeTargetUrl(item.target_url); } catch { return item.target_url; } })();
      await db.from('crawl_queue').update({ status: 'running', attempts: (item.attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', item.id);
      try {
        const res = await fetch(canonicalItemUrl, { headers: { 'user-agent': 'LincolnTechTerritoryCRM/1.0 official-source discovery' }, signal: AbortSignal.timeout(12000) });
        const html = await res.text();
        const $ = cheerio.load(html);
        const title = $('title').text().trim();
        await db.from('source_urls').upsert({ school_id: item.school_id, district_id: item.district_id, url: canonicalItemUrl, page_title: title, http_status: res.status, last_crawled_at: new Date().toISOString(), is_official: true }, { onConflict: 'url' });
        await db.from('crawl_results').insert({ run_id: runId, queue_id: item.id, target_url: canonicalItemUrl, http_status: res.status, page_title: title, rows_inserted: 0, rows_updated: 1, rows_skipped: 0 });
        summary.updated++;

        const linkQueueWrites: Promise<QueueResult>[] = [];
        const seenLinks = new Set<string>();
        const perDomain = new Map<string, number>();
        $('a[href]').each((_i, link) => {
          const text = $(link).text().toLowerCase();
          const href = $(link).attr('href') ?? '';
          if (!LINK_KEYWORDS.some((keyword) => text.includes(keyword) || href.toLowerCase().includes(keyword))) return;
          const url = absUrl(href, canonicalItemUrl); if (!url) return;
          const host = hostFor(url);
          const sourceDomain = hostFor(item.source_domain || canonicalItemUrl);
          if (!sameDomain(host, sourceDomain)) return;
          if (seenLinks.has(url)) { summary.queued_duplicate_skipped++; return; }
          seenLinks.add(url);
          const domainCount = perDomain.get(host) ?? 0;
          if (domainCount >= MAX_DISCOVERED_LINKS_PER_DOMAIN || linkQueueWrites.length >= MAX_DISCOVERED_LINKS_PER_PAGE) { summary.queued_existing_skipped++; return; }
          perDomain.set(host, domainCount + 1);
          linkQueueWrites.push(queueDiscoverySource(db, { target_type: text.includes('cte') ? 'cte_page' : 'staff_directory', target_url: url, source_domain: host, school_id: item.school_id, district_id: item.district_id }));
        });
        const linkResults = await Promise.all(linkQueueWrites);
        summary.queued_new += linkResults.filter((result) => result.action === 'created').length;
        summary.queued_existing_skipped += linkResults.filter((result) => result.action !== 'created' && !(result.duplicateCount && result.duplicateCount > 1)).length;
        summary.queued_duplicate_skipped += linkResults.filter((result) => result.duplicateCount && result.duplicateCount > 1).length;

        const bodyText = $('body').text();
        const emails = emailCandidates($, bodyText);
        summary.emails_found += emails.length;
        for (const email of emails.slice(0, 30)) {
          const emailIndex = bodyText.toLowerCase().indexOf(email.toLowerCase());
          const context = emailIndex >= 0 ? bodyText.slice(Math.max(0, emailIndex - 220), emailIndex + 220) : $(`a[href^="mailto:${email}"]`).closest('tr,li,div,p').text();
          summary.contact_candidates++;
          const role = roleFromContext(context || `${title} ${item.target_type}`);
          if (!role) { summary.skipped++; continue; }
          summary.role_matches++;
          const { data: existingContact } = await db.from('contacts').select('id').eq('email', email).limit(1).maybeSingle();
          if (existingContact?.id) { summary.skipped++; continue; }
          const { error: contactError } = await db.from('contacts').insert({ email, title: role, school_id: item.school_id, district_id: item.district_id, source_url: canonicalItemUrl, source_page_title: title, date_verified: new Date().toISOString().slice(0, 10), confidence_score: confidence(role, email), extraction_notes: `Matched official page email near approved role keyword. Context checked; candidate_count=${emails.length}.`, verification_status: 'needs_review' });
          contactError ? summary.skipped++ : summary.inserted++;
        }

        await db.from('crawl_queue').update({ status: 'complete', target_url: canonicalItemUrl, updated_at: new Date().toISOString() }).eq('id', item.id);
        summary.processed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown crawl error';
        summary.errors.push(`${item.target_url}: ${message}`);
        await db.from('crawl_errors').insert({ run_id: runId, queue_id: item.id, target_url: item.target_url, error_message: message });
        await db.from('crawl_queue').update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() }).eq('id', item.id);
      }
    }

    summary.queueCounts = await getQueueCounts(db);
    summary.message = `Batch complete. Processed ${summary.processed} queued pages. Inserted ${summary.inserted} contacts from ${summary.emails_found} emails / ${summary.role_matches} role matches. Queued ${summary.queued_new} new links; skipped ${summary.queued_existing_skipped + summary.queued_duplicate_skipped} existing/duplicate links. Pending queue: ${summary.queueCounts.pending}.`;
    await finalizeRun(db, runId, 'complete', summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Batch failed';
    summary.errors.push(message);
    summary.message = message;
    await finalizeRun(db, runId, 'failed', summary);
    throw error;
  }
}

export { TERRITORY_COUNTIES };
