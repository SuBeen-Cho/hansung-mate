"""Parse the official 2026-2 timetable PDF into per-course offerings.

Input : data/sources/hansung-2026-2/2026-2_강의시간표_교양교육과정_260904.pdf (school-distributed)
Output: data/normalized/offerings-2026-2.json

Stores which course codes open in 2026-2 with name, 구분, 학점, 학년, section count and the
timetable group (교양 영역 or 트랙·학과). Instructor names, rooms and times are NOT stored.

Run: python3 -I scripts/build-offerings.py   (needs pdfplumber)
"""

import json
import re
from collections import OrderedDict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "data/sources/hansung-2026-2/2026-2_강의시간표_교양교육과정_260904.pdf"
REF = ROOT / "data/normalized/reference.json"
OUT = ROOT / "data/normalized/offerings-2026-2.json"

ref = json.loads(REF.read_text(encoding="utf-8"))


def norm(s):
    return re.sub(r"[\s·ㆍ‧&/()\-]", "", s or "")


program_names = {}
for p in ref["programs"]:
    for n in [p["name"], *p.get("aliases", [])]:
        program_names[norm(n)] = p["name"]
catalog_names = {c["code"]: c["name"] for c in ref["courses"]}

CODE = re.compile(r"^[A-Z]{1,3}[0-9][0-9A-Z]{3,6}$")
CATS = {"교필", "선필교", "일교", "전필", "전선", "전기", "일선", "교선"}


def clean(cell):
    return re.sub(r"\s+", " ", (cell or "").replace("\n", " ")).strip()


def program_from_text(text):
    for line in (text or "").splitlines()[:3]:
        key = norm(line)
        if key in program_names:
            return program_names[key]
    return None


def classify_title(label):
    """Only known timetable section titles become groups; anything else (e.g. split names) is ignored."""
    if program_from_text(label):
        return None
    rules = [
        (r"^교양필수", ("LIBERAL", "교양필수")),
        (r"^과목군\s*(인문학적|사회과학적|과학기술|예술과 스포츠|융합적) 상상력", None),
        (r"^선택필수교양 영어트랙", ("LIBERAL", "선택필수교양·영어트랙")),
        (r"^선택필수교양 한국어", ("LIBERAL", "선택필수교양·한국어 집중")),
        (r"^일반교양", ("LIBERAL", "일반교양")),
        (r"^미래플러스", ("LIBERAL", "미래플러스대학 교양")),
        (r"^트랙제 이전 (\S+)", None),
        (r"^Micro Degree", ("CONVERGENCE", "마이크로디그리")),
        (r"^SW 연계전공", ("CONVERGENCE", "SW 연계전공")),
        (r"^창의융합 교육지원", ("CONVERGENCE", "창의융합교육(융합기초·선택·교양)")),
    ]
    for pattern, value in rules:
        m = re.match(pattern, label)
        if not m:
            continue
        if value:
            return value
        if pattern.startswith("^과목군"):
            return ("LIBERAL", f"선택필수교양·{m.group(1)} 상상력")
        return ("LEGACY", f"트랙제 이전 {m.group(1)}")
    return None


offerings = OrderedDict()
group = None
for page in pdfplumber.open(PDF).pages:
    text = page.extract_text() or ""
    lines = [l.strip() for l in text.splitlines()]
    found = program_from_text(text)
    if found:
        group = ("PROGRAM", found)
    header_idx = [i for i, l in enumerate(lines) if l.startswith("학년 구분")]
    nameless = 0
    for table in page.extract_tables():
        if not table:
            continue
        first = [clean(c) for c in table[0]]
        if len(first) == 2 and first[0] and "과목코드" not in first:
            # Title boxes such as ['교양필수','1학년'], ['선택필수교양','한국어 집중 과목군'].
            label = " ".join(x for x in first if x)
            known = classify_title(label)
            if known:
                group = known
            continue
        if "과목코드" not in first:
            continue
        col = {name: first.index(name) for name in first if name}
        code_i = col["과목코드"]
        name_i = col.get("교과목명")
        cat_i = col.get("구분")
        year_i = col.get("학년")
        credit_i = col.get("학점")
        heading = None
        if name_i is None:
            # Liberal tables put the course name on the line above the header row.
            if nameless < len(header_idx) and header_idx[nameless] > 0:
                heading = lines[header_idx[nameless] - 1]
            nameless += 1
        state = {"code": None, "name": heading, "cat": None, "year": None, "credit": None}
        for row in table[1:]:
            cells = [clean(c) for c in row] + [""] * (len(first) - len(row))
            code = cells[code_i]
            if CODE.match(code):
                state["code"] = code
                if name_i is not None and cells[name_i]:
                    state["name"] = cells[name_i]
            if cat_i is not None and cells[cat_i]:
                joined = cells[cat_i].replace(" ", "")
                if joined in CATS:
                    state["cat"] = joined
            if year_i is not None and cells[year_i]:
                state["year"] = cells[year_i]
            if credit_i is not None and re.fullmatch(r"\d(\.\d)?", cells[credit_i] or ""):
                state["credit"] = float(cells[credit_i])
            if not state["code"] or group is None:
                continue
            key = (group, state["code"])
            entry = offerings.setdefault(
                key,
                {
                    "kind": group[0],
                    "group": group[1],
                    "code": state["code"],
                    "name": None,
                    "category": None,
                    "year": None,
                    "credit": None,
                    "sections": 0,
                },
            )
            for k_src, k_dst in (("name", "name"), ("cat", "category"), ("year", "year"), ("credit", "credit")):
                if entry[k_dst] is None and state[k_src] is not None:
                    entry[k_dst] = state[k_src]
            entry["sections"] += 1

rows = list(offerings.values())
for r in rows:
    if not r["name"] and r["code"] in catalog_names:
        r["name"] = catalog_names[r["code"]]
codes = {r["code"] for r in rows}
result = {
    "term": "2026-2",
    "source": "2026학년도 2학기 강의시간표(2026-09-04 기준, 학교 배포 PDF)",
    "sourceFile": str(PDF.relative_to(ROOT)),
    "note": "개설 여부·구분·학점·분반 수만 저장. 교수명·강의실·시간은 저장하지 않음. 이후 개설 변경은 반영되지 않을 수 있음.",
    "summary": {
        "rows": len(rows),
        "uniqueCodes": len(codes),
        "programGroups": len({r["group"] for r in rows if r["kind"] == "PROGRAM"}),
        "groups": sorted({f'{r["kind"]}:{r["group"]}' for r in rows if r["kind"] != "PROGRAM"}),
        "withoutName": sum(1 for r in rows if not r["name"]),
        "withoutCredit": sum(1 for r in rows if r["credit"] is None),
    },
    "offerings": rows,
}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(json.dumps(result["summary"], ensure_ascii=False))
