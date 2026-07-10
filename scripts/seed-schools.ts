import { readFileSync } from 'node:fs';
import { db } from './shared';
const lines = readFileSync('data/initial-schools.csv','utf8').trim().split('\n');
const headers = lines.shift()!.split(',');
for (const line of lines) { const row = Object.fromEntries(line.split(',').map((v,i)=>[headers[i],v])); const { data: district } = await db().from('districts').upsert({ name: row.district, county: row.county, state: row.state, source_url: row.source_url }, { onConflict: 'name' }).select('id').single(); await db().from('schools').upsert({ name: row.name, district_id: district?.id, county: row.county, state: row.state, source_url: row.source_url, verification_status: row.verification_status }, { onConflict: 'name' }); }
console.log('Seeded official starter territory records. Add NCES/Idaho Report Card exports to this importer as CSV for bulk loading.');
