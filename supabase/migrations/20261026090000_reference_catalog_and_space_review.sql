-- 1) Public school reference data (crawled 2026-10-26 from hansung.ac.kr public pages).
--    Readable by everyone, writable only by the service role through the seed script.
-- 2) Shared space-application workflow so a real reviewer account can approve, request
--    changes or reject requests that students submit from their own accounts.
--    Personal backups (journey_*) stay private and unchanged.

create table public.ref_dataset_versions (
  version text primary key,
  crawled_at date not null,
  source_note text not null,
  loaded_at timestamptz not null default now()
);
create table public.ref_sources (
  id text primary key,
  title text not null,
  url text not null check (url ~ '^https://'),
  published_at date,
  accessed_at date not null
);
create table public.ref_colleges (
  id text primary key,
  name text not null unique
);
create table public.ref_programs (
  id text primary key,
  name text not null unique,
  college_id text references public.ref_colleges(id),
  unit text,
  kind text not null check (kind in ('TRACK','DEPARTMENT','MAJOR','SELF_DESIGNED','CONTRACT')),
  session text check (session in ('DAY','EVENING','BOTH')),
  status text not null check (status in ('ACTIVE','LEGACY','FUTUREPLUS','CONTRACT')),
  first_slot_allowed boolean not null default true,
  second_slot_allowed boolean not null default true,
  requirement_profile text not null default 'UNKNOWN',
  curriculum_url text,
  graduation_url text,
  graduation_summary text,
  source_status text not null
);
create table public.ref_program_aliases (
  program_id text not null references public.ref_programs(id) on delete cascade,
  alias text not null,
  primary key (program_id, alias)
);
create index ref_program_aliases_alias on public.ref_program_aliases(alias);
create table public.ref_courses (
  code text primary key,
  name text not null,
  credit_milli integer not null check (credit_milli between 0 and 30000),
  code_verified boolean not null
);
create table public.ref_course_mappings (
  id bigint generated always as identity primary key,
  course_code text not null references public.ref_courses(code) on delete cascade,
  program_id text not null references public.ref_programs(id) on delete cascade,
  category text not null check (category in ('전기','전필','전선','일선','미분류')),
  category_as_published text,
  recommended_year text not null,
  semester text not null,
  module text,
  partner_university text,
  source_url text not null,
  unique (course_code, program_id, category, recommended_year, semester)
);
create index ref_course_mappings_program on public.ref_course_mappings(program_id, recommended_year, semester);
create table public.ref_requirement_profiles (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create table public.ref_procedures (
  id text primary key,
  type text not null check (type in ('TRACK_SELECT','TRACK_CHANGE','GENERAL_TRANSFER','CROSS_TRANSFER','THIRD_TRACK','DOUBLE_MINOR','KMOOC','MICRO_DEGREE','TRACK_CREDIT_RECOGNITION','GRADUATION_REVIEW')),
  term text not null,
  title text not null,
  published_at date,
  apply_start timestamp,
  apply_end timestamp,
  result_at timestamp,
  eligibility text,
  notes jsonb not null default '[]'::jsonb,
  average_gpa numeric(3,2),
  source_url text not null
);
create index ref_procedures_type_term on public.ref_procedures(type, term desc);
create table public.ref_procedure_quotas (
  procedure_id text not null references public.ref_procedures(id) on delete cascade,
  unit text not null,
  day integer check (day >= 0),
  night integer check (night >= 0),
  total integer check (total >= 0),
  primary key (procedure_id, unit)
);
-- Aggregate counts only; individual admission lists are never stored.
create table public.ref_procedure_results (
  procedure_id text not null references public.ref_procedures(id) on delete cascade,
  to_unit text not null,
  accepted integer not null check (accepted >= 0),
  primary key (procedure_id, to_unit)
);
create table public.ref_microdegrees (
  id text primary key,
  name text not null,
  md_type smallint not null check (md_type in (1,2)),
  category text not null,
  credit_milli integer not null,
  year integer not null,
  courses jsonb not null default '[]'::jsonb,
  source_url text not null
);
create table public.ref_spaces (
  id text primary key,
  name text not null,
  building text not null,
  group_name text not null,
  kind text not null check (kind in ('INSTANT','ROOM')),
  capacity_min integer,
  capacity_max integer not null,
  capacity_verified boolean not null,
  open_time time not null,
  close_time time not null,
  hours_verified boolean not null,
  booking text not null,
  features jsonb not null default '[]'::jsonb,
  notes text not null default '',
  closed_weekends boolean not null default false,
  closed_holidays boolean not null default false,
  source_url text not null
);
create table public.ref_calendar_spans (
  id text primary key,
  kind text not null check (kind in ('TERM','VACATION','EXAM','EVENT','CLOSURE')),
  name text not null,
  start_day date not null,
  end_day date not null check (end_day >= start_day),
  procedure_type text,
  applies_term text,
  source_url text not null
);
create table public.ref_holidays (
  day date primary key,
  name text not null,
  verified boolean not null
);
create table public.ref_space_observed_slots (
  space_id text not null references public.ref_spaces(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  primary key (space_id, day, start_time)
);

do $$
declare t text;
begin
  foreach t in array array['ref_dataset_versions','ref_sources','ref_colleges','ref_programs','ref_program_aliases','ref_courses','ref_course_mappings','ref_requirement_profiles','ref_procedures','ref_procedure_quotas','ref_procedure_results','ref_microdegrees','ref_spaces','ref_calendar_spans','ref_holidays','ref_space_observed_slots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Convenience view for the app: one row per program course with the course facts.
create view public.ref_program_courses with (security_invoker = true) as
  select m.program_id, p.name as program_name, c.code, c.name, c.credit_milli, c.code_verified,
         m.category, m.category_as_published, m.recommended_year, m.semester, m.module,
         m.partner_university, m.source_url
  from public.ref_course_mappings m
  join public.ref_courses c on c.code = m.course_code
  join public.ref_programs p on p.id = m.program_id;
grant select on public.ref_program_courses to anon, authenticated;

-- Reviewer roles are granted by an operator with the service role, never by the app.
create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('SPACE_REVIEWER')),
  granted_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
create policy app_admins_self on public.app_admins for select to authenticated using ((select auth.uid()) = user_id);

create function public.is_space_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_admins where user_id = (select auth.uid()) and role = 'SPACE_REVIEWER');
$$;
revoke all on function public.is_space_reviewer() from public, anon;
grant execute on function public.is_space_reviewer() to authenticated;

create table public.space_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (client_id ~ '^[A-Za-z0-9:_-]{1,180}$'),
  kind text not null check (kind in ('INSTANT','ROOM','NIGHT','EXAM')),
  space_id text not null,
  space_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  head_count integer not null check (head_count between 1 and 500),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'mode' = 'DEMO'),
  stage text not null check (stage in ('REVIEW','CHANGES','APPROVED','CHECKED_IN','CHECKED_OUT','CANCELLED','REJECTED','EXPIRED','NO_SHOW')),
  revision integer not null default 1 check (revision > 0),
  reviewer_note text not null default '',
  document_path text,
  document_sha256 text check (document_sha256 is null or document_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index space_applications_queue on public.space_applications(stage, starts_at);
create table public.space_application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.space_applications(id) on delete cascade,
  actor uuid not null,
  actor_role text not null check (actor_role in ('APPLICANT','REVIEWER')),
  from_stage text,
  to_stage text not null,
  note text not null default '',
  at timestamptz not null default now()
);
alter table public.space_applications enable row level security;
alter table public.space_application_events enable row level security;
revoke all on public.space_applications, public.space_application_events from anon, authenticated;
grant select on public.space_applications, public.space_application_events to authenticated;
create policy space_app_read on public.space_applications for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_space_reviewer()));
create policy space_event_read on public.space_application_events for select to authenticated
  using (exists (select 1 from public.space_applications a where a.id = application_id
                 and ((select auth.uid()) = a.user_id or (select public.is_space_reviewer()))));

