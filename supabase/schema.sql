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
alter table districts add column if not exists city text;
alter table districts add column if not exists zip text;
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
update schools set school_type = case
  when lower(coalesce(school_type,'')) like '%charter%' and lower(coalesce(school_type,'')) like '%career%' then 'cte_career'
  when lower(coalesce(school_type,'')) like '%technical%' or lower(coalesce(school_type,'')) like '%career%' then 'cte_career'
  when lower(coalesce(school_type,'')) like '%charter%' then 'charter'
  when lower(coalesce(school_type,'')) like '%alternative%' then 'alternative'
  when lower(coalesce(school_type,'')) like '%private%' then 'private'
  when school_type is null or school_type = '' then 'unknown'
  else 'public'
end;
alter table schools drop constraint if exists schools_school_type_check;
alter table schools add constraint schools_school_type_check check (school_type in ('public','charter','alternative','private','cte_career','unknown'));
alter table schools add column if not exists school_tags jsonb default '[]';
alter table schools add column if not exists territory_status text default 'included';
alter table schools drop constraint if exists schools_territory_status_check;
alter table schools add constraint schools_territory_status_check check (territory_status in ('included','candidate','excluded','inactive'));
alter table schools add column if not exists address text;
alter table schools add column if not exists city text;
alter table schools add column if not exists zip text;
alter table schools add column if not exists phone text;
alter table schools add column if not exists fax text;
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
alter table schools add column if not exists last_high_school_visit_at date;
alter table schools add column if not exists outreach_notes text;
alter table schools add column if not exists needs_verification boolean default false;
alter table schools add column if not exists verification_notes text;

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
create table if not exists school_notes (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id) on delete cascade, created_by_email text, note_type text check (note_type in ('general','contact','visit','correction','follow_up','program')) default 'general', note text not null, created_at timestamptz default now(), updated_at timestamptz default now());

alter table districts enable row level security; alter table schools enable row level security; alter table contacts enable row level security; alter table programs enable row level security; alter table source_urls enable row level security; alter table discovery_runs enable row level security; alter table crawl_runs enable row level security; alter table crawl_queue enable row level security; alter table crawl_results enable row level security; alter table crawl_errors enable row level security; alter table recruiting_notes enable row level security; alter table contact_logs enable row level security; alter table school_notes enable row level security;

