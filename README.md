# Lincoln Tech Territory CRM

Private Next.js/Supabase CRM for Ken King's Lincoln Tech recruiting territory. The stable production domain is:

```text
https://lincoln-tech-territory-crm.vercel.app
```

## Access

- Supabase Auth protected application with admin allow-list only: `kenking@northrim.net`, `aking81@gmail.com` by default.
- Configure additional admins with the `ADMIN_EMAILS` environment variable as a comma-separated list.
- Discovery and import API routes require a current Supabase session cookie or a Bearer token whose user email is in `ADMIN_EMAILS`.
- The Supabase service role key is used only in server-side code.

## Territory

Discovery targets Ontario High School / Ontario School District in Ontario, Oregon plus southern Idaho schools from Ontario east to Saint Anthony, then south through Idaho to the Utah border. The focus is the I-84, I-86, and I-15 corridor.

Approved Idaho counties are Ada, Owyhee, Canyon, Payette, Washington, Gem, Elmore, Gooding, Jerome, Twin Falls, Cassia, Minidoka, Lincoln, Power, Bannock, Bingham, Bonneville, Jefferson, Madison, Fremont, Teton, and Clark. Utah schools are excluded. Other Oregon schools are excluded unless manually added. Ada County is included because Boise is in Ken King's approved Lincoln Tech recruiting boundary; Ada seed rows cover public high schools, charter/alternative high schools, private high schools, and career/technical programs where represented in official/authoritative public data. Owyhee County is included with high-school-level public targets only: Marsing High School, Homedale High School, and Rimrock Jr/Sr High School; Pleasant Valley Elementary District and Three Creek Joint Elementary District are district context only, not recruiting schools. Owyhee High School in Meridian remains an Ada County / West Ada School District row and must not be treated as an Owyhee County school. Online/virtual schools are intentionally excluded from the active baseline at this time.

### Territory review

Admins can review possible future boundary additions at:

```text
/admin/territory-review
```

The review list currently tracks Oneida, Franklin, Bear Lake, Caribou, Blaine, Camas, and Butte as excluded/review-only candidate counties. They are not imported by discovery or the seed importer unless explicitly approved and added to the active territory baseline.

## Discovery system

The primary workflow is the admin page:

```text
/admin/discover
```

It provides buttons to:

1. Discover schools and districts.
2. Discover school websites.
3. Discover contacts.
4. Run the next crawl batch.
5. View crawl results/errors.

The page displays current school, district, and contact counts; the last discovery run; crawl queue status; inserted/updated/skipped rows; and recent errors.

### Sources used

Discovery queues official or authoritative public sources first:

- Idaho Department of Education public school pages.
- Idaho Report Card / Idaho schools public pages.
- NCES Common Core of Data school search.
- Official district websites.
- Official school websites.
- Ontario School District official website.

The crawler only imports contacts from official school or district pages. It does not import random third-party directory data and does not invent missing fields.

### Batch crawling

Vercel functions should not run one large crawl, so discovery is split across small API calls:

```http
POST /api/admin/discover/start-schools
POST /api/admin/discover/start-websites
POST /api/admin/discover/start-contacts
POST /api/admin/discover/run-batch
GET  /api/admin/discover/status
```

`start-*` routes seed `crawl_queue` records. `run-batch` processes a limited number of pending queue items per request, records `source_urls`, creates `crawl_results`, writes `crawl_errors`, and adds more official staff/contact/CTE pages when it finds relevant same-domain links. The admin can repeatedly click **Run next crawl batch** until the queue is complete.

### Contact discovery rules

The contact parser looks for official-page evidence of these role areas: principals, assistant principals, counselors, head counselors, college and career advisors, career center coordinators, CTE directors/coordinators, and instructors for automotive, welding, construction, diesel, manufacturing, engineering, robotics, machining, woodworking, industrial technology, shop, and trades.

For each candidate it stores name when found, title, email, phone/extension when found, school/district IDs when known, program area, source URL, source page title, date verified, confidence score, and extraction notes. High confidence means official page + clear title + email. Medium means official page + clear title without email. Low means official page + possible but unclear role. If a contact type is not found, it remains `not_found_yet`; `does_not_exist` is not used unless a source explicitly confirms the program does not exist.

## Database tables

Apply `supabase/schema.sql` to create/update the data model. The schema is written to be safely re-runnable in the Supabase SQL Editor: enum creation ignores duplicate objects, tables use `create table if not exists`, and columns use `alter table ... add column if not exists`. Discovery uses:

- `discovery_runs`
- `crawl_queue`
- `crawl_results`
- `crawl_errors`
- `source_urls`
- `verification_status`

The queue stores `target_type`, `target_url`, `source_domain`, optional `school_id`/`district_id`, `status`, `attempts`, `last_error`, `created_at`, and `updated_at`.

## Manual seed importer fallback

The CSV importer remains as a secondary fallback. The authoritative seed file is:

```bash
data/territory-schools.csv
```

The production route includes the CSV in the Vercel serverless bundle through `next.config.mjs` output file tracing, avoiding the prior `ENOENT` error. Approved admins can run it from:

```text
/admin/import-schools
```

or by calling:

```http
POST /api/admin/import-schools
```

The importer returns before/after dashboard counts plus inserted, updated, skipped, missing-required-data, source URL, and schema-error details. It upserts districts, schools, school_type, territory_status, and source URLs only. It never touches contacts, programs, call logs, school notes, or recruiting notes, and it preserves manually edited values by only replacing fields when the seed has a verified nonblank value.

## Local workflow

```bash
npm install
psql "$DATABASE_URL" -f supabase/schema.sql
npm run seed:schools
npm run build
```

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAILS=kenking@northrim.net,aking81@gmail.com
```

## Refreshing data later

1. Prefer the `/admin/discover` workflow and official/authoritative sources.
2. Run school discovery, website discovery, contact discovery, then small crawl batches.
3. Review low-confidence contacts and missing contact queues before outreach.
4. Use the CSV importer only as a fallback for known seed rows.
5. Leave unknown values blank. Never hallucinate contacts, schools, teacher names, phone numbers, or emails.
6. Confirm the dashboard counts, Schools table, Districts table, Contacts table, Map markers for rows with coordinates, and XLSX export after each refresh.

## Build safety

Before any PR is considered ready, run:

```bash
npm ci
npm run build
```

Do not rely on Vercel as the first successful build check.

If build cannot run, the task is not ready.

AI Assisted Update importer changes must be type-safe and must not use `as any`, non-null assertions, or disabled TypeScript checks to hide real nullable state.
