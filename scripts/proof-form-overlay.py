#!/usr/bin/env python3
"""Non-production layout proof using supplied PDF templates and synthetic data.

pip install pymupdf reportlab pypdf numpy
python scripts/proof-form-overlay.py --templates /path/to/templates --out /path/to/output

Does not submit forms, apply an official signature, or implement an approval flow.
Original templates and outputs must not be committed to the repository.
"""
import argparse
import hashlib
import io
import json
import pathlib
import unicodedata

import fitz
import numpy as np
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def field(name, rect, text, size=10):
    return {"name": name, "rect": rect, "text": text, "size": size}


def mappings():
    classroom = [
        field("department", [168, 161, 293, 183], "가상학과"),
        field("space", [382, 161, 500, 183], "시연 강의실"),
        field("applicant", [168, 200, 263, 218], "예시학생"),
        field("student_id_year", [168, 223, 292, 242], "DEMO001 / 3학년"),
        field("phone", [382, 223, 500, 242], "010-0000-0000"),
        field("date", [168, 256, 495, 284], "2026. 10. 12."),
        field("time", [168, 306, 495, 332], "14:00 ~ 16:00"),
        field("participants", [211, 344, 253, 363], "5"),
        field("purpose", [168, 375, 498, 401], "통합 학생 앱 설계 회의 (가상 신청)"),
        field("notes", [168, 426, 498, 482], "서식 보존 검증용입니다.\n실제 예약이나 제출은 진행하지 않습니다."),
    ]
    facility = [
        field("date", [142, 243, 318, 255], "2026. 10. 12.", 8),
        field("time", [389, 243, 487, 255], "14:00 ~ 16:00", 8),
        field("event", [142, 256, 487, 268], "통합 학생 앱 설계 회의 (가상)", 8),
        field("participants", [142, 269, 487, 280], "5명", 8),
        field("department", [262, 283, 380, 293], "가상학과", 7.5),
        field("student_id", [424, 283, 487, 293], "DEMO001", 7.5),
        field("applicant", [225, 296, 337, 306], "예시학생", 7.5),
        field("phone", [425, 296, 487, 306], "010-0000-0000", 7.5),
        field("notes", [142, 470, 487, 480], "서식 검증용 가상 정보 · 제출용 아님", 7.5),
    ]
    roster = []
    for i, y in enumerate([177, 198, 220, 242, 265]):
        roster.extend([
            field(f"student_{i}", [128, y, 210, y + 17], f"DEMO00{i+1}", 9),
            field(f"name_{i}", [218, y, 296, y + 17], f"가상학생{i+1}", 9),
        ])
    roster.append(field("representative_phone", [306, 177, 401, 194], "010-0000-0000", 9))
    overnight = [
        field("purpose", [107, 70, 337, 88], "프로젝트 설계 회의 (가상)", 9),
        field("building", [395, 70, 449, 88], "시연관", 9),
        field("room", [495, 70, 536, 88], "101", 9),
        field("department", [107, 93, 181, 110], "가상학과", 9),
        field("applicant", [232, 93, 337, 110], "예시학생", 9),
        field("student_id", [107, 115, 181, 132], "DEMO001", 9),
        field("phone", [232, 115, 337, 132], "010-0000-0000", 9),
    ]
    for i in range(5):
        y = 234 + i * 16.55
        overnight.extend([
            field(f"affiliation_{i}", [59, y, 132, y+13], "가상학과", 8),
            field(f"student_{i}", [138, y, 216, y+13], f"DEMO00{i+1}", 8),
            field(f"name_{i}", [222, y, 294, y+13], f"가상학생{i+1}", 8),
        ])
    return [("classroom", "강의실", [classroom]),
            ("facility", "학교시설물", [facility, roster]),
            ("overnight", "학생_", [overnight])]