create table if not exists dashboard_objectives (id uuid primary key default gen_random_uuid(), title text not null, description text, objective_type text, status text not null default 'archived' check (status in ('active','completed','archived')), progress_current int default 0, progress_target int default 1, recommended_next_action text, sort_order int default 0, completed_at timestamptz, created_by_email text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists recruiting_tasks (id uuid primary key default gen_random_uuid(), title text not null, description text, task_scope text not null default 'global' check (task_scope in ('global','district','school','contact')), school_id uuid references schools(id) on delete cascade, district_id uuid references districts(id) on delete cascade, contact_id uuid references contacts(id) on delete cascade, status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','complete')), priority text not null default 'medium' check (priority in ('high','medium','low')), due_date date, completed_at timestamptz, created_by_email text, notes text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists json_imports (id uuid primary key default gen_random_uuid(), imported_by_email text, import_type text, raw_json jsonb, summary jsonb, status text not null default 'validated' check (status in ('validated','imported','failed')), created_at timestamptz default now());

alter table schools add column if not exists geocoded_at timestamptz;
alter table schools add column if not exists geocoding_source text;
alter table schools add column if not exists location_accuracy text check (location_accuracy in ('address_level','city_level','missing')) default 'missing';
alter table schools add column if not exists enrollment int;
alter table schools add column if not exists mascot text;
alter table schools add column if not exists graduation_date date;
alter table schools add column if not exists bell_schedule_url text;
alter table schools add column if not exists fafsa_or_career_event_notes text;
alter table schools add column if not exists best_time_to_visit_seniors text;
alter table schools add column if not exists special_programs text;
alter table schools add column if not exists program_notes text;
alter table contacts add column if not exists source_notes text;
alter table contacts add column if not exists imported_by_email text;
alter table contacts add column if not exists imported_at timestamptz;
alter table contacts add column if not exists updated_at timestamptz default now();
alter table recruiting_notes add column if not exists source text;
alter table recruiting_notes add column if not exists note_type text;
alter table recruiting_notes add column if not exists source_url text;
alter table recruiting_tasks add column if not exists source_url text;
alter table recruiting_tasks enable row level security; alter table dashboard_objectives enable row level security; alter table json_imports enable row level security;

insert into dashboard_objectives (title,description,objective_type,status,progress_current,progress_target,recommended_next_action,sort_order)
select * from (values
('Confirm baseline territory roster','Make sure expected districts and schools are in the CRM.','coverage','active',0,1,'Review Districts & Schools, then mark baseline roster confirmed.',1),
('Find phone and website for every school','Fill phone and website gaps so every school can be contacted.','data','archived',0,1,'Review missing phone and website lists.',2),
('Find principal/contact office for every school','Find a main administrative contact path for each school.','contacts','archived',0,1,'Find principal or school office contact paths.',3),
('Find counselor or college/career contact','Find counseling or college/career contacts for outreach.','contacts','archived',0,1,'Ask each school for counseling or career contact.',4),
('Find CTE/shop/trades contact','Find instructors or coordinators tied to trades programs.','contacts','archived',0,1,'Ask for automotive, welding, diesel, construction, or CTE contacts.',5),
('Make first outreach to every school','Call or email each school at least once.','outreach','archived',0,1,'Start with schools ready for outreach.',6),
('Schedule first school visits','Turn warm outreach into visit dates.','visits','archived',0,1,'Schedule visits with warm or active schools.',7),
('Complete follow-up notes for every contacted school','Log outcomes and next steps after outreach.','followup','archived',0,1,'Close stale follow-ups and update notes.',8)
) as v(title,description,objective_type,status,progress_current,progress_target,recommended_next_action,sort_order)
where not exists (select 1 from dashboard_objectives);
alter table contacts drop constraint if exists contacts_confidence_score_check;
alter table contacts add constraint contacts_confidence_score_check check (confidence_score in ('high','medium','low','manual_low'));

-- Crawl queue duplicate visibility. This does not delete queue rows; use Discover status cleanupSql after review.
create index if not exists crawl_queue_target_type_url_idx on crawl_queue(target_type, target_url);
create or replace view crawl_queue_duplicate_targets as
select target_type,
       lower(regexp_replace(target_url, '/+$', '')) as normalized_target_url,
       sum(status_count) as duplicate_count,
       jsonb_object_agg(status, status_count) as statuses
from (
  select target_type,
         lower(regexp_replace(target_url, '/+$', '')) as target_url,
         status,
         count(*) as status_count
  from crawl_queue
  group by target_type, lower(regexp_replace(target_url, '/+$', '')), status
) grouped
group by target_type, target_url
having sum(status_count) > 1;

-- AI assisted import additive columns. Safe to rerun; no destructive schema changes.
alter table contacts add column if not exists role_category text;
alter table contacts add column if not exists source_notes text;
alter table contacts add column if not exists imported_by_email text;
alter table contacts add column if not exists imported_at timestamptz;
alter table schools add column if not exists special_programs text;
alter table schools add column if not exists program_notes text;

-- AI assisted update audit trail and verified apply support. Additive and safe to rerun.
alter table schools add column if not exists source_notes text;
alter table contacts add column if not exists role_category text;
alter table contacts add column if not exists source_notes text;
alter table contacts add column if not exists imported_by_email text;
alter table contacts add column if not exists imported_at timestamptz;
alter table contacts add column if not exists updated_at timestamptz default now();

create table if not exists ai_update_runs (
  id uuid primary key default gen_random_uuid(),
  imported_by_email text,
  status text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  item_count integer,
  created_count integer,
  updated_count integer,
  skipped_count integer,
  failed_count integer,
  input_hash text,
  original_payload jsonb,
  normalized_payload jsonb,
  result_summary jsonb,
  affected_record_ids jsonb
);
alter table ai_update_runs enable row level security;

-- Required AI Assisted Update apply columns for production. Additive/safe to rerun.
alter table schools add column if not exists special_programs text;
alter table schools add column if not exists program_notes text;
alter table schools add column if not exists source_notes text;
alter table schools add column if not exists fax text;

alter table contacts add column if not exists imported_by_email text;
alter table contacts add column if not exists imported_at timestamptz;
alter table contacts add column if not exists updated_at timestamptz default now();
alter table contacts add column if not exists source_url text;
alter table contacts add column if not exists source_notes text;
alter table contacts add column if not exists role_category text;
alter table contacts add column if not exists program_area text;
alter table contacts add column if not exists confidence_score text;
alter table contacts add column if not exists extraction_notes text;

-- Production constraint expects text confidence values. Preserve existing numeric
-- values by mapping them into high/medium/low before restoring the check.
alter table contacts drop constraint if exists contacts_confidence_score_check;
alter table contacts
  alter column confidence_score type text
  using case
    when confidence_score is null then null
    when lower(confidence_score::text) in ('high','medium','low') then lower(confidence_score::text)
    when lower(confidence_score::text) = 'manual_low' then 'low'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' and confidence_score::numeric >= 0.75 then 'high'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' and confidence_score::numeric >= 0.4 then 'medium'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' then 'low'
    else null
  end;
alter table contacts add constraint contacts_confidence_score_check check (confidence_score is null or confidence_score in ('high','medium','low'));

-- Recruiting data progress fields for AI Assisted Update. Safe additive columns.
alter table schools add column if not exists bell_schedule text;
alter table schools add column if not exists bell_schedule_url text;
alter table schools add column if not exists student_population_total integer;
alter table schools add column if not exists grade_enrollment jsonb default '{}'::jsonb;
alter table schools add column if not exists enrollment_source_url text;
alter table schools add column if not exists enrollment_notes text;
alter table schools add column if not exists cte_programs text;
alter table schools add column if not exists shop_programs text;
alter table schools add column if not exists trades_programs text;
alter table schools add column if not exists career_programs text;
alter table schools add column if not exists school_profile_notes text;
alter table schools add column if not exists last_ai_update_at timestamptz;
alter table schools add column if not exists last_ai_update_run_id uuid null;

-- AI Assisted Update writes text confidence values to match production.
alter table contacts drop constraint if exists contacts_confidence_score_check;
alter table contacts
  alter column confidence_score type text
  using case
    when confidence_score is null then null
    when lower(confidence_score::text) in ('high','medium','low') then lower(confidence_score::text)
    when lower(confidence_score::text) = 'manual_low' then 'low'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' and confidence_score::numeric >= 0.75 then 'high'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' and confidence_score::numeric >= 0.4 then 'medium'
    when confidence_score::text ~ '^[0-9]+(\.[0-9]+)?$' then 'low'
    else null
  end;
alter table contacts add constraint contacts_confidence_score_check check (confidence_score is null or confidence_score in ('high','medium','low'));

-- Optional AI Assisted Update school aliases. Additive and safe to rerun.
create table if not exists school_aliases (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists school_aliases_school_id_normalized_alias_key on school_aliases(school_id, normalized_alias);
create index if not exists school_aliases_normalized_alias_idx on school_aliases(normalized_alias);
alter table school_aliases enable row level security;

-- Seed common AI Assisted Update aliases without creating duplicate schools.
insert into school_aliases (school_id, alias, normalized_alias, source)
select schools.id, aliases.alias, aliases.normalized_alias, 'ai_assisted_update_seed'
from (values
  ('Notus Jr/Sr High School', 'Notus High School', 'notus high school'),
  ('Wilder Jr/Sr High School', 'Wilder High School', 'wilder high school'),
  ('Rockland Public School', 'Rockland High School', 'rockland high school'),
  ('Richard McKenna Charter High School', 'Richard McKenna Charter School', 'richard mckenna charter school'),
  ('Nampa Senior High School', 'Nampa High School', 'nampa high school'),
  ('Shelley Senior High School', 'Shelley High School', 'shelley high school'),
  ('Clark County Jr/Sr High School', 'Clark County High School', 'clark county high school')
) as aliases(school_name, alias, normalized_alias)
join schools on lower(schools.name) = lower(aliases.school_name)
on conflict (school_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  updated_at = now();