-- Reviewers may read the submitted PDF of an application they can see.
create policy journey_pdf_reviewer_read on storage.objects for select to authenticated
  using (bucket_id = 'journey-private-documents' and (select public.is_space_reviewer())
         and exists (select 1 from public.space_applications a where a.document_path = name));

-- Applicant submits or resubmits. Instant bookings are confirmed immediately (demo policy);
-- document-based requests wait for a reviewer.
create function public.submit_space_application(p_client_id text, p_payload jsonb, p_document_path text, p_document_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); app public.space_applications; v_kind text := p_payload->>'kind';
  v_start timestamptz; v_end timestamptz; v_stage text; v_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if v_kind not in ('INSTANT','ROOM','NIGHT','EXAM') or p_payload->>'mode' <> 'DEMO' then raise exception 'Invalid application'; end if;
  if p_document_path is not null and split_part(p_document_path, '/', 1) <> actor::text then raise exception 'Document owner mismatch'; end if;
  v_start := ((p_payload->>'date') || ' ' || (p_payload->>'start') || ':00+09')::timestamptz;
  v_end := ((p_payload->>'endDate') || ' ' || (p_payload->>'end') || ':00+09')::timestamptz;
  v_stage := case when v_kind = 'INSTANT' then 'APPROVED' when v_kind = 'EXAM' then 'CHECKED_IN' else 'REVIEW' end;
  if v_end <= v_start then raise exception 'End must be after start'; end if;
  if v_kind = 'NIGHT' and jsonb_array_length(coalesce(p_payload->'members', '[]'::jsonb)) < 5 then
    raise exception '야간 잔류는 신청인 포함 5명 이상이어야 해요.';
  end if;
  -- Same rules as the app: capacity, operating hours and one booking at a time per student.
  if v_kind in ('INSTANT','ROOM') then
    if exists (select 1 from public.ref_spaces s where s.id = p_payload->>'spaceId'
               and ((p_payload->>'count')::integer > s.capacity_max
                    or (p_payload->>'start')::time < s.open_time or (p_payload->>'end')::time > s.close_time
                    or (p_payload->>'date') <> (p_payload->>'endDate'))) then
      raise exception '공간의 정원·운영 시간을 벗어났어요.';
    end if;
    if exists (select 1 from public.space_applications a where a.user_id = actor and a.client_id <> p_client_id
               and a.kind in ('INSTANT','ROOM') and a.stage not in ('CANCELLED','CHECKED_OUT','REJECTED','EXPIRED','NO_SHOW')
               and a.starts_at < v_end and v_start < a.ends_at) then
      raise exception '같은 시간에 이미 다른 공간 예약이 있어요.';
    end if;
    if exists (select 1 from public.space_applications a where a.space_id = p_payload->>'spaceId' and a.client_id <> p_client_id
               and a.stage not in ('CANCELLED','CHECKED_OUT','REJECTED','EXPIRED','NO_SHOW')
               and a.starts_at < v_end and v_start < a.ends_at) then
      raise exception '이 시간에 이미 예약된 공간이에요.';
    end if;
  end if;
  select * into app from public.space_applications where user_id = actor and client_id = p_client_id for update;
  if found then
    if app.stage not in ('CHANGES','REVIEW') then raise exception 'This application can no longer be edited'; end if;
    update public.space_applications set payload = p_payload, space_id = p_payload->>'spaceId', space_name = p_payload->>'space',
      starts_at = v_start, ends_at = v_end, head_count = (p_payload->>'count')::integer, stage = v_stage,
      revision = app.revision + 1, document_path = p_document_path, document_sha256 = p_document_sha256, updated_at = now()
      where id = app.id;
    insert into public.space_application_events(application_id, actor, actor_role, from_stage, to_stage, note)
      values (app.id, actor, 'APPLICANT', app.stage, v_stage, '보완 후 재제출');
    return app.id;
  end if;
  insert into public.space_applications(user_id, client_id, kind, space_id, space_name, starts_at, ends_at, head_count, payload, stage, document_path, document_sha256)
    values (actor, p_client_id, v_kind, p_payload->>'spaceId', p_payload->>'space', v_start, v_end, (p_payload->>'count')::integer, p_payload, v_stage, p_document_path, p_document_sha256)
    returning id into v_id;
  insert into public.space_application_events(application_id, actor, actor_role, from_stage, to_stage, note)
    values (v_id, actor, 'APPLICANT', null, v_stage, '신청');
  return v_id;
