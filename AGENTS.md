Lincoln Tech Territory CRM - Codex Instructions

Mandatory build gate:
Before creating a PR, marking a task complete, or saying work is ready, run:

npm ci
npm run build

If npm ci fails, fix the install/dependency problem before continuing.

If npm run build fails, fix all TypeScript/build errors before continuing.

If the Codex environment cannot run npm ci or npm run build, do not claim the build passed. Stop and report the exact blocker instead of creating or marking the PR ready.

Do not hand back a PR with a known failed or unverified build.

TypeScript rules:
Do not use:
- as any
- non-null assertions like school!
- disabled TypeScript checks
- broad type weakening to hide real state problems

Use:
- discriminated unions for importer state
- explicit result types
- typed helper arrays
- keyof when indexing typed objects
- null checks when values can be null

If TypeScript says a value may be null, fix the control flow or the type model. Do not silence the error.

AI Assisted Update importer rules:
The importer is safety-critical because it writes to production Supabase data.

When modifying importer logic:
- keep preview and apply behavior consistent
- keep partial import behavior working
- do not let one bad item block valid items unless the whole payload is structurally invalid
- keep duplicate protection
- do not create schools automatically from typos
- only create missing schools when school_create or create_if_missing: true is used
- contact creation must work without email when a name/title/school/source exists
- confidence_score must be text: high, medium, or low
- never write numeric confidence_score values like 0.45

School matching rules:
Common school name variants should match when context supports it.

Examples:
- Skyline High School
- Skyline Senior High School
- Skyline HS
- Skyline Senior HS
- Skyline Sr High School

These can be the same school when city, district, county, state, website, source domain, address, or NCES ID supports the match.

Do not weaken duplicate protection. If a match is ambiguous, block and ask for school_id.

Supabase schema rules:
Do not assume new columns/tables already exist in production.

When adding new database-backed fields:
- include safe additive SQL
- use create table if not exists
- use alter table ... add column if not exists
- do not include destructive migrations unless explicitly requested

UI rules:
Keep AI Assisted Update usable for non-technical users:
- JSON textarea empty by default
- clear commit result at top of page
- plain-English errors
- technical details hidden behind a toggle
- preview before commit
- visible partial success results
