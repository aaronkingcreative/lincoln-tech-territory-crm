'use client';

import { useMemo, useState } from 'react';
import { ScrollableTable } from './ScrollableTable';
import SchoolActionsClient from './SchoolActionsClient';
import { formatDateOnly } from '@/lib/date-display';
import { normalizeDateOnly } from '@/lib/json-import';

type District = { name?: string | null };
type School = Record<string, unknown> & { id: string; name?: string | null; districts?: District | null };
type Row = { s: School; miss: string[]; latestNote: string | null };
type FilterOption = { label: string; value: string; options: string[]; setValue: (value: string) => void };

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function Badge({ ready }: { ready: boolean }) { return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ready ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-amber-500/40 bg-amber-500/15 text-amber-100'}`}>{ready ? 'Ready' : 'Needs Attention'}</span>; }
function visitDate(school: School): string {
  const stored = text(school.last_high_school_visit_at);
  if (stored) return stored;
  const notes = [school.outreach_notes, school.source_notes, school.verification_notes].map(text).filter(Boolean);
  const pattern = /(?:HS|High School)?\s*Last Visit\s*:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2},\s*\d{4})/i;
  for (const note of notes) { const match = pattern.exec(note); if (match) return normalizeDateOnly(match[1]) ?? ''; }
  return '';
}
function notePreview(row: Row): string {
  const generic = /data pending\s*-?\s*needs full lookup/i;
  const primary = [row.latestNote, text(row.s.outreach_notes), text(row.s.verification_notes)].find(value => value && !generic.test(value));
  if (primary) return primary;
  const source = text(row.s.source_notes);
  return source || 'No notes yet';
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }

