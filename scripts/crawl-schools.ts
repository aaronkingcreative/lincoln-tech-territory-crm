import * as cheerio from 'cheerio';
import { db } from './shared';
const { data: schools } = await db().from('schools').select('id,website,source_url').not('source_url','is',null);
for (const s of schools ?? []) { const url = s.website || s.source_url; try { const res = await fetch(url); const html = await res.text(); const $ = cheerio.load(html); await db().from('source_urls').upsert({ school_id: s.id, url, page_title: $('title').text(), http_status: res.status, last_crawled_at: new Date().toISOString(), is_official: true }, { onConflict: 'url' }); } catch (e) { console.error(url, e); } }
