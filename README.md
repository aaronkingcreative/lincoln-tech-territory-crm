# Lincoln Tech Territory CRM

Private Next.js/Supabase CRM for Ken King's Lincoln Tech recruiting territory: Ontario, Oregon plus the Southern Idaho I-84, I-86, and I-15 corridor through Saint Anthony and south to the Utah border. Utah schools are intentionally excluded.

## Access

- Supabase Auth protected application with admin allow-list only: `kenking@northrim.net`, `aking81@gmail.com` by default.
- Configure additional admins with the `ADMIN_EMAILS` environment variable as a comma-separated list.

## Territory seed data

The authoritative seed file is:

```bash
data/territory-schools.csv
```

It replaces the starter `data/initial-schools.csv` workflow. The CSV includes public high schools, charter high schools, technical schools, CTE/career programs where known, and relevant alternative high schools in the requested territory counties, plus Ontario High School in Ontario, Oregon. Utah schools are intentionally excluded, and other Oregon schools should only be added manually when explicitly approved.

Seed rows include the fields that can be verified or queued for verification without hallucination:

- school and district name
- county and state
- grades served and school type where known
- address/city/zip/phone/website/coordinates/NCES ID when available
- at least one source URL
- import and verification dates
- verification status

Most rows currently use NCES Common Core of Data school-search URLs as the authoritative public source queued for review. Ontario High School uses the official Ontario High School site. Blank fields mean the value has not been verified yet and should not be guessed.

## Local seed/import workflow

1. Install dependencies:

```bash
npm install
```

2. Configure Supabase service credentials in `.env.local` or the shell:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAILS=kenking@northrim.net,aking81@gmail.com
```

3. Ensure the database schema has been applied. The `schools` table includes `city` and `zip` columns used by the territory seed file:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
```

4. Run the school importer:

```bash
npm run seed:schools
```

The importer reads `data/territory-schools.csv`, matches existing districts by name/state, matches existing schools by name/state/county, inserts missing records, updates seed-managed school/district fields, avoids duplicate schools, writes `source_urls`, and leaves relationship data such as contacts, programs, and recruiting notes untouched.

## Production import workflow

The app exposes a protected admin-only endpoint:

```http
POST /api/admin/import-schools
```

Approved admins can run it from the deployed UI at:

```text
/admin/import-schools
```

The request must include a valid Supabase session cookie or Bearer token for an email in `ADMIN_EMAILS`. The endpoint returns a JSON summary with inserted, updated, skipped, missing-required-data, and source URL counts.

For the stable production app, sign in at `https://lincoln-tech-territory-crm.vercel.app`, open `/admin/import-schools`, and click **Run school import**. Vercel must have these environment variables configured: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAILS`.

## Refreshing seed data later

1. Use official or authoritative sources first: NCES Common Core of Data, Idaho Department of Education / Idaho Report Card, official district websites, official school websites, and Ontario School District/Ontario High School pages.
2. Edit `data/territory-schools.csv` only with values supported by a source URL.
3. Leave unknown values blank. Do not invent contacts, teachers, phone numbers, addresses, or coordinates.
4. Keep `source_url` and `date_verified` populated for every school row.
5. Re-run `npm run seed:schools` locally or use the protected production import page.
6. Confirm the dashboard count, Schools table, Districts table, Map markers for rows with coordinates, and XLSX export.

## Data integrity rules

- Do not create fake contacts.
- Do not claim a shop teacher, counselor, or CTE contact exists unless found on an official source.
- Missing contacts should be tracked as `not_found_yet` rather than fabricated.
- Imported contacts must include an official `source_url` and `date_verified`.
- Every seeded school must include a source URL and verification date.
