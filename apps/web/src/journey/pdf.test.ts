// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Booking } from "./model";
import { createApplicationPdf } from "./pdf";

const fixture: Booking = {
  id: "DEMO-PDF-PROOF",
  mode: "DEMO",
  kind: "ROOM",
  spaceId: "classroom",
  space: "상상관 데모실",
  date: "2026-10-07",
  endDate: "2026-10-07",
  start: "17:00",
  end: "19:00",
  purpose: "졸업 작품 설계 회의",
  count: 5,
  applicant: "예시학생",
  studentId: "DEMO001",
  department: "웹공학트랙",
  phone: "010-0000-0000",
  professor: "",
  members: [1, 2, 3, 4, 5].map((n) => ({
    id: String(n),
    name: `학생${n}`,
    studentId: `D00${n}`,
    department: "웹공학트랙",
  })),
  signature: "",
  stage: "REVIEW",
  revision: 1,
  note: "",
  events: [],
  reminder: false,
};
// 1x1 transparent PNG standing in for a teammate's phone signature.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const assets = (name: string) => ({
  template: new Uint8Array(readFileSync(resolve(`public/templates/${name}.pdf`))),
  font: new Uint8Array(
    gunzipSync(readFileSync(resolve("public/templates/NotoSansKR-Regular.ttf.gz"))),
  ),
});
describe("공식 원본 PDF 위 입력", () => {
  it("강의실·야간 원본의 페이지 크기와 개수를 유지하고 입력 내용을 만든다", async () => {
    for (const kind of ["ROOM", "NIGHT"] as const) {
      const bytes = await createApplicationPdf(
        { ...fixture, kind, endDate: kind === "NIGHT" ? "2026-10-08" : fixture.date },
        assets(kind === "ROOM" ? "classroom" : "overnight"),
      );
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
      const out = resolve("../../reports/runtime-pdf-proof");
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, `${kind.toLowerCase()}.pdf`), bytes);
    }
  }, 15000);
  it("칸을 넘는 문자열은 잘라내지 않고 오류로 돌려준다", async () => {
    await expect(
      createApplicationPdf(
        { ...fixture, purpose: "아주 긴 사용 목적 ".repeat(50) },
        assets("classroom"),
      ),
    ).rejects.toThrow("서류 칸");
  }, 15000);
  it("강의실은 건물·호실로 짧게 넣어 칸에 들어가고, 예전 긴 이름은 막힌다", async () => {
    const bytes = await createApplicationPdf(
      { ...fixture, space: "미래관 304호" },
      assets("classroom"),
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    await expect(
      createApplicationPdf(
        { ...fixture, space: "강의실 (미래관·우촌관·탐구관·진리관)" },
        assets("classroom"),
      ),
    ).rejects.toThrow("서류 칸");
  }, 15000);
  it("강의실 야간잔류도 호실 이름이 야간 신청서 장소 칸에 들어간다", async () => {
    const bytes = await createApplicationPdf(
      {
        ...fixture,
        kind: "NIGHT",
        spaceId: "classroom-night",
        space: "탐구관 205호",
        endDate: "2026-10-08",
        members: fixture.members.map((m) => ({ ...m, signature: TINY_PNG })),
      },
      assets("overnight"),
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  }, 15000);
});
