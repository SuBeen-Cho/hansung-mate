-- Versioned personal records. Public curricula are references, never official transcript evidence.
alter table public.journey_snapshots add column academic jsonb check (academic is null or (jsonb_typeof(academic) = 'object' and academic ?& array['revision','creditLimit'] and (academic->>'revision')::integer > 0 and (academic->>'creditLimit')::integer between 1 and 30));
create table public.journey_academic_records (
 user_id uuid not null,
 snapshot_revision integer not null,
 id text not null,
 payload jsonb not null check (
  jsonb_typeof(payload) = 'object' and payload ?& array['id','name','creditMilli','term','grade','category','status','source','origin','recognition']
  and payload->>'id' = id and payload->>'recognition' = 'UNVERIFIED'
  and payload->>'origin' in ('DEMO','MANUAL') and payload->>'status' = 'COMPLETED'
  and payload->>'source' in ('MANUAL','PUBLIC_CURRICULUM','DEMO_SUMMARY')
  and payload->>'term' ~ '^([1-6]-[12]|DEMO)$'
  and payload->>'category' in ('전기','전필','전선','교양필수','선택필수','자율교양','일선','미분류')
  and (payload->>'creditMilli')::integer between 1 and 60000
 ),
 primary key(user_id,snapshot_revision,id),
 foreign key(user_id,snapshot_revision) references public.journey_snapshots(user_id,revision) on delete cascade
);
create unique index journey_academic_code_unique on public.journey_academic_records(user_id,snapshot_revision,(payload->>'courseCode')) where payload ? 'courseCode';
alter table public.journey_academic_records enable row level security;
revoke all on public.journey_academic_records from anon,authenticated;
grant select,insert on public.journey_academic_records to authenticated;
create policy academic_read on public.journey_academic_records for select to authenticated using ((select auth.uid()) = user_id);
create policy academic_append on public.journey_academic_records for insert to authenticated with check ((select auth.uid()) = user_id);
create or replace function public.save_journey_backup(p_data jsonb,p_documents jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); current_version integer; next_version integer; item jsonb; prior_hash text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_data is null or (p_data->>'version') is distinct from '3'
    or jsonb_typeof(p_data->'profile') is distinct from 'object'
    or jsonb_typeof(p_data->'plans') is distinct from 'array'
    or jsonb_typeof(p_data->'bookings') is distinct from 'array'
    or jsonb_typeof(p_documents) is distinct from 'array'
    then raise exception 'Invalid demo backup'; end if;
  if length(p_data::text) > 4000000 or jsonb_array_length(p_data->'plans') > 500
    or jsonb_array_length(p_data->'bookings') > 1000 or jsonb_array_length(p_documents) > 2000
    then raise exception 'Backup size limit'; end if;
  if p_data ? 'academic' then
    if jsonb_typeof(p_data->'academic') is distinct from 'object' or jsonb_typeof(p_data->'academic'->'records') is distinct from 'array' then raise exception 'Invalid academic records'; end if;
    if jsonb_array_length(p_data->'academic'->'records') > 2000 then raise exception 'Academic record limit'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select coalesce(max(revision),0) into current_version from public.journey_snapshots where user_id=actor;
  if p_expected_version is distinct from current_version then raise exception '백업이 다른 기기에서 변경됐어요. 최신 백업을 다시 불러와 주세요.'; end if;
  next_version := current_version + 1;
  insert into public.journey_snapshots(user_id,revision,profile,academic) values(actor,next_version,p_data->'profile',(p_data->'academic') - 'records');
  for item in select value from jsonb_array_elements(coalesce(p_data->'academic'->'records','[]'::jsonb)) loop
    insert into public.journey_academic_records(user_id,snapshot_revision,id,payload) values(actor,next_version,item->>'id',item);
  end loop;
  for item in select value from jsonb_array_elements(p_data->'plans') loop
    insert into public.journey_plans(user_id,snapshot_revision,id,payload) values(actor,next_version,item->>'id',item);
  end loop;
  for item in select value from jsonb_array_elements(p_data->'bookings') loop
    insert into public.journey_bookings(user_id,snapshot_revision,id,payload) values(actor,next_version,item->>'id',item);
  end loop;
  for item in select value from jsonb_array_elements(p_documents) loop
    select sha256 into prior_hash from public.journey_documents where user_id=actor and id=item->>'id';
    if prior_hash is not null and prior_hash is distinct from item->>'sha256' then raise exception 'Document revision conflict'; end if;
    if not exists(select 1 from storage.objects where bucket_id='journey-private-documents' and name=item->>'storage_path') then raise exception 'PDF upload missing'; end if;
    insert into public.journey_documents(user_id,id,sha256,storage_path) values(actor,item->>'id',item->>'sha256',item->>'storage_path') on conflict(user_id,id) do nothing;
  end loop;
  return next_version;
end $$;
create or replace function public.load_journey_backup()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version',s.revision,'savedAt',s.saved_at,'data',jsonb_build_object(
    'version',3,'profile',s.profile,
    'plans',coalesce((select jsonb_agg(p.payload order by p.payload->>'updatedAt' desc nulls last,p.id) from public.journey_plans p where p.user_id=s.user_id and p.snapshot_revision=s.revision),'[]'::jsonb),
    'bookings',coalesce((select jsonb_agg(b.payload order by b.payload->>'date' desc,b.id) from public.journey_bookings b where b.user_id=s.user_id and b.snapshot_revision=s.revision),'[]'::jsonb)
  ) || case when s.academic is null then '{}'::jsonb else jsonb_build_object('academic',s.academic || jsonb_build_object('records',coalesce((select jsonb_agg(r.payload order by r.id) from public.journey_academic_records r where r.user_id=s.user_id and r.snapshot_revision=s.revision),'[]'::jsonb))) end) from public.journey_snapshots s where s.user_id=(select auth.uid()) order by s.revision desc limit 1;
$$;
revoke all on function public.save_journey_backup(jsonb,jsonb,integer),public.load_journey_backup() from public,anon;
grant execute on function public.save_journey_backup(jsonb,jsonb,integer),public.load_journey_backup() to authenticated;
