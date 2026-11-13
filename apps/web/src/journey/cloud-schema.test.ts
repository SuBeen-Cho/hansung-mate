// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultAcademicData } from "./AcademicData";
import { freshState } from "./model";

const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const migration = readFileSync(
  resolve("../../supabase/migrations/20260928021006_journey_demo_archives.sql"),
  "utf8",
);
async function actor(id: string) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated; create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$; grant execute on function storage.foldername(text) to authenticated;`);
  await db.exec(migration);
  await db.exec(
    readFileSync(
      resolve("../../supabase/migrations/20260928064359_mate_personal_academics.sql"),
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
describe("개인 아카이브 Postgres 스키마", () => {
  it("한 사용자에게만 원자적으로 백업하고 stale 수정과 타인 접근을 거부한다", async () => {
    await actor(alice);
    const data = freshState();
    data.plans = [
      {
        id: "DEMO-plan",
        name: "계획",
        track1: data.profile.track1,
        track2: data.profile.track2,
        optional: "",
        items: [],
        mode: "DEMO",
        createdAt: "2026-09-28",
      },
    ];
    expect(
      (
        await db.query<{ v: number }>("select public.save_journey_backup($1::jsonb,'[]',0) as v", [
          JSON.stringify(data),
        ])
      ).rows[0]?.v,
    ).toBe(1);
    await expect(
      db.query("select public.save_journey_backup($1::jsonb,'[]',0)", [JSON.stringify(data)]),
    ).rejects.toThrow("다른 기기");
    expect((await db.query("select * from public.journey_snapshots")).rows).toHaveLength(1);
    await actor(bob);
    expect((await db.query("select * from public.journey_snapshots")).rows).toHaveLength(0);
    await expect(
      db.query("insert into public.journey_snapshots values($1,9,'{}',now())", [alice]),
    ).rejects.toThrow();
    await actor(alice);
    await expect(db.query("update public.journey_snapshots set profile='{}'")).rejects.toThrow();
    const bad = { ...data, plans: [{ ...data.plans[0], mode: "OFFICIAL" }] };
    await expect(
      db.query("select public.save_journey_backup($1::jsonb,'[]',1)", [JSON.stringify(bad)]),
    ).rejects.toThrow();
    expect((await db.query("select * from public.journey_snapshots")).rows).toHaveLength(1);
    const loaded = await db.query<{ data: unknown }>("select public.load_journey_backup() as data");
    expect(loaded.rows[0]?.data).toMatchObject({
      version: 1,
      data: { plans: [{ id: "DEMO-plan" }] },
    });
  });
  it("PDF 경로를 소유자 폴더로 제한하고 문서 수정은 허용하지 않는다", async () => {
    await actor(alice);
    const path = `${alice}/DEMO-doc_r1.pdf`;
    await db.query("insert into storage.objects values('journey-private-documents',$1)", [path]);
    await db.query(
      "insert into public.journey_documents(user_id,id,sha256,storage_path) values($1,'DEMO-doc:r1',$2,$3)",
      [alice, "a".repeat(64), path],
    );
    await expect(
      db.query("update public.journey_documents set sha256=$1", ["b".repeat(64)]),
    ).rejects.toThrow();
    await actor(bob);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
    expect((await db.query("select * from public.journey_documents")).rows).toHaveLength(0);
    await expect(
      db.query("insert into storage.objects values('journey-private-documents',$1)", [
        `${alice}/other.pdf`,
      ]),
    ).rejects.toThrow();
  });
});

it("개인 성적을 버전별로 복원하고 공식 인정으로 저장하지 않는다", async () => {
  await actor(alice);
  const data = { ...freshState(), academic: structuredClone(defaultAcademicData) };
  const current =
    (
      await db.query<{ v: number }>(
        "select coalesce(max(revision),0) as v from public.journey_snapshots",
      )
    ).rows[0]?.v ?? 0;
  await db.query("select public.save_journey_backup($1::jsonb,'[]',$2)", [
    JSON.stringify(data),
    current,
  ]);
  const read = (
    await db.query<{ v: { data: { academic: typeof defaultAcademicData } } }>(
      "select public.load_journey_backup() as v",
    )
  ).rows[0]?.v.data.academic;
  expect(read?.records).toHaveLength(data.academic.records.length);
  expect(read?.records.find((r) => r.id === data.academic.records[0]?.id)).toEqual(
    data.academic.records[0],
  );
  const firstRecord = data.academic.records[0];
  if (!firstRecord) throw new Error("missing record");
  data.academic.records[0] = {
    ...firstRecord,
    recognition: "VERIFIED" as "UNVERIFIED",
  };
  await expect(
    db.query("select public.save_journey_backup($1::jsonb,'[]',$2)", [
      JSON.stringify(data),
      current + 1,
    ]),
  ).rejects.toThrow();
  await actor(bob);
  expect((await db.query("select * from public.journey_academic_records")).rows).toHaveLength(0);
});
