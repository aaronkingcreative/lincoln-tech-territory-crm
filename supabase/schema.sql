DO $$
BEGIN
  CREATE TYPE verification_status AS ENUM ('not_found_yet','unverified','verified','needs_review','broken_source');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

create table if not exists districts (id uuid primary key default gen_random_uuid());
alter table districts add column if not exists name text;
alter table districts add column if not exists county text;
alter table districts add column if not exists state text;
alter table districts add column if not exists superintendent text;
alter table districts add column if not exists office_address text;
alter table districts add column if not exists phone text;
alter table districts add column if not exists website text;
alter table districts add column if not exists cte_director text;
alter table districts add column if not exists source_url text;
alter table districts add column if not exists date_verified date;
alter table districts add column if not exists created_at timestamptz default now();
alter table districts add column if not exists updated_at timestamptz default now();

create table if not exists schools (id uuid primary key default gen_random_uuid());
alter table schools add column if not exists name text;
alter table schools add column if not exists district_id uuid references districts(id);
alter table schools add column if not exists county text;
alter table schools add column if not exists state text;
alter table schools add column if not exists grades_served text;
alter table schools add column if not exists school_type text;
alter table schools add column if not exists address text;
alter table schools add column if not exists city text;
alter table schools add column if not exists zip text;
alter table schools add column if not exists phone text;
alter table schools add column if not exists website text;
alter table schools add column if not exists latitude numeric;
alter table schools add column if not exists longitude numeric;
alter table schools add column if not exists nces_id text;
alter table schools add column if not exists source_url text;
alter table schools add column if not exists date_imported date default current_date;
alter table schools add column if not exists date_verified date;
alter table schools add column if not exists verification_status verification_status default 'unverified';
alter table schools add column if not exists created_at timestamptz default now();
alter table schools add column if not exists updated_at timestamptz default now();
alter table schools add column if not exists recruiting_priority text check (recruiting_priority in ('high','medium','low'));
alter table schools add column if not exists relationship_status text check (relationship_status in ('not_started','contacted','warm','active','not_interested','needs_follow_up')) default 'not_started';
alter table schools add column if not exists last_contacted_at timestamptz;
alter table schools add column if not exists next_follow_up_at timestamptz;
alter table schools add column if not exists outreach_notes text;

create table if not exists programs (id uuid primary key default gen_random_uuid());
alter table programs add column if not exists school_id uuid references schools(id) on delete cascade;
alter table programs add column if not exists name text;
alter table programs add column if not exists program_area text;
alter table programs add column if not exists source_url text;
alter table programs add column if not exists date_verified date;
alter table programs add column if not exists verification_status verification_status default 'unverified';

create table if not exists contacts (id uuid primary key default gen_random_uuid());
alter table contacts add column if not exists name text;
alter table contacts add column if not exists title text;
alter table contacts add column if not exists email text;
alter table contacts add column if not exists phone text;
alter table contacts add column if not exists extension text;
alter table contacts add column if not exists school_id uuid references schools(id) on delete set null;
alter table contacts add column if not exists district_id uuid references districts(id) on delete set null;
alter table contacts add column if not exists program_area text;
alter table contacts add column if not exists source_url text;
alter table contacts add column if not exists source_page_title text;
alter table contacts add column if not exists date_verified date not null default current_date;
alter table contacts add column if not exists confidence_score text check (confidence_score in ('high','medium','low'));
alter table contacts add column if not exists extraction_notes text;
alter table contacts add column if not exists verification_status verification_status default 'unverified';

create table if not exists source_urls (id uuid primary key default gen_random_uuid());
alter table source_urls add column if not exists school_id uuid references schools(id);
alter table source_urls add column if not exists district_id uuid references districts(id);
alter table source_urls add column if not exists url text;
alter table source_urls add column if not exists page_title text;
alter table source_urls add column if not exists last_crawled_at timestamptz;
alter table source_urls add column if not exists http_status int;
alter table source_urls add column if not exists is_official boolean default true;
alter table source_urls add column if not exists notes text;
create unique index if not exists source_urls_url_key on source_urls(url);

create table if not exists discovery_runs (id uuid primary key default gen_random_uuid(), started_at timestamptz default now(), completed_at timestamptz, run_type text not null, status text not null default 'running', pages_checked int default 0, contacts_found int default 0, rows_inserted int default 0, rows_updated int default 0, rows_skipped int default 0, errors jsonb default '[]');
create table if not exists crawl_runs (id uuid primary key default gen_random_uuid(), started_at timestamptz default now(), completed_at timestamptz, run_type text not null, status text not null default 'running', pages_checked int default 0, contacts_found int default 0, errors jsonb default '[]');
create table if not exists crawl_queue (id uuid primary key default gen_random_uuid(), target_type text not null check (target_type in ('district','school','staff_directory','cte_page','contact_page')), target_url text not null unique, source_domain text not null, school_id uuid references schools(id) on delete cascade, district_id uuid references districts(id) on delete cascade, status text not null default 'pending' check (status in ('pending','running','complete','failed','skipped')), attempts int not null default 0, last_error text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists crawl_results (id uuid primary key default gen_random_uuid(), run_id uuid references discovery_runs(id) on delete set null, queue_id uuid references crawl_queue(id) on delete set null, target_url text not null, http_status int, page_title text, rows_inserted int default 0, rows_updated int default 0, rows_skipped int default 0, created_at timestamptz default now());
create table if not exists crawl_errors (id uuid primary key default gen_random_uuid(), run_id uuid references discovery_runs(id) on delete set null, queue_id uuid references crawl_queue(id) on delete set null, target_url text, error_message text not null, created_at timestamptz default now());
create table if not exists recruiting_notes (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id), district_id uuid references districts(id), contact_id uuid references contacts(id), note text, last_visit date, next_visit date, relationship_status text, recruiting_priority text, contact_history text, follow_up_date date, updated_at timestamptz default now());
create table if not exists contact_logs (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id) on delete cascade, contact_id uuid references contacts(id) on delete set null, district_id uuid references districts(id) on delete set null, contacted_by_email text, contact_method text not null check (contact_method in ('phone','email','in_person','other')), outcome text not null check (outcome in ('no_answer','left_message','reached_contact','scheduled_visit','needs_follow_up','not_interested','other')), notes text, contacted_at timestamptz not null default now(), created_at timestamptz default now(), updated_at timestamptz default now());

alter table districts enable row level security; alter table schools enable row level security; alter table contacts enable row level security; alter table programs enable row level security; alter table source_urls enable row level security; alter table discovery_runs enable row level security; alter table crawl_runs enable row level security; alter table crawl_queue enable row level security; alter table crawl_results enable row level security; alter table crawl_errors enable row level security; alter table recruiting_notes enable row level security; alter table contact_logs enable row level security;
