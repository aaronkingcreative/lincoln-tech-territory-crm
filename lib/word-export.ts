import { formatDateOnly } from './date-display';
import { contactsForSchool, DbRow, hasValue, schoolFlags } from './coverage';

const NOT_AVAILABLE = 'Not available';
const REVIEW_PATTERN = /needs? verification|data pending|bad url|manual review|duplicate concern|address and contact details need verification/i;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function text(value: unknown): string {
  if (!hasValue(value) || typeof value === 'object') return NOT_AVAILABLE;
  return String(value).trim();
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText === NOT_AVAILABLE ? null : valueText;
}

function display(value: unknown): string {
  return escapeHtml(text(value));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function districtName(school: DbRow): string {
  return text(record(school.districts)?.name ?? school.district_name);
}

function contactText(contact: DbRow | undefined): string {
  if (!contact) return NOT_AVAILABLE;
  const name = [contact.first_name, contact.last_name].filter(hasValue).map(String).join(' ').trim()
    || text(contact.name ?? contact.contact_name ?? contact.full_name);
  const role = [contact.title, contact.role_category].filter(hasValue).map(String).join(' / ');
  const details = [contact.email, contact.phone].filter(hasValue).map(String).join(' · ');
  return [name, role, details].filter((part) => part !== NOT_AVAILABLE && part.length > 0).join(' — ') || NOT_AVAILABLE;
}

function hasRole(contact: DbRow, pattern: RegExp): boolean {
  return pattern.test([contact.title, contact.role_category, contact.program_area].filter(hasValue).join(' '));
}

function contactsByRole(contacts: DbRow[], pattern: RegExp): string {
  const matches = contacts.filter((contact) => hasRole(contact, pattern)).map(contactText);
  return matches.length ? matches.join('\n') : NOT_AVAILABLE;
}

function joinAvailable(values: unknown[]): string {
  const available = values.filter(hasValue).filter((value) => typeof value !== 'object').map((value) => String(value).trim());
  return available.length ? available.join('\n') : NOT_AVAILABLE;
}

function field(label: string, value: string, className = ''): string {
  return `<tr${className ? ` class="${className}"` : ''}><th>${escapeHtml(label)}</th><td>${escapeHtml(value).replaceAll('\n', '<br>')}</td></tr>`;
}

function optionalField(label: string, value: string | null, className = ''): string {
  return value ? field(label, value, className) : '';
}

function shorten(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const boundary = value.lastIndexOf(' ', maximum - 1);
  return `${value.slice(0, boundary > maximum / 2 ? boundary : maximum - 1).trim()}… (full details in appendix)`;
}

function addressFor(school: DbRow): string {
  const address = optionalText(school.address);
  if (address) return address;
  const location = [school.city, school.state].filter(hasValue).map(String).join(', ');
  return location ? `Location: ${location}` : NOT_AVAILABLE;
}

type SchoolStatuses = {
  outreach: 'Ready for outreach' | 'Needs data';
  quality: 'Source verified' | 'Needs verification' | 'Imported, review recommended';
  needsVerification: boolean;
};

function statusesFor(school: DbRow, contacts: DbRow[]): SchoolStatuses {
  const flags = schoolFlags(school, contacts);
  const reviewNotes = [school.source_notes, school.verification_notes, school.program_notes].filter(hasValue).map(String).join(' ');
  const needsVerification = flags.needs_verification
    || school.verification_status === 'broken_source'
    || school.verification_status === 'needs_review'
    || REVIEW_PATTERN.test(reviewNotes);
  const imported = hasValue(school.ai_created_at) || hasValue(school.last_ai_update_at) || hasValue(school.imported_from_ai);
  return {
    outreach: flags.ready ? 'Ready for outreach' : 'Needs data',
    quality: needsVerification ? 'Needs verification' : imported ? 'Imported, review recommended' : 'Source verified',
    needsVerification,
  };
}

function sourceDetails(school: DbRow, statuses: SchoolStatuses): { status: string; label: string | null } {
  const source = optionalText(school.source_url);
  const imported = hasValue(school.ai_created_at) || hasValue(school.last_ai_update_at) || hasValue(school.imported_from_ai);
  let status = 'CRM only';
  if (statuses.needsVerification) status = 'Needs source verification';
  else if (imported) status = 'Imported from AI, needs review';
  else if (source) status = 'Verified source available';

  if (!source) return { status, label: null };
  if (/nces\.ed\.gov/i.test(source)) return { status, label: 'NCES' };
  if (/^https?:\/\//i.test(source)) return { status, label: 'Official school/district site' };
  return { status, label: source.length <= 45 ? source : 'CRM source record' };
}

function schoolPage(school: DbRow, contacts: DbRow[]): string {
  const linkedContacts = contactsForSchool(contacts, typeof school.id === 'string' ? school.id : '');
  const principal = contactsByRole(linkedContacts, /principal/i);
  const counselor = contactsByRole(linkedContacts, /counsel|college|career/i);
  const cte = contactsByRole(linkedContacts, /cte|technical|trade|shop|workforce|welding|automotive|construction|manufactur/i);
  const missingContacts = [principal === NOT_AVAILABLE ? 'Principal' : null, counselor === NOT_AVAILABLE ? 'Counselor' : null, cte === NOT_AVAILABLE ? 'CTE contact' : null].filter((item): item is string => item !== null);
  const programs = joinAvailable([school.special_programs, school.cte_programs, school.shop_programs, school.trades_programs, school.career_programs, school.program_notes, school.school_profile_notes]);
  const recruitingNotes = joinAvailable([school.outreach_notes, school.recruiting_notes, school.best_time_to_visit_seniors]);
  const nextAction = optionalText(school.next_action ?? school.recruiting_next_action ?? school.outreach_next_action) ?? (schoolFlags(school, contacts).ready ? 'Plan recruiter outreach.' : 'Complete missing outreach information.');
  const statuses = statusesFor(school, contacts);
  const source = sourceDetails(school, statuses);

  return `<section class="school-page">
    <div class="group-path">${display(school.county)} County${optionalText(school.state) ? `, ${display(school.state)}` : ''} &nbsp;|&nbsp; ${escapeHtml(districtName(school))}</div>
    <h1>${display(school.name)}</h1>
    <div class="badges"><span class="badge outreach">Outreach: ${statuses.outreach}</span><span class="badge quality">Data quality: ${statuses.quality}</span></div>
    <table class="key-info"><tr><th>Address</th><td>${escapeHtml(addressFor(school))}</td><th>Main Phone</th><td>${display(school.phone)}</td></tr><tr><th>Website</th><td>${display(school.website)}</td><th>Enrollment</th><td>${display(school.student_population_total ?? school.enrollment)}</td></tr><tr><th>HS Last Visit</th><td>${escapeHtml(formatDateOnly(school.last_high_school_visit_at, NOT_AVAILABLE))}</td><th>Bell Schedule</th><td>${display(school.bell_schedule ?? school.bell_schedule_url)}</td></tr></table>
    <h2>Contacts</h2>
    <table class="details">
      ${field('Principal', principal)}
      ${field('Counseling Department', counselor)}
      ${field('CTE Director / Coordinator', cte)}
      ${field('Missing contacts', missingContacts.length ? missingContacts.join(', ') : 'None flagged', 'missing')}
    </table>
    <h2>Recruiting Plan</h2>
    <table class="details">
      ${field('CTE / Recruiting Fit', programs === NOT_AVAILABLE ? NOT_AVAILABLE : shorten(programs, 420))}
      ${field('Next Action', shorten(nextAction, 220))}
      ${recruitingNotes === NOT_AVAILABLE ? '' : field('Recruiting Notes', shorten(recruitingNotes, 300))}
    </table>
    <div class="printed-notes"><strong>Printed Notes</strong><div class="note-lines">&nbsp;</div></div>
    <div class="source-footer"><strong>Source status:</strong> ${escapeHtml(source.status)}${source.label ? ` &nbsp;|&nbsp; <strong>Source:</strong> ${escapeHtml(source.label)}` : ''}</div>
  </section>`;
}

function sortSchools(schools: DbRow[]): DbRow[] {
  const key = (school: DbRow) => [text(school.state), text(school.county), districtName(school), text(school.name)].join('\u0000');
  return [...schools].sort((a, b) => key(a).localeCompare(key(b)));
}

function directoryRows(schools: DbRow[], contacts: DbRow[]): string {
  const groups = new Map<string, DbRow[]>();
  schools.forEach((school) => {
    const key = `${text(school.state)}\u0000${text(school.county)}`;
    groups.set(key, [...(groups.get(key) ?? []), school]);
  });
  return [...groups.entries()].map(([key, countySchools]) => {
    const [state, county] = key.split('\u0000');
    const statuses = countySchools.map((school) => statusesFor(school, contacts));
    return `<tr><td>${escapeHtml(county)} County, ${escapeHtml(state)}</td><td>${countySchools.length}</td><td>${statuses.filter((item) => item.outreach === 'Ready for outreach').length}</td><td>${statuses.filter((item) => item.outreach === 'Needs data').length}</td><td>${statuses.filter((item) => item.needsVerification).length}</td></tr>`;
  }).join('');
}

function appendixEntry(school: DbRow): string {
  const requestedFields: Array<[string, unknown]> = [
    ['Source URL', school.source_url],
    ['Enrollment Source URL', school.enrollment_source_url],
    ['Source Notes', school.source_notes],
    ['Verification Notes', joinAvailable([school.verification_notes, school.enrollment_notes])],
    ['Full CTE / Program Detail', joinAvailable([school.special_programs, school.cte_programs, school.shop_programs, school.trades_programs, school.career_programs, school.program_notes, school.school_profile_notes])],
    ['Full Bell Schedule', joinAvailable([school.bell_schedule, school.bell_schedule_url])],
    ['Full Recruiting Notes', joinAvailable([school.outreach_notes, school.recruiting_notes, school.best_time_to_visit_seniors])],
  ];
  const rows = requestedFields.map(([label, value]) => optionalField(label, optionalText(value), 'appendix-row')).join('');
  return `<div class="appendix-entry"><h2>${display(school.name)}</h2><div class="appendix-path">${display(school.county)} County &nbsp;|&nbsp; ${escapeHtml(districtName(school))}</div>${rows ? `<table>${rows}</table>` : '<p>No supplemental source or overflow details in CRM.</p>'}</div>`;
}

export function buildWordFieldGuide(schools: DbRow[], contacts: DbRow[], generatedAt = new Date()): string {
  const sortedSchools = sortSchools(schools);
  const statuses = sortedSchools.map((school) => statusesFor(school, contacts));
  const generatedDate = generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">
<head><meta charset="utf-8"><title>Lincoln Tech Recruiting Field Guide</title>
<style>
  @page { size: letter portrait; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.18; }
  .cover { height: 9.8in; text-align: center; page-break-after: always; }
  .cover .brand { padding-top: 1.65in; color: #9d2235; font-size: 32pt; font-weight: 800; letter-spacing: 2px; }
  .cover h1 { margin: .55in auto .3in; max-width: 6.6in; font-size: 24pt; }
  .cover p { margin: 8pt 0; font-size: 12pt; }
  .directory { page-break-after: always; }
  h1 { color: #651323; }
  .directory h1 { margin: 0 0 6pt; border-bottom: 2px solid #9d2235; padding-bottom: 6pt; }
  .directory .summary-line { margin-bottom: 12pt; color: #444; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #aaa; padding: 4pt 5pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-wrap: break-word; }
  th { background: #e8e8e8; font-weight: bold; }
  .directory th, .directory td { text-align: center; }
  .directory th:first-child, .directory td:first-child { width: 44%; text-align: left; }
  .school-page { height: 9.8in; page-break-before: always; page-break-after: always; overflow: hidden; position: relative; }
  .group-path { color: #555; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: .35pt; }
  .school-page h1 { margin: 5pt 0 4pt; border-bottom: 2px solid #9d2235; padding-bottom: 4pt; font-size: 19pt; line-height: 1.05; }
  .badges { margin: 5pt 0 7pt; }
  .badge { display: inline-block; margin-right: 5pt; border: 1px solid #777; border-radius: 8pt; padding: 2pt 6pt; font-size: 8.5pt; font-weight: bold; }
  .badge.outreach { background: #f1f1f1; }
  .badge.quality { border-color: #9d2235; color: #651323; }
  .key-info th { width: 14%; }
  .key-info td { width: 36%; }
  .school-page h2 { margin: 7pt 0 3pt; color: #651323; font-size: 11pt; text-transform: uppercase; letter-spacing: .3pt; }
  .details th { width: 27%; }
  .details .missing td { color: #555; font-style: italic; }
  .printed-notes { margin-top: 7pt; }
  .note-lines { height: .62in; margin-top: 3pt; border: 1px solid #aaa; background: repeating-linear-gradient(#fff, #fff 16pt, #ddd 17pt); }
  .source-footer { position: absolute; right: 0; bottom: 0; left: 0; border-top: 1px solid #aaa; padding-top: 4pt; color: #555; font-size: 8pt; }
  .appendix { page-break-before: always; }
  .appendix > h1 { border-bottom: 2px solid #9d2235; padding-bottom: 5pt; }
  .appendix-entry { margin-bottom: 14pt; page-break-inside: avoid; }
  .appendix-entry h2 { margin: 0 0 2pt; color: #651323; font-size: 12pt; }
  .appendix-path { margin-bottom: 4pt; color: #666; font-size: 8pt; }
  .appendix-entry th { width: 25%; }
  .appendix-row td { overflow-wrap: anywhere; word-wrap: break-word; }
</style></head><body>
<section class="cover"><div class="brand">LINCOLN TECH</div><h1>High School Recruiting Field Guide</h1><p>Prepared for Ken King, Admissions Representative</p><p>Lincoln Technical Institute - Denver Campus</p><p>Generated from current CRM data</p><p><strong>${escapeHtml(generatedDate)}</strong></p></section>
<section class="directory"><h1>Priority School Directory</h1><div class="summary-line"><strong>${sortedSchools.length}</strong> schools &nbsp;|&nbsp; <strong>${statuses.filter((item) => item.outreach === 'Ready for outreach').length}</strong> ready for outreach &nbsp;|&nbsp; <strong>${statuses.filter((item) => item.outreach === 'Needs data').length}</strong> need data &nbsp;|&nbsp; <strong>${statuses.filter((item) => item.needsVerification).length}</strong> need verification</div><table><thead><tr><th>County</th><th>Schools</th><th>Ready</th><th>Needs Data</th><th>Needs Verification</th></tr></thead><tbody>${directoryRows(sortedSchools, contacts)}</tbody></table></section>
${sortedSchools.map((school) => schoolPage(school, contacts)).join('\n')}
<section class="appendix"><h1>Source Appendix</h1><p>Source, verification, schedule, and full overflow details retained from the CRM.</p>${sortedSchools.map(appendixEntry).join('\n')}</section>
</body></html>`;
}