export default function SchoolsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState(''); const [county, setCounty] = useState(''); const [district, setDistrict] = useState(''); const [schoolType, setSchoolType] = useState(''); const [territory, setTerritory] = useState(''); const [relationship, setRelationship] = useState(''); const [missing, setMissing] = useState(''); const [sort, setSort] = useState('name');
  const controls: FilterOption[] = [
    { label: 'All counties', value: county, setValue: setCounty, options: unique(rows.map(row => text(row.s.county))) },
    { label: 'All districts', value: district, setValue: setDistrict, options: unique(rows.map(row => text(row.s.districts?.name))) },
    { label: 'All school types', value: schoolType, setValue: setSchoolType, options: unique(rows.map(row => text(row.s.school_type))) },
    { label: 'All territory statuses', value: territory, setValue: setTerritory, options: unique(rows.map(row => text(row.s.territory_status))) },
    { label: 'All relationships', value: relationship, setValue: setRelationship, options: unique(rows.map(row => text(row.s.relationship_status) || 'not_started')) },
  ];
  const filtered = useMemo(() => rows.filter(row => {
    const school = row.s; const query = search.trim().toLowerCase();
    const searchable = [school.name, school.districts?.name, school.county, school.city, school.website, row.latestNote, school.outreach_notes, school.verification_notes, school.source_notes].map(text).join(' ').toLowerCase();
    return (!query || searchable.includes(query)) && (!county || text(school.county) === county) && (!district || text(school.districts?.name) === district) && (!schoolType || text(school.school_type) === schoolType) && (!territory || text(school.territory_status) === territory) && (!relationship || (text(school.relationship_status) || 'not_started') === relationship) && (!missing || row.miss.some(item => item.toLowerCase().includes(missing)));
  }).sort((a, b) => {
    if (sort === 'district') return text(a.s.districts?.name).localeCompare(text(b.s.districts?.name));
    if (sort === 'county') return text(a.s.county).localeCompare(text(b.s.county));
    if (sort === 'missing') return b.miss.length - a.miss.length;
    if (sort === 'hs_visit') return (visitDate(b.s) || '0000').localeCompare(visitDate(a.s) || '0000');
    if (sort === 'last') return text(b.s.last_contacted_at).localeCompare(text(a.s.last_contacted_at));
    if (sort === 'next') return (text(a.s.next_follow_up_at) || '9999').localeCompare(text(b.s.next_follow_up_at) || '9999');
    if (sort === 'type') return text(a.s.school_type).localeCompare(text(b.s.school_type));
    return text(a.s.name).localeCompare(text(b.s.name));
  }), [rows, search, county, district, schoolType, territory, relationship, missing, sort]);

  return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><input className="min-h-11 rounded bg-slate-950 p-2 xl:col-span-2" placeholder="Search schools, places, websites, or notes" value={search} onChange={event => setSearch(event.target.value)} />{controls.map(control => <select key={control.label} className="min-h-11 rounded bg-slate-950 p-2" value={control.value} onChange={event => control.setValue(event.target.value)}><option value="">{control.label}</option>{control.options.map(option => <option key={option}>{option}</option>)}</select>)}<select className="min-h-11 rounded bg-slate-950 p-2" value={missing} onChange={event => setMissing(event.target.value)}><option value="">All missing-data statuses</option>{['phone','website','principal','counselor','CTE/shop','bell schedule'].map(option => <option key={option} value={option.toLowerCase()}>Missing {option}</option>)}</select><select className="min-h-11 rounded bg-slate-950 p-2" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Sort: School name</option><option value="district">District</option><option value="county">County</option><option value="missing">Missing field count</option><option value="hs_visit">Sort: HS Last Visit</option><option value="last">Last contacted</option><option value="next">Next follow-up</option><option value="type">School type</option></select><span className="py-3 text-sm text-slate-400">{filtered.length} of {rows.length} schools</span></div>
    <ScrollableTable className="mt-4"><table className="w-full min-w-[1480px] table-fixed text-sm"><colgroup><col className="w-[17%]"/><col className="w-[11%]"/><col className="w-[7%]"/><col className="w-[10%]"/><col className="w-[12%]"/><col className="w-[17%]"/><col className="w-[12%]"/><col className="w-[14%]"/></colgroup><thead className="bg-slate-950/50 text-slate-300"><tr>{['School','Phone','Website','HS Last Visit','Bell Schedule','Notes','Missing Fields','Actions'].map(header => <th key={header} className="p-3 text-left font-semibold">{header}</th>)}</tr></thead><tbody>{filtered.map(row => { const { s, miss } = row; const visit = visitDate(s); const bell = text(s.bell_schedule); const bellUrl = text(s.bell_schedule_url); const location = [text(s.city), text(s.state)].filter(Boolean).join(', '); return <tr key={s.id} className="border-t border-slate-800 align-top hover:bg-slate-800/30"><td className="p-3"><div className="text-base font-semibold text-white">{text(s.name) || 'Unnamed school'}</div>{location ? <div className="mt-0.5 text-xs text-slate-400">{location}</div> : null}<div className="mt-2"><Badge ready={!miss.length}/></div></td><td className="p-3">{text(s.phone) ? <a className="inline-flex min-h-10 items-center rounded-lg bg-slate-800 px-3 font-semibold text-sky-200 hover:bg-slate-700" href={`tel:${text(s.phone).replace(/[^+\d]/g, '')}`}>{text(s.phone)}</a> : <span className="text-amber-200">Missing phone</span>}</td><td className="p-3">{text(s.website) ? <a className="inline-flex min-h-10 items-center font-semibold text-sky-300 underline underline-offset-4" href={text(s.website)} target="_blank" rel="noreferrer">Website ↗</a> : <span className="text-amber-200">Missing website</span>}</td><td className="p-3 font-semibold">{visit ? formatDateOnly(visit) : <span className="font-normal text-slate-400">No visit logged</span>}</td><td className="p-3">{bellUrl ? <a className="font-semibold text-sky-300 underline" href={bellUrl} target="_blank" rel="noreferrer">Bell schedule ↗</a> : bell ? <span className="line-clamp-2 text-slate-200">{bell.length <= 90 ? bell : 'Available in record'}</span> : <span className="text-amber-200">Missing bell schedule</span>}</td><td className="p-3"><p className="line-clamp-2 leading-5 text-slate-300" title={notePreview(row)}>{notePreview(row)}</p></td><td className="p-3"><div className="line-clamp-3 text-xs leading-5 text-amber-100">{miss.join(' · ') || <span className="text-emerald-200">None flagged</span>}</div></td><td className="p-3"><SchoolActionsClient school={s} /></td></tr>; })}</tbody></table></ScrollableTable>
  </div>;
}