def validate_fit(f):
    x0, y0, x1, y1 = f["rect"]
    lines = f["text"].splitlines()
    if any(pdfmetrics.stringWidth(line, "ProofKorean", f["size"]) > x1-x0-4 for line in lines):
        raise ValueError(f"Text too wide: {f['name']}")
    if len(lines) * f["size"] * 1.2 > y1-y0-1:
        raise ValueError(f"Text too tall: {f['name']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--templates", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    font = args.out / "proof-korean.ttf"
    font.write_bytes(fitz.Font("korea").buffer)
    pdfmetrics.registerFont(TTFont("ProofKorean", str(font)))
    writer = PdfWriter()
    source_pages = []
    report = {"status": "layout_proof_only", "data": "synthetic", "templates": [], "pages": []}
    field_maps = []
    for key, prefix, maps in mappings():
        candidates = [p for p in args.templates.glob("*.pdf")
                      if unicodedata.normalize("NFC", p.name).startswith(prefix)]
        if len(candidates) != 1:
            raise ValueError(f"Expected one {prefix} template, got {len(candidates)}")
        path = candidates[0]
        raw = path.read_bytes()
        reader = PdfReader(io.BytesIO(raw))
        original = fitz.open(stream=raw, filetype="pdf")
        if len(reader.pages) != len(maps):
            raise ValueError("Template page count changed; review field mapping")
        report["templates"].append({"key": key, "sha256": hashlib.sha256(raw).hexdigest(),
                                     "pages": len(maps), "fillable_widgets": sum(len(list(p.widgets())) for p in original)})
        for page_index, fields in enumerate(maps):
            page = reader.pages[page_index]
            w, h = float(page.mediabox.width), float(page.mediabox.height)
            fields = fields + [field("demo_label", [56, 8, w-45, 24], "서식 보존 테스트 · 가상 정보 · 제출용 아님", 9)]
            data = io.BytesIO()
            overlay = canvas.Canvas(data, pagesize=(w, h))
            for f in fields:
                validate_fit(f)
                overlay.setFont("ProofKorean", f["size"])
                overlay.setFillColorRGB(0.08, 0.22, 0.43)
                x0, y0, x1, y1 = f["rect"]
                lines = f["text"].splitlines()
                top = y0 + ((y1-y0)-len(lines)*f["size"]*1.2)/2
                for line_index, line in enumerate(lines):
                    overlay.drawString(x0+2, h-top-f["size"]-line_index*f["size"]*1.2, line)
            overlay.showPage()
            overlay.save()
            page.merge_page(PdfReader(io.BytesIO(data.getvalue())).pages[0])
            writer.add_page(page)
            source_pages.append((key, page_index, original[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False), (w,h), fields))
            field_maps.append({"template":key,"page":page_index+1,"size_pt":[w,h],"fields":fields})
    output = args.out / "Hansung_Form_Layout_Proof.pdf"
    with output.open("wb") as f:
        writer.write(f)
    result = fitz.open(output)
    for index, (key, original_index, before, size, fields) in enumerate(source_pages):
        page = result[index]
        assert (page.rect.width, page.rect.height) == size
        after = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        a = np.frombuffer(before.samples, dtype=np.uint8).reshape(before.height, before.width, 3)
        b = np.frombuffer(after.samples, dtype=np.uint8).reshape(after.height, after.width, 3)
        allowed = np.zeros((before.height, before.width), dtype=bool)
        for f in fields:
            x0,y0,x1,y1=f["rect"]
            allowed[max(0,int(y0*2)-2):int(y1*2)+2,max(0,int(x0*2)-2):int(x1*2)+2]=True
        changed = np.any(a != b, axis=2)
        outside = int((changed & ~allowed).sum())
        assert outside == 0, (key, original_index, outside)
        # Every synthetic field should appear in extracted text (whitespace normalized).
        normalized = "".join(page.get_text().split())
        assert all("".join(f["text"].split()) in normalized for f in fields)
        page.get_pixmap(matrix=fitz.Matrix(1.3,1.3), alpha=False).save(args.out/f"proof-page-{index+1}.png")
        report["pages"].append({"template":key,"page":original_index+1,"size_pt":list(size),
                                 "mapped_fields":len(fields)-1,"changed_pixels_outside_fields_at_144dpi":outside,
                                 "text_extraction":"passed","text_fit":"passed"})
    try:
        validate_fit(field("overflow_guard", [0,0,20,12], "이 문장은 지정된 칸보다 길어서 거절되어야 합니다", 9))
    except ValueError:
        report["overflow_guard"] = "passed_rejected_oversized_input"
    else:
        raise AssertionError("Oversized input was accepted")
    report["limitations"] = ["No electronic-signature capture tested", "Not all form fields are mapped", "Approval and permit sections remain blank", "Only these exact template hashes are verified", "No browser/mobile preview or official submission tested", "No HWP conversion tested"]
    (args.out/"form-layout-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    (args.out/"form-layout-mappings.json").write_text(json.dumps(field_maps,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"pdf":str(output),"pages":len(result),"mapped_fields":sum(p["mapped_fields"] for p in report["pages"]),"outside_changes":sum(p["changed_pixels_outside_fields_at_144dpi"] for p in report["pages"]),"overflow_guard":report["overflow_guard"]},ensure_ascii=False))


if __name__ == "__main__":
    main()
