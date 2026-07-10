import * as cheerio from 'cheerio';
import { CONTACT_KEYWORDS, db } from './shared';
const { data: sources } = await db().from('source_urls').select('school_id,district_id,url').eq('is_official', true);
for (const src of sources ?? []) { try { const res = await fetch(src.url); const $ = cheerio.load(await res.text()); const text = $('body').text().toLowerCase(); if (!CONTACT_KEYWORDS.some(k=>text.includes(k))) continue; console.log(`Review candidate ${src.url}; crawler will not hallucinate contacts without clear structured name/title/email evidence.`); } catch (e) { console.error(e); } }