end $$;

-- Reviewer decision with optimistic concurrency on revision.
create function public.review_space_application(p_id uuid, p_action text, p_note text, p_expected_revision integer)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); app public.space_applications; v_stage text;
begin
  if actor is null or not public.is_space_reviewer() then raise exception 'Reviewer role required'; end if;
  select * into app from public.space_applications where id = p_id for update;
  if not found then raise exception 'Application not found'; end if;
  if app.revision <> p_expected_revision then raise exception '다른 검토자가 먼저 처리했어요. 새로고침해 주세요.'; end if;
  if app.stage <> 'REVIEW' then raise exception 'Only pending applications can be reviewed'; end if;
  v_stage := case p_action when 'APPROVE' then 'APPROVED' when 'REQUEST_CHANGES' then 'CHANGES' when 'REJECT' then 'REJECTED' end;
  if v_stage is null then raise exception 'Unknown action'; end if;
  if v_stage in ('CHANGES','REJECTED') and coalesce(btrim(p_note), '') = '' then raise exception 'A note is required'; end if;
  update public.space_applications set stage = v_stage, reviewer_note = coalesce(p_note, ''), updated_at = now() where id = p_id;
  insert into public.space_application_events(application_id, actor, actor_role, from_stage, to_stage, note)
    values (p_id, actor, 'REVIEWER', app.stage, v_stage, coalesce(p_note, ''));
  return v_stage;
end $$;

-- Applicant-side transitions after approval (check-in/out, cancel).
create function public.update_my_space_application(p_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); app public.space_applications; v_stage text;
begin
  select * into app from public.space_applications where id = p_id and user_id = actor for update;
  if not found then raise exception 'Application not found'; end if;
  v_stage := case
    when p_action = 'CHECK_IN' and app.stage = 'APPROVED' and now() >= app.starts_at - interval '10 minutes' and now() < app.ends_at then 'CHECKED_IN'
    when p_action = 'CHECK_OUT' and app.stage = 'CHECKED_IN' then 'CHECKED_OUT'
    when p_action = 'CANCEL' and app.stage in ('REVIEW','CHANGES','APPROVED') then 'CANCELLED'
  end;
  if v_stage is null then raise exception 'This action is not allowed now'; end if;
  update public.space_applications set stage = v_stage, updated_at = now() where id = p_id;
  insert into public.space_application_events(application_id, actor, actor_role, from_stage, to_stage)
    values (p_id, actor, 'APPLICANT', app.stage, v_stage);
  return v_stage;
end $$;

revoke all on function public.submit_space_application(text, jsonb, text, text), public.review_space_application(uuid, text, text, integer), public.update_my_space_application(uuid, text) from public, anon;
grant execute on function public.submit_space_application(text, jsonb, text, text), public.review_space_application(uuid, text, text, integer), public.update_my_space_application(uuid, text) to authenticated;
