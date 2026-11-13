// Verifies Supabase migrations + RLS in an in-memory Postgres (PGlite) with auth/storage stubs.
// Run: npm i --no-save @electric-sql/pglite@0.2.17 && node scripts/verify-migrations.mjs supabase/migrations/*.sql

import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const stub = `
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigserial, bucket_id text, name text); alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema storage to anon, authenticated; grant select, insert on storage.objects to authenticated;
grant usage on schema public to anon, authenticated;
`;
await db.exec(stub);
for (const f of process.argv.slice(2)) {
  await db.exec(fs.readFileSync(f, "utf8"));
  console.log("applied", f.split("/").pop());
}
const u1 = "11111111-1111-1111-1111-111111111111",
  u2 = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users values ('${u1}'),('${u2}'); insert into public.app_admins(user_id,role) values ('${u2}','SPACE_REVIEWER');
insert into public.ref_colleges values ('creative','창의융합대학'); insert into public.ref_programs(id,name,college_id,kind,status,source_status) values ('security','융합보안학과','creative','DEPARTMENT','ACTIVE','CRAWLED');`);
const as = async (uid, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub','${uid}',false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
};
const payload = {
  mode: "DEMO",
  kind: "ROOM",
  spaceId: "classroom",
  space: "강의실",
  date: "2030-01-02",
  endDate: "2030-01-02",
  start: "10:00",
  end: "12:00",
  count: 30,
  purpose: "스터디",
};
const id = (
  await as(u1, `select public.submit_space_application('c1', $1::jsonb, null, null) as id`, [
    JSON.stringify(payload),
  ])
).rows[0].id;
console.log("submitted", id);
console.log(
  "student sees own",
  (await as(u1, "select count(*)::int n from public.space_applications")).rows[0].n,
);
console.log(
  "reviewer flag u1",
  (await as(u1, "select public.is_space_reviewer() v")).rows[0].v,
  "u2",
  (await as(u2, "select public.is_space_reviewer() v")).rows[0].v,
);
console.log(
  "reviewer sees",
  (await as(u2, "select count(*)::int n from public.space_applications")).rows[0].n,
);
try {
  await as(u1, `select public.review_space_application($1,'APPROVE','',1)`, [id]);
  console.log("BUG: student approved");
} catch (e) {
  console.log("student review blocked:", e.message);
}
try {
  await as(u2, `select public.review_space_application($1,'REJECT','',1)`, [id]);
  console.log("BUG");
} catch (e) {
  console.log("empty note blocked:", e.message);
}
console.log(
  "changes",
  (
    await as(u2, `select public.review_space_application($1,'REQUEST_CHANGES','목적 구체화',1) s`, [
      id,
    ])
  ).rows[0].s,
);
console.log(
  "resubmit",
  (
    await as(u1, `select public.submit_space_application('c1', $1::jsonb, null, null) id`, [
      JSON.stringify({ ...payload, purpose: "캡스톤 회의" }),
    ])
  ).rows[0].id === id,
);
try {
  await as(u2, `select public.review_space_application($1,'APPROVE','',1)`, [id]);
  console.log("BUG stale");
} catch (e) {
  console.log("stale revision blocked:", e.message);
}
console.log(
  "approve",
  (await as(u2, `select public.review_space_application($1,'APPROVE','',2) s`, [id])).rows[0].s,
);
console.log(
  "events",
  (await as(u1, "select count(*)::int n from public.space_application_events")).rows[0].n,
);
try {
  await as(u1, `update public.space_applications set stage='APPROVED'`);
  console.log("BUG direct update");
} catch (e) {
  console.log("direct update blocked:", e.message);
}
const instant = {
  ...payload,
  kind: "INSTANT",
  date: "2030-01-03",
  endDate: "2030-01-03",
  spaceId: "base-ib101",
  space: "IB101",
  count: 4,
  start: "10:00",
  end: "11:00",
};
await db.exec(
  `insert into public.ref_spaces(id,name,building,group_name,kind,capacity_max,capacity_verified,open_time,close_time,hours_verified,booking,source_url) values ('base-ib101','IB101','상상관','상상베이스','INSTANT',8,true,'09:00','22:00',false,'online','https://www.hansung.ac.kr')`,
);
const expectBlocked = async (label, uid, clientId, body) => {
  try {
    await as(uid, `select public.submit_space_application($1, $2::jsonb, null, null)`, [
      clientId,
      JSON.stringify(body),
    ]);
    console.log(`BUG ${label} allowed`);
  } catch (e) {
    console.log(`${label} blocked:`, e.message);
  }
};
console.log(
  "instant ok",
  !!(
    await as(u1, `select public.submit_space_application('i1', $1::jsonb, null, null) id`, [
      JSON.stringify(instant),
    ])
  ).rows[0].id,
);
await expectBlocked("own overlap", u1, "i2", { ...instant, spaceId: "other" });
await expectBlocked("room overlap", u2, "i3", instant);
await expectBlocked("capacity", u2, "i4", { ...instant, count: 20, start: "14:00", end: "15:00" });
await expectBlocked("hours", u2, "i5", { ...instant, start: "21:00", end: "23:00" });
await expectBlocked("night minimum", u2, "n1", { ...payload, kind: "NIGHT", members: [1, 2] });
console.log(
  "anon reads ref",
  (
    await (async () => {
      await db.exec("set role anon");
      try {
        return await db.query("select count(*)::int n from public.ref_programs");
      } finally {
        await db.exec("reset role");
      }
    })()
  ).rows[0].n,
);
try {
  await db.exec("set role anon");
  await db.query(`insert into public.ref_colleges values ('x','x')`);
  console.log("BUG anon write");
} catch (e) {
  console.log("anon write blocked:", e.message);
} finally {
  await db.exec("reset role");
}
