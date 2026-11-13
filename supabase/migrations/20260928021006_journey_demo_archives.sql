-- Personal DEMO archives only. These tables never authorize school reservations.
-- Append-only snapshots preserve prior plans, bookings and submitted PDF versions.
create table public.journey_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  saved_at timestamptz not null default now(),
  primary key (user_id, revision)
);
create table public.journey_plans (
  user_id uuid not null, snapshot_revision integer not null, id text not null,
  payload jsonb not null check (payload ? 'mode' and payload->>'mode' = 'DEMO' and payload->>'id' = id),
  primary key (user_id, snapshot_revision, id),
  foreign key (user_id,snapshot_revision) references public.journey_snapshots(user_id,revision) on delete cascade
);
create table public.journey_bookings (
  user_id uuid not null, snapshot_revision integer not null, id text not null,
  payload jsonb not null check (payload ? 'mode' and payload->>'mode' = 'DEMO' and payload->>'id' = id),
  primary key (user_id, snapshot_revision, id),
  foreign key (user_id,snapshot_revision) references public.journey_snapshots(user_id,revision) on delete cascade
);
create table public.journey_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9:_-]{1,180}$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,id),
  check (storage_path = user_id::text || '/' || replace(id, ':', '_') || '.pdf')
);
alter table public.journey_snapshots enable row level security;
alter table public.journey_plans enable row level security;
alter table public.journey_bookings enable row level security;
alter table public.journey_documents enable row level security;
revoke all on public.journey_snapshots,public.journey_plans,public.journey_bookings,public.journey_documents from anon,authenticated;
grant select,insert on public.journey_snapshots,public.journey_plans,public.journey_bookings,public.journey_documents to authenticated;
create policy snapshot_read on public.journey_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy snapshot_append on public.journey_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy plan_read on public.journey_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy plan_append on public.journey_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy booking_read on public.journey_bookings for select to authenticated using ((select auth.uid()) = user_id);
create policy booking_append on public.journey_bookings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy document_read on public.journey_documents for select to authenticated using ((select auth.uid()) = user_id);
create policy document_append on public.journey_documents for insert to authenticated with check ((select auth.uid()) = user_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('journey-private-documents','journey-private-documents',false,10485760,array['application/pdf']);
create policy journey_pdf_read on storage.objects for select to authenticated
using (bucket_id = 'journey-private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy journey_pdf_append on storage.objects for insert to authenticated
with check (bucket_id = 'journey-private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No object UPDATE/DELETE policy: immutable PDFs, never upsert.

create function public.save_journey_backup(p_data jsonb,p_documents jsonb,p_expected_version integer)
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select coalesce(max(revision),0) into current_version from public.journey_snapshots where user_id=actor;
  if p_expected_version is distinct from current_version then raise exception '백업이 다른 기기에서 변경됐어요. 최신 백업을 다시 불러와 주세요.'; end if;
  next_version := current_version + 1;
  insert into public.journey_snapshots(user_id,revision,profile) values(actor,next_version,p_data->'profile');
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
create function public.load_journey_backup()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version',s.revision,'savedAt',s.saved_at,'data',jsonb_build_object(
    'version',3,'profile',s.profile,
    'plans',coalesce((select jsonb_agg(p.payload order by p.payload->>'updatedAt' desc nulls last,p.id) from public.journey_plans p where p.user_id=s.user_id and p.snapshot_revision=s.revision),'[]'::jsonb),
    'bookings',coalesce((select jsonb_agg(b.payload order by b.payload->>'date' desc,b.id) from public.journey_bookings b where b.user_id=s.user_id and b.snapshot_revision=s.revision),'[]'::jsonb)
  )) from public.journey_snapshots s where s.user_id=(select auth.uid()) order by s.revision desc limit 1;
$$;
revoke all on function public.save_journey_backup(jsonb,jsonb,integer),public.load_journey_backup() from public,anon;
grant execute on function public.save_journey_backup(jsonb,jsonb,integer),public.load_journey_backup() to authenticated;
