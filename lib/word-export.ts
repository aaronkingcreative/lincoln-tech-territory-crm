import { contactsForSchool, DbRow, hasValue, schoolFlags } from './coverage';

const NOT_AVAILABLE = 'Not available';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value: unknown): string {
  if (!hasValue(value) || typeof value === 'object') return NOT_AVAILABLE;
  return String(value).trim();
}

function display(value: unknown): string {
  return escapeHtml(text(value));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function districtName(school: DbRow): string {
  return text(record(school.districts)?.name);
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

function lines(values: unknown[]): string {
  const available = values.filter(hasValue).filter((value) => typeof value !== 'object').map((value) => String(value).trim());
  return available.length ? available.join('\n') : NOT_AVAILABLE;
}

function gradeEnrollment(value: unknown): string {
  const grades = record(value);
  if (!grades) return NOT_AVAILABLE;
  const entries = Object.entries(grades).filter(([, count]) => hasValue(count) && typeof count !== 'object');
  if (!entries.length) return NOT_AVAILABLE;
  return entries
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([grade, count]) => `${grade}: ${String(count).trim()}`)
    .join('\n');
}

function field(label: string, value: string): string {
  const rendered = value === NOT_AVAILABLE ? NOT_AVAILABLE : value;
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(rendered).replaceAll('\n', '<br>')}</td></tr>`;
}

function statusFor(school: DbRow, contacts: DbRow[]): string {
  const flags = schoolFlags(school, contacts);
  if (flags.needs_verification) return 'Needs verification';
  if (school.verification_status === 'broken_source' || school.verification_status === 'needs_review') return 'Update needed';
  if (flags.ready) return 'Ready for outreach';
  return 'Needs data';
}

function schoolPage(school: DbRow, contacts: DbRow[]): string {
  const linkedContacts = contactsForSchool(contacts, typeof school.id === 'string' ? school.id : '');
  const principal = contactsByRole(linkedContacts, /principal/i);
  const counselor = contactsByRole(linkedContacts, /counsel|college|career/i);
  const cte = contactsByRole(linkedContacts, /cte|technical|trade|shop|workforce|welding|automotive|construction|manufactur/i);
  const address = lines([school.address, [school.city, school.state, school.zip].filter(hasValue).join(', ')]);
  const programs = lines([school.special_programs, school.cte_programs, school.shop_programs, school.trades_programs, school.career_programs, school.program_notes, school.school_profile_notes]);
  const verificationNotes = lines([school.verification_notes, school.enrollment_notes]);
  const recruitingNotes = lines([school.outreach_notes, school.recruiting_notes, school.best_time_to_visit_seniors]);

  return `<section class="school-page">
    <div class="group-path">${display(school.state)} &rsaquo; ${display(school.county)} &rsaquo; ${escapeHtml(districtName(school))}</div>
    <h1>${display(school.name)}</h1>
    <div class="status">${escapeHtml(statusFor(school, contacts))}</div>
    <table>
      ${field('District', districtName(school))}
      ${field('County', text(school.county))}
      ${field('State', text(school.state))}
      ${field('Outreach Status', statusFor(school, contacts))}
      ${field('Address', address)}
      ${field('Main Phone', text(school.phone))}
      ${field('Website', text(school.website))}
      ${field('Principal Contact', principal)}
      ${field('Counseling Department', counselor)}
      ${field('CTE Director / Coordinator', cte)}
      ${field('CTE / Shop / Program Info', programs)}
      ${field('Bell Schedule', lines([school.bell_schedule, school.bell_schedule_url]))}
      ${field('Enrollment', text(school.student_population_total ?? school.enrollment))}
      ${field('Grade Enrollment', gradeEnrollment(school.grade_enrollment))}
      ${field('Source URL', text(school.source_url))}
      ${field('Source Notes', text(school.source_notes))}
      ${field('Verification Notes', verificationNotes)}
      ${field('Recruiting Notes', recruitingNotes)}
    </table>
    <div class="printed-notes"><strong>Printed Notes</strong></div>
  </section>`;
}

function sortSchools(schools: DbRow[]): DbRow[] {
  const key = (school: DbRow) => [text(school.state), text(school.county), districtName(school), text(school.name)].join('\u0000');
  return [...schools].sort((a, b) => key(a).localeCompare(key(b)));
}

export function buildWordFieldGuide(schools: DbRow[], contacts: DbRow[], generatedAt = new Date()): string {
  const flags = schools.map((school) => schoolFlags(school, contacts));
  const countMissing = (key: 'phone' | 'website' | 'address' | 'principal' | 'counselor' | 'cte' | 'bell_schedule' | 'student_population') => flags.filter((item) => !item[key]).length;
  const summary: Array<[string, number]> = [
    ['Total schools', schools.length],
    ['Ready for outreach', flags.filter((item) => item.ready).length],
    ['Schools missing phone', countMissing('phone')],
    ['Schools missing website', countMissing('website')],
    ['Schools missing address', countMissing('address')],
    ['Schools missing principal', countMissing('principal')],
    ['Schools missing counselor', countMissing('counselor')],
    ['Schools missing CTE/shop/program info', countMissing('cte')],
    ['Schools missing bell schedule', countMissing('bell_schedule')],
    ['Schools missing student population', countMissing('student_population')],
    ['Schools needing verification', flags.filter((item) => item.needs_verification).length],
  ];
  const generatedDate = generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const pages = sortSchools(schools).map((school) => schoolPage(school, contacts)).join('\n');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">
<head><meta charset="utf-8"><title>Lincoln Tech Recruiting Field Guide</title>
<style>
  @page { size: letter; margin: 0.65in; }
  body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; }
  .cover { min-height: 8.4in; text-align: center; page-break-after: always; }
  .cover .brand { padding-top: 1.7in; font-size: 34pt; font-weight: 800; letter-spacing: 2px; }
  .cover h1 { margin: 0.55in auto 0.35in; max-width: 6.5in; font-size: 25pt; }
  .cover p { margin: 9pt 0; font-size: 13pt; }
  .summary { page-break-after: always; }
  .summary h1, .school-page h1 { border-bottom: 3px solid #000; padding-bottom: 7pt; }
  .summary table { width: 75%; margin-top: 18pt; }
  .school-page { page-break-before: always; min-height: 8.35in; }
  .school-page:first-of-type { page-break-before: auto; }
  .group-path { color: #444; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5pt; }
  .school-page h1 { margin: 8pt 0 5pt; font-size: 22pt; }
  .status { display: inline-block; margin-bottom: 10pt; border: 2px solid #000; padding: 4pt 8pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #777; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { width: 28%; background: #eee; font-weight: bold; }
  .printed-notes { height: 0.8in; margin-top: 12pt; border-bottom: 1px solid #999; }
</style></head><body>
<section class="cover">
  <div class="brand">LINCOLN TECH</div>
  <h1>Southern Idaho High School Recruiting Field Guide</h1>
  <p>Prepared for Ken King, Admissions Representative</p>
  <p>Lincoln Technical Institute - Denver Campus</p>
  <p>Generated from CRM data</p>
  <p><strong>${escapeHtml(generatedDate)}</strong></p>
</section>
<section class="summary"><h1>Field Guide Summary</h1><table>${summary.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`).join('')}</table></section>
${pages}
</body></html>`;
}
