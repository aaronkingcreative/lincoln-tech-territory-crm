# Lincoln Tech Idaho Territory Recruiting Manager

Private Next.js/Supabase CRM for Ken King's Lincoln Tech recruiting territory: Ontario, Oregon plus the Southern Idaho I-84, I-86, and I-15 corridor through Saint Anthony and south to the Utah border. Utah schools are intentionally excluded.

## Features

- Supabase Auth protected application with admin allow-list only: `kenking@northrim.net`, `aking81@gmail.com`.
- Supabase schema for districts, schools, contacts, programs, source URLs, crawl runs, verification status, and recruiting notes.
- Dashboard totals and review queues for missing contacts, stale sources, broken websites, and low confidence matches.
- School, district, and contact tables.
- Leaflet school map with school popups.
- XLSX export endpoint and script.
- Starter data acquisition scripts using official source URLs only.
- Cheerio crawler scaffolding that logs candidates and refuses to invent contact records.

## Setup

1. Copy environment variables:

```bash
cp .env.example .env.local
```

2. Fill in Supabase values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAILS=kenking@northrim.net,aking81@gmail.com
```

3. Create the database objects in Supabase SQL editor using `supabase/schema.sql`.

4. Install and run locally:

```bash
npm install
npm run dev
```

## Data integrity rules

- Never hallucinate contacts.
- Leave unknown fields blank.
- Mark unfound shop/CTE roles as `not_found_yet`, not `does_not_exist`.
- Do not overwrite user-entered recruiting notes during refreshes.
- Imported contacts must include an official `source_url` and `date_verified`.
- Do not use unofficial sources unless a human manually approves them.

## Territory rules

- Include Ontario High School / Ontario School District in Malheur County, Oregon.
- Do not include other Oregon schools unless manually added later.
- Do not include Utah schools.
- Initial Idaho counties: Canyon, Payette, Washington, Gem, Elmore, Gooding, Jerome, Twin Falls, Cassia, Minidoka, Lincoln, Power, Bannock, Bingham, Bonneville, Jefferson, Madison, Fremont, Teton, and Clark.

## Scripts

```bash
npm run seed:schools
npm run crawl:schools
npm run crawl:contacts
npm run export:xlsx
```

`seed:schools` currently seeds a verified starter CSV and is structured for NCES / Idaho Report Card CSV expansion. `crawl:schools` stores official source metadata. `crawl:contacts` searches official pages for target role keywords and queues review candidates without creating hallucinated contacts.

## Future phases

1. Expand importer with NCES Common Core of Data and Idaho Department of Education / Idaho Report Card exports.
2. Deepen crawler discovery for staff directory, counseling, CTE, pathway, and course catalog pages.
3. Add explicit review queue pages and contact approval workflow.
4. Add route-planning exports and refresh scheduling.
