import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import type { Booking } from "./model";

export async function createApplicationPdf(
  booking: Booking,
  assets?: { template: Uint8Array; font: Uint8Array },
) {
  if (!["ROOM", "NIGHT"].includes(booking.kind))
    throw new Error("이 예약에는 공식 신청서가 필요하지 않아요.");
  const template = booking.kind === "NIGHT" ? "overnight" : "classroom";
  const read = async (name: string) => {
    const response = await fetch(`${import.meta.env.BASE_URL}templates/${name}`);
    if (!response.ok) throw new Error("양식을 불러오지 못했어요. 다시 시도해 주세요.");
    return new Uint8Array(await response.arrayBuffer());
  };
  const [templateBytes, fontBytes] = assets
    ? [assets.template, assets.font]
    : await Promise.all([
        read(`${template}.pdf`),
        read("NotoSansKR-Regular.ttf.gz").then(
          async (compressed) =>
            new Uint8Array(
              await new Response(
                new Blob([compressed as BlobPart])
                  .stream()
                  .pipeThrough(new DecompressionStream("gzip")),
              ).arrayBuffer(),
            ),
        ),
      ]);
  const pdf = await PDFDocument.load(templateBytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const page = pdf.getPage(0);
  const height = page.getHeight();
  const supported = new Set(font.getCharacterSet());
  if (pdf.getPageCount() !== 1 || Math.abs(page.getWidth() - 595) > 1 || Math.abs(height - 842) > 1)
    throw new Error("양식 버전이 달라요. 서식 매핑을 다시 확인해야 해요.");
  function field(text: string, x: number, top: number, width: number, size = 9) {
    const safe = text.normalize("NFC").replace(/[\r\n]+/g, " ");
    if ([...safe].some((char) => !supported.has(char.codePointAt(0) ?? 0)))
      throw new Error("서류 글꼴에서 지원하지 않는 문자가 있어요. 특수문자를 확인해 주세요.");
    let actual = size;
    while (font.widthOfTextAtSize(safe, actual) > width && actual > 7) actual -= 0.25;
    if (font.widthOfTextAtSize(safe, actual) > width)
      throw new Error(
        `서류 칸에 들어가지 않는 항목이 있어요: ${safe.slice(0, 20)}. 내용을 줄여 주세요.`,
      );
    page.drawText(safe, {
      x,
      y: height - top - actual,
      size: actual,
      font,
      color: rgb(0.05, 0.16, 0.3),
    });
  }
  async function signature(
    x: number,
    bottom: number,
    width: number,
    height: number,
    data = booking.signature,
  ) {
    if (!data) return;
    const png = await pdf.embedPng(data);
    const fitted = png.scaleToFit(width, height);
    page.drawImage(png, {
      x: x + (width - fitted.width) / 2,
      y: bottom + (height - fitted.height) / 2,
      ...fitted,
    });
  }
  field("데모 신청서 · 실제 학교 제출/승인 효력 없음", 55, 9, 490, 9);
  if (booking.kind === "ROOM") {
    field(booking.department, 170, 168, 120);
    field(booking.space, 384, 168, 114);
    field(booking.applicant, 170, 203, 64);
    field(booking.studentId, 170, 228, 122);
    field(booking.phone, 384, 228, 114);
    field(booking.date, 170, 264, 322);
    field(`${booking.start} ~ ${booking.end}`, 170, 313, 322);
    field(String(booking.count), 213, 348, 36);
    field(booking.purpose, 170, 383, 325);
    field(`신청 ${booking.id.slice(0, 18)} · 수정 ${booking.revision}차`, 170, 438, 325, 8);
    field("담당자 승인과 지도교수 확인은 별도로 진행합니다.", 170, 455, 325, 8);
    await signature(239, height - 218, 33, 17);
  } else {
    field(booking.purpose, 109, 75, 226);
    // 건물명 / 호실 are separate boxes on the official night-stay form.
    const room = booking.space.match(/^(\S+관) (\S+)$/);
    field(room ? (room[1] ?? "") : booking.space, 397, 76, 48);
    field(room ? (room[2] ?? "") : "데모", 497, 76, 36);
    field(booking.department, 109, 98, 70);
    field(booking.applicant, 234, 98, 101);
    field(booking.studentId, 109, 120, 70);
    field(booking.phone, 234, 120, 101);
    const [year, month, day] = booking.date.split("-");
    const [, endMonth, endDay] = booking.endDate.split("-");
    field(year ?? "", 408, 33, 25, 8);
    field(month ?? "", 457, 33, 15, 8);
    field(day ?? "", 498, 33, 15, 8);
    field(endMonth ?? "", 457, 44, 15, 8);
    field(endDay ?? "", 498, 44, 15, 8);
    field(booking.start, 429, 55, 35, 8);
    field(booking.end, 486, 55, 40, 8);
    for (const [i, m] of booking.members.entries()) {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const y = 235 + row * 16.55;
      const dx = col * 242;
      field(m.department, 61 + dx, y, 70, 8);
      field(m.studentId, 140 + dx, y, 74, 8);
      // A teammate who signed on their own phone gets the signature next to the name.
      field(m.name, 222 + dx, y, m.signature ? 32 : 69, 8);
      if (m.signature) await signature(255 + dx, height - y - 14.5, 38, 15, m.signature);
    }
    // 신청일 (년 월 일) under the pledge, in Korea time.
    const [sy, sm, sd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
      .format(new Date())
      .split("-");
    field(sy ?? "", 222, 364, 32, 9);
    field(String(Number(sm)), 282, 364, 16, 9);
    field(String(Number(sd)), 327, 364, 16, 9);
    field(booking.applicant, 407, 386, 60, 9);
    await signature(470, height - 396, 32, 19);
    field(
      "아래 허가서 영역은 담당자 발급용입니다. 이 데모는 기관 직인·승인을 생성하지 않습니다.",
      55,
      812,
      490,
      8,
    );
  }
  pdf.setTitle(`한성 메이트 데모 신청서 ${booking.id}`);
  return new Uint8Array(await pdf.save());
}
export function downloadPdf(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
