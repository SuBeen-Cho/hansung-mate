import type { SupabaseClient } from "@supabase/supabase-js";
import { validAcademicData } from "./AcademicData";
import type { Database, Json } from "./database.types";
import { archiveDocument, documentHash, readDocument } from "./documents";
import type { DemoState } from "./model";
export const cloudConfigured =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client: Promise<SupabaseClient<Database>> | undefined;
export function cloudClient() {
  if (!cloudConfigured) throw new Error("계정 저장 연결을 준비 중이에요.");
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient<Database>(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
  return client;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Cloud and exported input must not be mistaken for a verified institutional record. */
export function isDemoBackup(value: unknown): value is DemoState {
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    !isRecord(value.profile) ||
    !Array.isArray(value.plans) ||
    !Array.isArray(value.bookings)
  )
    return false;
  if (value.academic !== undefined && !validAcademicData(value.academic)) return false;
  const p = value.profile;
  if (
    !["name", "studentId", "track1", "track2", "optional"].every(
      (key) => typeof p[key] === "string",
    ) ||
    !Number.isInteger(p.entryYear) ||
    !Number.isInteger(p.year) ||
    Number(p.year) < 1 ||
    Number(p.year) > 6 ||
    (p.semester !== undefined && ![1, 2].includes(Number(p.semester)))
  )
    return false;
  const validId = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9:_-]{1,180}$/.test(id);
  const plans = value.plans.every(
    (plan) =>
      isRecord(plan) &&
      validId(plan.id) &&
      plan.mode === "DEMO" &&
      ["name", "track1", "track2", "optional", "createdAt"].every(
        (key) => typeof plan[key] === "string",
      ) &&
      Array.isArray(plan.items) &&
      plan.items.every(
        (item) =>
          isRecord(item) &&
          typeof item.code === "string" &&
          /^[1-6]-[12]$/.test(String(item.term)) &&
          [1, 2].includes(Number(item.track)),
      ),
  );
  const bookings = value.bookings.every(
    (b) =>
      isRecord(b) &&
      validId(b.id) &&
      b.mode === "DEMO" &&
      ["INSTANT", "ROOM", "NIGHT", "EXAM"].includes(String(b.kind)) &&
      [
        "REVIEW",
        "CHANGES",
        "APPROVED",
        "CHECKED_IN",
        "CHECKED_OUT",
        "CANCELLED",
        "REJECTED",
        "EXPIRED",
        "NO_SHOW",
      ].includes(String(b.stage)) &&
      [
        "spaceId",
        "space",
        "date",
        "endDate",
        "start",
        "end",
        "purpose",
        "applicant",
        "studentId",
        "department",
        "phone",
        "professor",
        "signature",
        "note",
      ].every((key) => typeof b[key] === "string") &&
      Number.isInteger(b.count) &&
      Number.isInteger(b.revision) &&
      Number(b.revision) > 0 &&
      Array.isArray(b.members) &&
      b.members.every(
        (m) =>
          isRecord(m) &&
          ["id", "name", "studentId", "department"].every((key) => typeof m[key] === "string"),
      ) &&
      Array.isArray(b.events) &&
      b.events.every(
        (e) => isRecord(e) && typeof e.label === "string" && typeof e.at === "string",
      ) &&
      (b.revisions === undefined ||
        (Array.isArray(b.revisions) &&
          b.revisions.every(
            (r) =>
              isRecord(r) &&
              validId(r.documentId) &&
              r.documentId === `${b.id}:r${r.revision}` &&
              /^[a-f0-9]{64}$/.test(String(r.sha256)) &&
              isRecord(r.fields) &&
              Array.isArray(r.fields.members),
          ))),
  );
  return plans && bookings;
}
export type CloudBackup = { version: number; savedAt: string; data: DemoState };
export async function loadCloudBackup(): Promise<CloudBackup | null> {
  const db = await cloudClient();
  const { data, error } = await db.rpc("load_journey_backup");
  if (error) throw error;
  if (!data) return null;
  if (
    !isRecord(data) ||
    typeof data.version !== "number" ||
    !Number.isInteger(data.version) ||
    typeof data.savedAt !== "string" ||
    !isDemoBackup(data.data)
  )
    throw new Error("계정에 저장된 데이터 형식이 올바르지 않아요.");
  return { version: data.version, savedAt: data.savedAt, data: data.data };
}
function pathFor(owner: string, id: string) {
  return `${owner}/${id.replaceAll(":", "_")}.pdf`;
}
export async function saveCloudBackup(state: DemoState, expectedVersion: number) {
  if (!isDemoBackup(state)) throw new Error("백업할 데모 데이터 형식을 확인해 주세요.");
  const db = await cloudClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) throw new Error("다시 로그인해 주세요.");
  const documents = [];
  for (const booking of state.bookings)
    for (const revision of booking.revisions ?? []) {
      const path = pathFor(user.id, revision.documentId);
      const existing = await db
        .from("journey_documents")
        .select("sha256")
        .eq("user_id", user.id)
        .eq("id", revision.documentId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data && existing.data.sha256 !== revision.sha256)
        throw new Error("계정의 문서 버전과 충돌해요.");
      if (!existing.data) {
        const doc = await readDocument(revision.documentId);
        if (!doc)
          throw new Error(
            `${revision.revision}차 PDF가 이 기기에 없어요. 원래 기기에서 먼저 백업해 주세요.`,
          );
        if ((await documentHash(doc.bytes)) !== revision.sha256)
          throw new Error("문서 무결성 확인에 실패했어요.");
        const upload = await db.storage
          .from("journey-private-documents")
          .upload(path, doc.bytes, { contentType: "application/pdf", upsert: false });
        if (upload.error) {
          const prior = await db.storage.from("journey-private-documents").download(path);
          if (
            prior.error ||
            !prior.data ||
            (await documentHash(new Uint8Array(await prior.data.arrayBuffer()))) !== revision.sha256
          )
            throw upload.error;
        }
      }
      documents.push({ id: revision.documentId, sha256: revision.sha256, storage_path: path });
    }
  const { error } = await db.rpc("save_journey_backup", {
    p_data: state,
    p_documents: documents,
    p_expected_version: expectedVersion,
  });
  if (error) throw error;
  return loadCloudBackup();
}
export async function restoreCloudDocuments(state: DemoState) {
  const db = await cloudClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("다시 로그인해 주세요.");
  for (const b of state.bookings)
    for (const r of b.revisions ?? []) {
      const { data, error } = await db.storage
        .from("journey-private-documents")
        .download(pathFor(user.id, r.documentId));
      if (error || !data) throw error ?? new Error("문서를 찾을 수 없어요.");
      const bytes = new Uint8Array(await data.arrayBuffer());
      if ((await documentHash(bytes)) !== r.sha256) throw new Error("문서 무결성 확인 실패");
      const archived = await archiveDocument(r.documentId, bytes);
      r.storage = archived.storage;
    }
}
/** Shared review workflow (account mode). Local demo flows keep working without it. */
export type CloudApplication = {
  id: string;
  client_id: string;
  kind: string;
  space_name: string;
  starts_at: string;
  ends_at: string;
  head_count: number;
  stage: string;
  revision: number;
  reviewer_note: string;
  document_path: string | null;
  payload: Record<string, unknown>;
};
async function signedInClient() {
  const db = await cloudClient();
  const { data } = await db.auth.getSession();
  return data.session ? db : null;
}
export async function amISpaceReviewer(): Promise<boolean> {
  if (!cloudConfigured) return false;
  const db = await signedInClient();
  if (!db) return false;
  const { data, error } = await db.rpc("is_space_reviewer");
  if (error) throw error;
  return data === true;
}
/** Mirrors a submitted booking to the shared queue when the student is signed in. */
export async function submitCloudApplication(booking: DemoState["bookings"][number]) {
  if (!cloudConfigured) return null;
  const db = await signedInClient();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const latest = booking.revisions?.at(-1);
  const documentPath = latest ? pathFor(user.id, latest.documentId) : null;
  if (latest) {
    const doc = await readDocument(latest.documentId);
    if (doc) {
      const upload = await db.storage
        .from("journey-private-documents")
        .upload(documentPath as string, doc.bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upload.error && !/exists/i.test(upload.error.message)) throw upload.error;
    }
  }
  const { data, error } = await db.rpc("submit_space_application", {
    p_client_id: booking.id,
    p_payload: booking as unknown as Json,
    p_document_path: documentPath,
    p_document_sha256: latest?.sha256 ?? null,
  });
  if (error) throw error;
  return data as string;
}
export async function loadReviewQueue(stage: string): Promise<CloudApplication[]> {
  const db = await signedInClient();
  if (!db) return [];
  let query = db
    .from("space_applications")
    .select(
      "id,client_id,kind,space_name,starts_at,ends_at,head_count,stage,revision,reviewer_note,document_path,payload",
    )
    .order("starts_at", { ascending: true })
    .limit(200);
  if (stage !== "ALL") query = query.eq("stage", stage);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CloudApplication[];
}
export async function reviewCloudApplication(
  app: CloudApplication,
  action: "APPROVE" | "REQUEST_CHANGES" | "REJECT",
  note: string,
) {
  const db = await cloudClient();
  const { data, error } = await db.rpc("review_space_application", {
    p_id: app.id,
    p_action: action,
    p_note: note,
    p_expected_revision: app.revision,
  });
  if (error) throw error;
  return data as string;
}
export async function openCloudDocument(app: CloudApplication) {
  if (!app.document_path) throw new Error("첨부된 신청서가 없어요.");
  const db = await cloudClient();
  const { data, error } = await db.storage
    .from("journey-private-documents")
    .createSignedUrl(app.document_path, 120);
  if (error || !data) throw error ?? new Error("문서를 열 수 없어요.");
  return data.signedUrl;
}
