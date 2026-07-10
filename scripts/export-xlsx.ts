import { writeFileSync, mkdirSync } from 'node:fs';
import { utils, write } from 'xlsx';
import { db } from './shared';
mkdirSync('exports',{recursive:true}); const wb=utils.book_new();
for (const t of ['districts','schools','contacts','programs','recruiting_notes']) { const {data}=await db().from(t).select('*'); utils.book_append_sheet(wb, utils.json_to_sheet(data ?? []), t); }
writeFileSync('exports/lincoln-tech-territory.xlsx', write(wb,{type:'buffer',bookType:'xlsx'}));
