-- 2026-2 학업이수가이드(학번별 졸업·교양 기준), 2026-2 강의시간표(개설 과목), 트랙·학과별 졸업요건.
-- Public reference data: readable by everyone, written only by the service-role seed.

create table public.ref_cohort_liberal_rules (
  cohorts text primary key,
  from_year integer,
  to_year integer,
  total_milli integer not null check (total_milli > 0),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  source text not null
);
create table public.ref_cohort_rules (
  id text primary key,
  payload jsonb not null,
  source text not null
);
create table public.ref_course_offerings (
  term text not null,
  kind text not null check (kind in ('PROGRAM','LIBERAL','LEGACY','CONVERGENCE')),
  group_name text not null,
  code text not null,
  name text not null,
  category text,
  recommended_year text,
  credit numeric(3,1),
  sections integer not null check (sections > 0),
  primary key (term, group_name, code)
);
create index ref_course_offerings_code on public.ref_course_offerings(term, code);
create table public.ref_program_graduation (
  program_id text primary key references public.ref_programs(id) on delete cascade,
  found boolean not null,
  kinds text[] not null default '{}',
  summary text not null default '',
  confidence text check (confidence in ('HIGH','MEDIUM','LOW')),
  detail jsonb not null default '{}'::jsonb,
  collected_at date not null
);

do $$
declare t text;
begin
  foreach t in array array['ref_cohort_liberal_rules','ref_cohort_rules','ref_course_offerings','ref_program_graduation'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;
