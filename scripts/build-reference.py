#!/usr/bin/env python3
"""Build data/normalized/reference.json from the 2026-10-26 Hansung crawl.

Run from anywhere:  python3 -I scripts/build-reference.py

Inputs (read-only except for the one-time privacy sanitization below):
  data/raw/hansung-2026-10-26/curricula.json
  data/raw/hansung-2026-10-26/notices-pages.json
  data/normalized/catalog.json                       (previous catalog, unchanged)
  data/research/hansung-observations-2026-09-28.json

Privacy: admission result notices contain masked student numbers and masked
names. On the first run the script counts accepted students per destination
unit (aggregate counts only) into notice-result-aggregates.json, then rewrites
notices-pages.json without any roster row / masked token. Later runs find no
masked rows and read the stored aggregates, so the output is reproducible.
"""

import hashlib
import json
import os
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(os.environ.get("BUILD_REFERENCE_ROOT") or Path(__file__).resolve().parents[1])
RAW = ROOT / "data" / "raw" / "hansung-2026-10-26"
CURRICULA = RAW / "curricula.json"
NOTICES = RAW / "notices-pages.json"
NOTICES_SANITIZED = RAW / "notices-pages.sanitized.json"
AGGREGATES = RAW / "notice-result-aggregates.json"
CATALOG = ROOT / "data" / "normalized" / "catalog.json"
OBSERVATIONS = ROOT / "data" / "research" / "hansung-observations-2026-09-28.json"
OUTPUT = ROOT / "data" / "normalized" / "reference.json"

BASE = "https://www.hansung.ac.kr"
ACCESSED = "2026-10-26"
PREVIOUS = "PREVIOUS_CRAWL_2026-09-22"
CRAWLED = "CRAWLED_2026-10-26"
NO_TABLE = "NO_PUBLIC_TABLE"

MASKED_ID = re.compile(r"\d{2}\*{3}\d{2}|\*\*\d{5}")
MASKED_ID_WITH_NAME = re.compile(r"(?:\d{2}\*{3}\d{2}|\*\*\d{5})\s*[^\s|]*")
MASKED_NAME = re.compile(r"[가-힣A-Za-z]{1,3}\*[가-힣]{0,3}")
SPAN_MARK = re.compile(r"\{(?:rs|cs)\d+\}")


def article_url(aid):
    return f"{BASE}/bbs/hansung/2127/{aid}/artclView.do"


def clean(s):
    return re.sub(r"\s+", " ", SPAN_MARK.sub("", s or "")).strip()


def norm(s):
    s = re.sub(r"\s+", "", s or "")
    for ch in "ㆍ・･∙•․":
        s = s.replace(ch, "·")
    return s.lower()


def dot_variants(s):
    out = []
    for a, b in (("·", "ㆍ"), ("ㆍ", "·")):
        if a in s:
            out.append(s.replace(a, b))
    return out


def stable_hash(*parts):
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:8].upper()


def credit_milli(text):
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return int(round(float(m.group(1)) * 1000)) if m else None


def norm_category(text):
    s = re.sub(r"\s+", "", text or "")
    if s in ("전공기초", "전기"):
        return "전기"
    if s in ("전공필수", "전필"):
        return "전필"
    if s in ("전공선택", "전선") or s.startswith("전선(") or s.startswith("전공선택("):
        return "전선"
    if s in ("일반선택", "일선"):
        return "일선"
    return "미분류"


def truncate(text, limit):
    text = clean(text)
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    sp = cut.rfind(" ")
    if sp > limit * 0.6:
        cut = cut[:sp]
    return cut.rstrip(" ,.;:") + "…"


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


# --------------------------------------------------------------------------
# Privacy: aggregate admission result rosters, then sanitize the raw notices
# --------------------------------------------------------------------------

def roster_aggregates(article):
    header = None
    counts = OrderedDict()
    for table in article.get("tables") or []:
        for row in table:
            cells = [clean(c) for c in row]
            if any("학번" in c for c in cells) and not any(MASKED_ID.search(c) for c in cells):
                header = cells
                continue
            if not any(MASKED_ID.search(c) for c in cells):
                continue
            if header is None:
                raise SystemExit(f"roster row without header in article {article['id']}")
            idx = None
            for i, h in enumerate(header):
                hs = h.replace(" ", "")
                if "(후)" in hs or "모집단위" in hs:
                    idx = i
                    break
            if idx is None:
                raise SystemExit(f"no destination column in article {article['id']}: {header}")
            dest = cells[idx]
            counts[dest] = counts.get(dest, 0) + 1
    if not counts:
        return None
    return {
        "destinationColumn": header[idx],
        "acceptedByPublishedUnit": [{"toUnit": k, "accepted": v} for k, v in counts.items()],
        "totalAccepted": sum(counts.values()),
    }


def sanitize_notices():
    data = load(NOTICES)
    masked_articles = [a for a in data["articles"]
                       if MASKED_ID.search(a.get("text") or "")
                       or any(MASKED_ID.search(c) for t in a.get("tables") or [] for r in t for c in r)]
    if not masked_articles:
        if not AGGREGATES.exists():
            raise SystemExit("notices are sanitized but notice-result-aggregates.json is missing")
        return load(AGGREGATES), data
    aggregates = {"note": "Aggregate admission counts computed from roster tables before the roster rows "
                          "(masked student numbers and names) were removed from notices-pages.json.",
                  "articles": {}}
    for a in masked_articles:
        agg = roster_aggregates(a)
        if agg:
            aggregates["articles"][str(a["id"])] = agg
    with open(AGGREGATES, "w", encoding="utf-8") as fh:
        fh.write(dump(aggregates))
    roster_ids = {str(a["id"]) for a in masked_articles}

    def strip_text(text, roster):
        text = text or ""
        if roster:
            text = re.sub(r"(합격자\s*명단)[\s\S]*?(?=\*\s*문의사항|\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*교|첨부파일|$)",
                          r"\1 [개인별 명단 삭제: 단위별 합격 인원은 notice-result-aggregates.json] ", text, count=1)
        text = MASKED_ID_WITH_NAME.sub("", text)
        if roster:
            text = MASKED_NAME.sub("", text)
        return text

    for section in ("articles", "pages"):
        for item in data[section]:
            roster = str(item.get("id")) in roster_ids
            item["text"] = strip_text(item.get("text"), roster)
            item["tables"] = [[row for row in table if not any(MASKED_ID.search(c) for c in row)]
                              for table in item.get("tables") or []]
    with open(NOTICES_SANITIZED, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(NOTICES_SANITIZED, NOTICES)
    return aggregates, load(NOTICES)


# --------------------------------------------------------------------------
# Programs
# --------------------------------------------------------------------------

COLLEGES = [
    ("humanities-arts", "크리에이티브인문예술대학"),
    ("social-sciences", "미래융합사회과학대학"),
    ("design", "디자인대학"),
    ("it-engineering", "IT공과대학"),
    ("creative-convergence", "창의융합대학"),
    ("global-talent", "글로벌인재대학"),
    ("future-plus", "미래플러스대학"),
    ("liberal-arts", "상상력교양대학"),
]
SITE_COLLEGE = {"HmnArt": "크리에이티브인문예술대학", "SclScn": "미래융합사회과학대학", "Design": "디자인대학",
                "Engineering": "IT공과대학", "CreCon": "창의융합대학", "global": "글로벌인재대학",
                "futureplus": "미래플러스대학"}

# page -> (id, display name, kind, status). Pages sharing an id are merged.
REGISTRY = [
    ("/HmnArt/5572", "english-literature-culture", "영미문학문화트랙", "TRACK", "LEGACY"),
    ("/HmnArt/5579", "english-language-information", "영미언어정보트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5593", "literature-culture-content-track", "문학문화콘텐츠트랙", "TRACK", "LEGACY"),
    ("/HmnArt/5586", "korean-language-education", "한국어교육트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5615", "knowledge-information-culture", "지식정보문화트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5601", "glocal-history", "글로컬역사트랙", "TRACK", "LEGACY"),
    ("/HmnArt/5622", "digital-humanities-informatics", "디지털인문정보학트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5608", "history-culture-content", "역사문화콘텐츠트랙", "TRACK", "LEGACY"),
    ("/HmnArt/5629", "history-culture-curation", "역사문화큐레이션트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5636", "history-content", "역사콘텐츠트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5643", "anglo-american-culture-content", "영미문화콘텐츠트랙", "TRACK", "ACTIVE"),
    ("/HmnArt/5650", "oriental-painting", "동양화전공", "MAJOR", "ACTIVE"),
    ("/HmnArt/5657", "western-painting", "서양화전공", "MAJOR", "ACTIVE"),
    ("/HmnArt/5664", "korean-dance", "한국무용전공", "MAJOR", "ACTIVE"),
    ("/HmnArt/5671", "contemporary-dance", "현대무용전공", "MAJOR", "ACTIVE"),
    ("/HmnArt/5678", "ballet", "발레전공", "MAJOR", "ACTIVE"),
    ("/HmnArt/5685", "immigration-multiculture", "이민·다문화트랙", "TRACK", "LEGACY"),
    ("/SclScn/5262", "international-trade", "국제무역트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5269", "global-business", "글로벌비즈니스트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5276", "business-economic-analysis", "기업ㆍ경제분석트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5283", "economics-finance-investment", "경제금융투자트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5290", "finance-data-analysis", "금융·데이터분석트랙", "TRACK", "LEGACY"),
    ("/SclScn/5297", "public-administration", "공공행정트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5305", "law-policy", "법&정책트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5315", "real-estate", "부동산트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5323", "smart-city-transport-planning", "스마트도시ㆍ교통계획트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5330", "business-management", "기업경영트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5338", "business-analytics", "비즈니스애널리틱스트랙", "TRACK", "ACTIVE"),
    ("/SclScn/5346", "accounting-financial-management", "회계ㆍ재무경영트랙", "TRACK", "ACTIVE"),
    ("/Design/5105", "fashion-marketing", "패션마케팅트랙", "TRACK", "ACTIVE"),
    ("/Design/5112", "fashion-design", "패션디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5119", "fashion-creative-direction", "패션크리에이티브디렉션트랙", "TRACK", "ACTIVE"),
    ("/Design/5133", "video-animation-design", "영상ㆍ애니메이션디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5126", "media-design", "미디어디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5140", "product-service-design", "제품·서비스디자인트랙", "TRACK", "LEGACY"),
    ("/Design/5147", "visual-design", "시각디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5154", "vmd-exhibition-design", "VMDㆍ전시디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5161", "interior-design", "인테리어디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5175", "ux-ui-design", "UX/UI디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5168", "game-graphic-design", "게임그래픽디자인트랙", "TRACK", "ACTIVE"),
    ("/Design/5182", "beauty-design-management", "뷰티디자인매니지먼트학과", "DEPARTMENT", "ACTIVE"),
    ("/Design/5189", "beauty-management-contract", "뷰티매니지먼트학과(계약학과)", "CONTRACT", "CONTRACT"),
    ("/Engineering/4910", "web-engineering", "웹공학트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4889", "mobile-software", "모바일소프트웨어트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4903", "digital-content-vr", "디지털콘텐츠ㆍ가상현실트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4931", "mechanical-system-design", "기계시스템디자인트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4896", "big-data", "빅데이터트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4938", "ai-robot-convergence", "AI로봇융합트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4917", "electronics", "전자트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4924", "system-semiconductor", "시스템반도체트랙", "TRACK", "ACTIVE"),
    ("/Engineering/4945", "information-systems", "정보시스템트랙", "TRACK", "LEGACY"),
    ("/Engineering/4952", "mechanical-design", "기계설계트랙", "TRACK", "LEGACY"),
    ("/Engineering/4959", "mechanical-automation", "기계자동화트랙", "TRACK", "LEGACY"),
    ("/Engineering/4966", "intelligent-systems", "지능시스템트랙", "TRACK", "LEGACY"),
    ("/Engineering/4973", "iot", "사물인터넷트랙", "TRACK", "LEGACY"),
    ("/Engineering/4980", "cyber-security", "사이버보안트랙", "TRACK", "LEGACY"),
    ("/Engineering/4987", "ict-convergence-entertainment", "ICT융합엔터테인먼트트랙", "TRACK", "LEGACY"),
    ("/Engineering/4994", "industrial-engineering", "산업공학트랙", "TRACK", "ACTIVE"),
    ("/Engineering/5001", "systems-management-engineering", "시스템경영공학트랙", "TRACK", "LEGACY"),
    ("/Engineering/5008", "production-logistics-systems", "생산물류시스템트랙", "TRACK", "LEGACY"),
    ("/Engineering/5015", "consulting", "컨설팅트랙", "TRACK", "LEGACY"),
    ("/Engineering/5022", "applied-industrial-data-engineering", "응용산업데이터공학트랙", "TRACK", "ACTIVE"),
    ("/Engineering/5029", "smart-manufacturing-consulting-contract", "스마트제조혁신컨설팅학과(계약학과)", "CONTRACT", "CONTRACT"),
    ("/CreCon/2762", "self-designed-major", "자기설계전공", "SELF_DESIGNED", "ACTIVE"),
    ("/CreCon/2771", "literature-culture-content", "문학문화콘텐츠학과", "DEPARTMENT", "ACTIVE"),
    ("/CreCon/2779", "applied-ai", "AI응용학과", "DEPARTMENT", "ACTIVE"),
    ("/CreCon/2789", "convergence-security", "융합보안학과", "DEPARTMENT", "ACTIVE"),
    ("/CreCon/2798", "future-mobility", "미래모빌리티학과", "DEPARTMENT", "ACTIVE"),
    ("/CreCon/7500", "startup", "창업트랙", "TRACK", "ACTIVE"),
    ("/global/1513", "korean-language-culture-education", "한국언어문화교육학과", "DEPARTMENT", "ACTIVE"),
    ("/global/1518", "global-k-business", "글로벌K비즈니스학과", "DEPARTMENT", "ACTIVE"),
    ("/global/1523", "video-entertainment", "영상엔터테인먼트학과", "DEPARTMENT", "ACTIVE"),
    ("/global/1528", "fashion-beauty-creation", "패션뷰티크리에이션학과", "DEPARTMENT", "ACTIVE"),
    ("/global/1533", "sw-convergence", "SW융합학과", "DEPARTMENT", "ACTIVE"),
    ("/global/6809", "global-venture-startup", "글로벌벤처창업학과", "DEPARTMENT", "ACTIVE"),
    ("/futureplus/733", "convergence-administration", "융합행정학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/736", "hotel-foodservice-management", "호텔외식경영학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/742", "business-consulting", "비즈니스컨설팅학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/739", "beauty-design", "뷰티디자인학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/745", "ict-convergence-design", "ICT융합디자인학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/748", "ai-software", "AI·소프트웨어학과", "DEPARTMENT", "FUTUREPLUS"),
    ("/futureplus/751", "beauty-management-contract", "뷰티매니지먼트학과(계약학과)", "CONTRACT", "CONTRACT"),
    ("/futureplus/756", "digital-content-design-contract", "디지털콘텐츠디자인학과(계약학과)", "CONTRACT", "CONTRACT"),
    ("/futureplus/761", "interior-design-contract", "인테리어디자인학과(계약학과)", "CONTRACT", "CONTRACT"),
    ("/futureplus/766", "smart-manufacturing-consulting-contract", "스마트제조혁신컨설팅학과(계약학과)", "CONTRACT", "CONTRACT"),
]

CREATIVE_DEPARTMENTS = {"문학문화콘텐츠학과", "AI응용학과", "융합보안학과", "미래모빌리티학과"}
UNIT_OVERRIDE = {"창업트랙": None, "자기설계전공": "상상력인재학부"}
COLLEGE_OVERRIDE = {"beauty-management-contract": "미래플러스대학",
                    "smart-manufacturing-consulting-contract": "미래플러스대학"}
SLOT_NOTES = {
    "창업트랙": "2트랙으로만 선택 가능, 선발인원 제한 없음",
    "자기설계전공": "상상력인재학부 학생 중 창의융합전공설계 이수(중)자만 선택 가능",
    "글로벌벤처창업학과": "2026년 신설학과(트랙변경 불가). 글로벌인재대학 외국인 학생 대상",
}
GLOBAL_SLOT_NOTE = "글로벌인재대학 소속 외국인유학생만 선택 가능, 1트랙 학과의 모트랙은 2트랙 선택 불가"
CREATIVE_SLOT_NOTE = "타 단과대학(또는 창의융합대학 내 타 학과) 학생의 2트랙 선택은 주야별 모집정원 30% 이내 선발"


def page_key(href):
    return href.replace("/subview.do", "")


def build_programs(curricula, observations, catalog):
    pages = {page_key(p["href"]): p for p in curricula["programs"]}
    options = {norm(o["name"]): o for o in observations["program_options"]}
    catalog_names = {norm(t["name"]): t["name"] for t in catalog["tracks"]}
    stopped = parse_stopped_tracks()
    programs = OrderedDict()
    for key, pid, name, kind, status in REGISTRY:
        page = pages.pop(key)
        site = key.split("/")[1]
        label_parts = page["label"].split(">")
        label_name = label_parts[1].strip()
        prog = programs.get(pid)
        if prog is None:
            if norm(name) in catalog_names:
                name = catalog_names[norm(name)]
            bare = re.sub(r"(트랙|학과|전공)$", "", name)
            opt = None
            if status == "ACTIVE":
                opt = options.get(norm(name)) or options.get(norm(bare))
                if opt is None and kind == "DEPARTMENT":
                    opt = options.get(norm(bare + "학과"))
            unit = UNIT_OVERRIDE.get(name, label_parts[0].strip())
            if (site in ("global", "futureplus", "CreCon") or kind == "CONTRACT") and name not in UNIT_OVERRIDE:
                unit = name
            college = COLLEGE_OVERRIDE.get(pid, SITE_COLLEGE[site])
            aliases = set()
            for cand in [label_name, bare, opt["name"] if opt else None, name.replace("(계약학과)", ""),
                         label_name.replace(" ", "")]:
                if cand:
                    aliases.add(cand)
                    aliases.update(dot_variants(cand))
            aliases.update(dot_variants(name))
            session = None
            if opt:
                session = opt["offered_session"]
            elif status == "FUTUREPLUS":
                session = "EVENING"
            elif status == "LEGACY" and norm(name) in stopped:
                session = stopped[norm(name)]["session"]
            elif name == "글로벌벤처창업학과":
                session = "DAY"
            if kind == "TRACK":
                profile = "FUSION_TRACK"
            elif name in CREATIVE_DEPARTMENTS:
                profile = "CREATIVE_DEPARTMENT"
            elif kind in ("DEPARTMENT", "MAJOR") and status == "ACTIVE":
                profile = "DEPARTMENT"
            else:
                profile = "UNKNOWN"
            active = status == "ACTIVE"
            slot_note = SLOT_NOTES.get(name)
            if slot_note is None and college == "글로벌인재대학":
                slot_note = GLOBAL_SLOT_NOTE
            if slot_note is None and name in CREATIVE_DEPARTMENTS:
                slot_note = CREATIVE_SLOT_NOTE
            if status == "LEGACY":
                slot_note = "모집중지 트랙: 모집중지 이전 해당 트랙 과목 이수자만 학사운영팀 방문 상담 후 변경 가능"
            if status in ("FUTUREPLUS", "CONTRACT"):
                slot_note = "트랙선택 대상 아님(미래플러스대학·계약학과 별도 학사 운영)"
            prog = OrderedDict([
                ("id", pid),
                ("name", name),
                ("aliases", sorted(a for a in aliases if a != name and not (kind == "SELF_DESIGNED" and a == unit))),
                ("college", college),
                ("unit", unit),
                ("kind", kind),
                ("session", session),
                ("status", status),
                ("firstSlotAllowed", active and name != "창업트랙"),
                ("secondSlotAllowed", active and name != "글로벌벤처창업학과"),
                ("slotNote", slot_note),
                ("recruitmentStoppedFrom", stopped.get(norm(name), {}).get("term")),
                ("requirementProfile", profile),
                ("curriculumUrl", BASE + page["href"]),
                ("additionalCurriculumUrls", []),
                ("graduationUrl", None),
                ("graduationSummary", None),
                ("requirementNote", None),
                ("courseCount", 0),
                ("sourceStatus", NO_TABLE),
                ("_pages", []),
            ])
            programs[pid] = prog
        else:
            prog["additionalCurriculumUrls"].append(BASE + page["href"])
            for cand in [label_name, label_name.replace(" ", "")]:
                if cand != prog["name"] and cand not in prog["aliases"]:
                    prog["aliases"] = sorted(set(prog["aliases"]) | {cand})
        prog["_pages"].append(page)
    if pages:
        raise SystemExit(f"curriculum pages without registry entry: {sorted(pages)}")
    return programs


STOPPED_CACHE = {}


def parse_stopped_tracks():
    return STOPPED_CACHE


def load_stopped_tracks(notices):
    """모집중지 트랙 table in the 2026-2 트랙변경 notice."""
    art = next(a for a in notices["articles"] if a["id"] == 223374)
    table = next(t for t in art["tables"] if t and "모집중지" in clean(t[0][0]))
    term = None
    for row in table[1:]:
        cells = [clean(c) for c in row]
        if len(cells) == 2:
            m = re.match(r"(\d{4})학년도 (\d)학기", cells[0])
            term = f"{m.group(1)}-{m.group(2)}"
            track = cells[1]
        else:
            track = cells[0]
        m = re.match(r"(.+?트랙)((?:\((?:주|야)\))+)", track)
        name, marks = m.group(1), m.group(2)
        day, night = "(주)" in marks, "(야)" in marks
        session = "BOTH" if day and night else ("DAY" if day else None)
        STOPPED_CACHE[norm(name)] = {"term": term, "session": session, "marks": marks}
    # 한국어교육트랙 is still recruited (day); only the evening unit stopped in 2025-1.
    STOPPED_CACHE.pop(norm("한국어교육트랙"), None)


# --------------------------------------------------------------------------
# Courses
# --------------------------------------------------------------------------

def parse_year_semester(text):
    t = re.sub(r"\s+", "", text)
    m = re.match(r"(\d)학년(\d)학기", t)
    if m:
        return m.group(1), m.group(2)
    return None, None


def parse_module_term(yr):
    """'2-1', '1-1·2', '2-1계절', '4-미정' or a partner university name."""
    m = re.match(r"^(\d)-(.+)$", yr)
    if not m:
        return "미정", "미정", yr
    year, rest = m.group(1), m.group(2)
    if "계절" in rest:
        return year, "계절", None
    if rest == "미정":
        return year, "미정", None
    if rest in ("1", "2", "1·2"):
        return year, rest, None
    return year, "미정", None


def extract_rows(program, page):
    """Yield dicts: code, name, credit, category, categoryAsPublished, year, semester."""
    rows = []
    tables = page.get("tables") or []
    if not tables:
        return rows
    table = tables[0]
    header = [clean(h) for h in table[0]]
    if len(table) < 3 or "이수구분" in header:
        return rows
    if "학년" in header and "학기" in header:
        ci = {h: i for i, h in enumerate(header)}
        code_i = ci.get("교과목코드")
        for r in table[1:]:
            r = [clean(c) for c in r]
            if len(r) < len(header) - 2:
                continue
            cat_pub = r[ci["교과구분"]]
            rows.append({
                "code": r[code_i] if code_i is not None else None,
                "name": r[ci["교과목"]],
                "credit": credit_milli(r[ci["학점"]]),
                "categoryAsPublished": cat_pub,
                "category": norm_category(cat_pub),
                "year": r[ci["학년"]],
                "semester": r[ci["학기"]],
            })
        return rows
    if "교과목명" in header and "학년/학기" in header:
        ci = {h: i for i, h in enumerate(header)}
        for r in table[1:]:
            r = [clean(c) for c in r]
            cat_pub = r[ci["구분"]]
            if re.fullmatch(r"\d+", cat_pub):
                cat_pub = None
            year, sem = parse_year_semester(r[ci["학년/학기"]])
            rows.append({
                "code": None,
                "name": r[ci["교과목명"]],
                "credit": credit_milli(r[ci["학점"]]),
                "categoryAsPublished": cat_pub,
                "category": norm_category(cat_pub) if cat_pub else "미분류",
                "year": year or "미정",
                "semester": sem or "미정",
            })
        return rows
    raise SystemExit(f"unknown table format on {page['href']}: {header}")


def build_courses(programs, notices, catalog):
    catalog_by_track = {}
    for c in catalog["courses"]:
        for m in c["mappings"]:
            catalog_by_track.setdefault(m["track"], {})[norm(c["name"])] = c
    modules = {page_key(m["p"]): m["modules"] for m in notices["modules"]}
    courses = {}
    name_variants = {}

    def add(prog, code, code_source, name, credit, credit_verified, mapping):
        key = code
        course = courses.get(key)
        if course is None:
            course = OrderedDict([
                ("code", code), ("codeVerified", code_source == "PAGE"), ("codeSource", code_source),
                ("name", name), ("creditMilli", credit), ("creditVerified", credit_verified),
                ("mappings", []),
            ])
            courses[key] = course
        else:
            if name != course["name"]:
                name_variants.setdefault(key, set()).add(name)
            if credit_verified and not course["creditVerified"]:
                course["creditMilli"], course["creditVerified"] = credit, True
        dup_key = (mapping["program"], mapping["category"], mapping["recommendedYear"], mapping["semester"])
        for existing in course["mappings"]:
            if (existing["program"], existing["category"], existing["recommendedYear"], existing["semester"]) == dup_key:
                if mapping["module"] and mapping["module"] not in (existing["module"] or ""):
                    existing["module"] = (existing["module"] + " / " if existing["module"] else "") + mapping["module"]
                return
        course["mappings"].append(mapping)

    for prog in programs.values():
        for page in prog["_pages"]:
            url = BASE + page["href"]
            for row in extract_rows(prog, page):
                if row["code"]:
                    code, source = row["code"], "PAGE"
                else:
                    code, source = "NC-" + stable_hash(prog["name"], row["name"]), "SYNTHETIC"
                mapping = OrderedDict([
                    ("program", prog["name"]), ("programId", prog["id"]),
                    ("category", row["category"]), ("categoryAsPublished", row["categoryAsPublished"]),
                    ("recommendedYear", row["year"]), ("semester", row["semester"]),
                    ("termAsPublished", None), ("module", None), ("partnerUniversity", None),
                    ("codeMatchedByName", False), ("sourceUrl", url), ("sourceStatus", CRAWLED),
                ])
                add(prog, code, source, row["name"], row["credit"], row["credit"] is not None, mapping)

    # Module-style pages: match names to the previous catalog (same track) first, then to a unique
    # course name with a printed code in the current crawl.
    current_by_name = {}
    for c in courses.values():
        if c["codeSource"] == "PAGE":
            current_by_name.setdefault(norm(c["name"]), set()).add(c["code"])
    for prog in programs.values():
        for page in prog["_pages"]:
            url = BASE + page["href"]
            for mod in modules.get(page_key(page["href"]), []):
                for yr, cat_pub, raw_name in mod["courses"]:
                    name = re.sub(r"\s*\(M\d+\s*공통\)\s*$", "", raw_name).strip()
                    year, sem, partner = parse_module_term(yr)
                    category = norm_category(cat_pub)
                    match = catalog_by_track.get(prog["name"], {}).get(norm(name))
                    current = current_by_name.get(norm(name), set())
                    if match:
                        code, source, credit, cverified = match["code"], "CATALOG_NAME_MATCH", match["creditMilli"], True
                        name_out = match["name"]
                    elif len(current) == 1:
                        code = next(iter(current))
                        source, credit, cverified = "CURRENT_NAME_MATCH", courses[code]["creditMilli"], True
                        name_out = courses[code]["name"]
                    else:
                        code, source = "NC-" + stable_hash(prog["name"], name), "SYNTHETIC"
                        credit, cverified, name_out = 3000, False, name
                    mapping = OrderedDict([
                        ("program", prog["name"]), ("programId", prog["id"]),
                        ("category", category), ("categoryAsPublished", cat_pub),
                        ("recommendedYear", year), ("semester", sem),
                        ("termAsPublished", yr), ("module", mod["module"]), ("partnerUniversity", partner),
                        ("codeMatchedByName", source != "SYNTHETIC"), ("sourceUrl", url), ("sourceStatus", CRAWLED),
                    ])
                    add(prog, code, source, name_out, credit, cverified, mapping)

    # Previous-crawl fallback for programs whose page has no table now.
    for prog in programs.values():
        has_rows = any(m["program"] == prog["name"] for c in courses.values() for m in c["mappings"])
        if has_rows:
            continue
        for c in catalog["courses"]:
            for m in c["mappings"]:
                if m["track"] != prog["name"]:
                    continue
                mapping = OrderedDict([
                    ("program", prog["name"]), ("programId", prog["id"]),
                    ("category", norm_category(m["category"])), ("categoryAsPublished", m["category"]),
                    ("recommendedYear", m["recommendedYear"]), ("semester", m["semester"]),
                    ("termAsPublished", None), ("module", None), ("partnerUniversity", None),
                    ("codeMatchedByName", False), ("sourceUrl", m["sourceUrl"]), ("sourceStatus", PREVIOUS),
                ])
                add(prog, c["code"], "PAGE", c["name"], c["creditMilli"], True, mapping)

    for key, variants in name_variants.items():
        courses[key]["nameVariants"] = sorted(variants)
    ordered = [courses[k] for k in sorted(courses)]
    for c in ordered:
        c.setdefault("nameVariants", [])
    return ordered


# --------------------------------------------------------------------------
# Graduation pages per program
# --------------------------------------------------------------------------

def graduation_info(curricula, programs):
    by_norm = {}
    for p in programs.values():
        by_norm[norm(p["name"])] = p
        for a in p["aliases"]:
            by_norm.setdefault(norm(a), p)
    for g in curricula["grads"]:
        parts = g["label"].split(">")
        url = BASE + g["href"]
        text = clean(g["text"])
        if g["href"].startswith("/futureplus/"):
            table = next(t for t in g["tables"] if t and clean(t[0][0]) == "학과명")
            for row in table[1:]:
                dept, req = clean(row[0]), clean(row[1])
                p = by_norm.get(norm(dept))
                if p:
                    p["graduationUrl"] = url
                    p["graduationSummary"] = truncate(req, 400)
            continue
        target = by_norm.get(norm(parts[1])) or by_norm.get(norm(parts[1] + "학과"))
        if target is None:
            raise SystemExit(f"graduation page without program: {g['label']}")
        target["graduationUrl"] = url
        if not text or "준비중" in text or "fnctId=bbs" in text or re.fullmatch(r"[\w_ .()]+\.hwp( [\w_ .()]+\.hwp)*", text):
            target["graduationSummary"] = None
        else:
            body = text
            for _ in range(3):
                body = re.sub(r"^(졸업 요건 )?목차 .*?기준표\s*", "", body)
                body = re.sub(r"^(졸업 ?요건|트랙 졸업 자격 기준|" + re.escape(target["name"]) + r")\s*", "", body)
                body = re.sub(r"^[○■•\-\s]+", "", body)
            target["graduationSummary"] = truncate(body, 400)


# --------------------------------------------------------------------------
# Procedures
# --------------------------------------------------------------------------

ENDPOINT = (r"(?:(?P<y{n}>20\d{{2}})\s*[.년]\s*)?(?P<m{n}>\d{{1,2}})\s*[.월]\s*(?P<d{n}>\d{{1,2}})\s*[.일]?\s*"
            r"(?:\([^)]{{1,3}}\))?\s*(?:(?P<h{n}>\d{{1,2}})(?::(?P<mi{n}>\d{{2}})|\s*시))?")
RANGE = re.compile(ENDPOINT.format(n=1) + r"\s*~\s*" + ENDPOINT.format(n=2))
SINGLE = re.compile(ENDPOINT.format(n=1))


def iso(y, m, d, h=None, mi=None):
    s = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    if h is not None:
        s += f"T{int(h):02d}:{int(mi or 0):02d}"
    return s


def range_after(text, keywords, default_year, window=60):
    for kw in keywords:
        for km in re.finditer(kw, text):
            seg = text[km.end(): km.end() + window + 80]
            m = RANGE.search(seg)
            if m and m.start() <= window:
                y1 = int(m.group("y1") or default_year)
                y2 = int(m.group("y2") or y1)
                if not m.group("y2") and int(m.group("m2")) < int(m.group("m1")):
                    y2 += 1
                return (iso(y1, m.group("m1"), m.group("d1"), m.group("h1"), m.group("mi1")),
                        iso(y2, m.group("m2"), m.group("d2"), m.group("h2"), m.group("mi2")))
    return None, None


def date_after(text, keywords, default_year, window=40):
    for kw in keywords:
        for km in re.finditer(kw, text):
            seg = text[km.end(): km.end() + window + 40]
            m = SINGLE.search(seg)
            if m and m.start() <= window:
                y = int(m.group("y1") or default_year)
                return iso(y, m.group("m1"), m.group("d1"), m.group("h1"), m.group("mi1"))
    return None


def title_range(title, published):
    m = re.search(r"\(\s*(?:(\d{1,2})[./](\d{1,2})\.?)?\s*~\s*(?:(\d{1,2})(?:[./]|월\s*))?(\d{1,2})\s*일?\.?\s*(?:마감|까지)?\s*\)", title)
    if not m:
        return None, None
    py, pm = int(published[:4]), int(published[5:7])
    def year_for(month):
        return py + 1 if month < pm - 6 else py
    start = None
    if m.group(1):
        sm, sd = int(m.group(1)), int(m.group(2))
        start = iso(year_for(sm), sm, sd)
        em = int(m.group(3)) if m.group(3) else sm
    else:
        em = int(m.group(3)) if m.group(3) else pm
    ed = int(m.group(4))
    return start, iso(year_for(em), em, ed)


def first_match(text, patterns, limit=200):
    for p in patterns:
        m = re.search(p, text)
        if m:
            return truncate(m.group(1), limit)
    return None


def all_matches(text, patterns, limit=160):
    out = []
    for p in patterns:
        prefix = ""
        if isinstance(p, tuple):
            prefix, p = p
        m = re.search(p, text)
        if m:
            out.append(truncate(prefix + m.group(1), limit))
    return out


# id -> (type, term, role). role: NOTICE (announcement) | RESULT | INFO
ARTICLE_PLAN = {
    223374: ("TRACK_CHANGE", "2026-2", "NOTICE"),
    67391: ("TRACK_CHANGE", "2026-1", "NOTICE"),
    66640: ("TRACK_CHANGE", "2025-2", "NOTICE"),
    65873: ("TRACK_CHANGE", "2025-1", "NOTICE"),
    64851: ("TRACK_CHANGE", "2024-2", "NOTICE"),
    63820: ("TRACK_CHANGE", "2024-1", "NOTICE"),
    224652: ("TRACK_CREDIT_RECOGNITION", "2026-2", "NOTICE"),
    66835: ("TRACK_CREDIT_RECOGNITION", "2025-2", "NOTICE"),
    221936: ("TRACK_SELECT", "2026-2", "NOTICE"),
    219546: ("TRACK_SELECT", "2026-1", "NOTICE"),
    67139: ("TRACK_SELECT", "2026-1", "NOTICE"),
    66367: ("TRACK_SELECT", "2025-2", "NOTICE"),
    65572: ("TRACK_SELECT", "2025-1", "NOTICE"),
    64354: ("TRACK_SELECT", "2024-2", "NOTICE"),
    222872: ("TRACK_SELECT", "2027-1", "SURVEY"),
    223669: ("CROSS_TRANSFER", "2026-2", "RESULT"),
    223288: ("CROSS_TRANSFER", "2026-2", "NOTICE"),
    219665: ("CROSS_TRANSFER", "2026-1", "RESULT"),
    67371: ("CROSS_TRANSFER", "2026-1", "NOTICE"),
    66678: ("CROSS_TRANSFER", "2025-2", "RESULT"),
    65927: ("CROSS_TRANSFER", "2025-1", "RESULT"),
    64943: ("CROSS_TRANSFER", "2024-2", "RESULT"),
    63833: ("CROSS_TRANSFER", "2024-1", "RESULT"),
    222601: ("GENERAL_TRANSFER", "2026-2", "RESULT"),
    221934: ("GENERAL_TRANSFER", "2026-2", "NOTICE"),
    67246: ("GENERAL_TRANSFER", "2026-1", "RESULT"),
    67130: ("GENERAL_TRANSFER", "2026-1", "NOTICE"),
    66467: ("GENERAL_TRANSFER", "2025-2", "RESULT"),
    66365: ("GENERAL_TRANSFER", "2025-2", "NOTICE"),
    65720: ("GENERAL_TRANSFER", "2025-1", "RESULT"),
    65571: ("GENERAL_TRANSFER", "2025-1", "NOTICE"),
    64539: ("GENERAL_TRANSFER", "2024-2", "RESULT"),
    64319: ("GENERAL_TRANSFER", "2024-2", "NOTICE"),
    63668: ("GENERAL_TRANSFER", "2024-1", "RESULT"),
    223611: ("THIRD_TRACK", "2026-2", "NOTICE"),
    219612: ("THIRD_TRACK", "2026-1", "NOTICE"),
    66684: ("THIRD_TRACK", "2025-2", "NOTICE"),
    65929: ("THIRD_TRACK", "2025-1", "NOTICE"),
    223610: ("DOUBLE_MINOR", "2026-2", "NOTICE"),
    219610: ("DOUBLE_MINOR", "2026-1", "NOTICE"),
    66683: ("DOUBLE_MINOR", "2025-2", "NOTICE"),
    65928: ("DOUBLE_MINOR", "2025-1", "NOTICE"),
    224491: ("KMOOC", "2026-2", "NOTICE"),
    220330: ("KMOOC", "2026-1", "NOTICE"),
    67304: ("MICRO_DEGREE", "2026", "NOTICE"),
    65736: ("MICRO_DEGREE", "2025", "NOTICE"),
    224155: ("MICRO_DEGREE", "2026-2", "WRITTEN_REGISTRATION"),
    223981: ("MICRO_DEGREE", "2026-2", "WRITTEN_REGISTRATION"),
    224948: ("GRADUATION_REVIEW", "2026-2", "EARLY_GRADUATION"),
    222590: ("GRADUATION_REVIEW", "2026-1", "SCHEDULE"),
    223189: ("GRADUATION_REVIEW", "2026-1", "TRACK_CATEGORY_SWAP"),
    223244: ("GRADUATION_REVIEW", "2026-1", "CURRICULUM_CHANGE_RECOGNITION"),
}
NON_PROCEDURE_ARTICLES = {222531, 221328}  # library opening hours

APPLY_KEYWORDS = {
    "TRACK_CHANGE": [r"신청기간\s*:"],
    "TRACK_SELECT": [r"신청기간\s*:", r"조사 참여기간\s*:"],
    "GENERAL_TRANSFER": [r"원서접수"],
    "CROSS_TRANSFER": [r"원서접수"],
    "THIRD_TRACK": [r"신청기간\s*:"],
    "DOUBLE_MINOR": [r"신청기간\s*:"],
    "KMOOC": [r"신청 및 서류 제출 기간\s*:"],
    "MICRO_DEGREE": [r"신청기간", r"일시\s*:"],
    "TRACK_CREDIT_RECOGNITION": [r"신청기간\s*:"],
    "GRADUATION_REVIEW": [r"신청 기간\s*:", r"신청기간\s*:"],
}
RESULT_KEYWORDS = [r"합격자\s*발표", r"선정결과조회\s*:", r"신청결과확인", r"최종 승인 결과는", r"결과확인\s*:\s*최종 승인 결과는"]

ELIGIBILITY = {
    "TRACK_CHANGE": [r"트랙변경 대상 가\. 학기기준\s*:\s*(.+?)\s*나\."],
    "TRACK_SELECT": [r"(가\. 2017학년도 이후 .+? 나\. 2016학년도 이전 .+?)\s*(?:※|3\.)", r"조사대상 (.+?) 4\."],
    "GENERAL_TRANSFER": [r"지원자격 대상자\s*:\s*(.+?)\s*5\."],
    "CROSS_TRANSFER": [r"지원자격 대상자 - (.+?) 6\."],
    "THIRD_TRACK": [r"신청대상\s*:\s*(.+?) 나\."],
    "DOUBLE_MINOR": [r"신청대상\s*:\s*(.+?) - 트랙제"],
    "KMOOC": [r"신청 대상\s*:\s*(.+?)\*"],
    "MICRO_DEGREE": [r"신청대상 (.+?) 신청방법", r"우선 선발 - (.+?) 2\."],
    "TRACK_CREDIT_RECOGNITION": [r"신청대상 : (.+?) ※"],
    "GRADUATION_REVIEW": [r"신청가능 대상 : (.+?) ※", r"신청 대상 : (.+?) - ", r"신청대상: (.+?) 2\.", r"(다음 각 호\(①~④\)에해당되면 ‘졸업사정대상자’입니다\. .+?) 1\)"],
}
NOTES = {
    "TRACK_CHANGE": [
        ("반영시기: ", r"트랙변경 반영시기 (.+?) 5\."),
        r"(트랙변경으로 인해 기취득한 트랙전공학점은 일반선택학점으로 변경되어 [^.]*?함)",
        r"(제1트랙을 본인 소속이 아닌 타 모집단위로의 변경은 .+?가능함\.?)",
        r"(타 단과대학 학생이 2트랙을 창의융합대학 내 학과로 트랙변경 시, - 제1지망.+?입력)",
        r"(창의융합대학 내 학과로 2트랙 변경: .+?선발함)",
    ],
    "TRACK_SELECT": [
        r"(트랙 선택 시 등록금은 .+?책정함)",
        ("학적반영: ", r"학적반영\s*:\s*(.+?) 나\."),
        r"(\[컴퓨터공학부\] 내 트랙선택 자격요건: 아래 과목을 B0 이상으로 이수해야함)",
        r"(창의융합대학 내 창업트랙은 2트랙으로만 선택 가능하며, 선발인원 제한 없음)",
        r"(AI\+X 교육이 강조되는 .+?논의 예정)",
        r"(조사 불참여 시에는 .+?바랍니다)",
        r"(이번 가수요 조사는 .+?반영되지 않습니다)",
    ],
    "GENERAL_TRANSFER": [
        ("모집인원: ", r"일반전부\(과\) 모집인원\s*:\s*(\d+명[^라<]*?)(?: 라\.| <| 구분)"),
        r"(선발원칙 .+?높은 자)",
        ("전과 반영 시기: ", r"전과 반영 시기\s*:\s*(.+?) 1\)"),
        r"(전부\(과\) 제외 학부\(과\) 가\. .+?학부\(과\))(?: 4\.)",
        r"(트랙제 [^.]{0,10}학생의 경우,? 합격 후 트랙\s?변경기간에 트랙선택을 해야함)",
    ],
    "CROSS_TRANSFER": [
        r"(주간에서 야간 또는 야간에서 주간으로 소속을 변경하는 것)",
        ("모집: ", r"모집단위별 선발 인원\s*:\s*(총 \d+명)"),
        ("학적반영: ", r"학적반영시기\s*:\s*(.+?) 2\."),
        r"(교직 이수 중 인 학생의 경우 .+?바람)",
    ],
    "THIRD_TRACK": [
        r"(<융합전공 Ⅱ>, <심화전공>은 .+?선택가능)",
        r"(융합전공 제3트랙 신청시 초과학기 등록이 불가피함)",
        r"(제3트랙 이수를 위한 수강신청은 수강신청 정정기간에만 가능)",
        ("신청방법: ", r"신청방법\s*:\s*(서면신청 \([^)]*\))"),
    ],
    "DOUBLE_MINOR": [
        r"(<트랙제> 학생은 신청불가함\([^)]*\))",
        r"(복수전공에서 부전공으로 또는 부전공에서 복수전공으로 변경을 희망하는 재학생)",
    ],
    "KMOOC": [
        r"(K-MOOC강좌 학점은 수강신청 학점 이외의 학점으로 인정함)",
        r"(초과 학기자는 신청할 수 없음)",
        r"(학점인정은 총 동영상 시간 및 학습 인정 시간, 두 가지 조건을 모두 충족해야 함)",
    ],
    "MICRO_DEGREE": [
        r"(9학점 취득 시 이수를 인정함)",
        r"(현장심화형의 경우 1년 단위로 개설되기에 1년 안에 이수하는 것을 원칙으로 함)",
        r"(융합형 별도신청은 없으며 MD과정에 해당하는 과목을\(9학점\) 모두 수강할 시 자동 이수 인정됨)",
        r"(서면신청은 선발 기준에 따라 승인 여부가 결정됩니다)",
        r"(신청 가능한 학점을 초과할 경우, 사전에 과목을 삭제하신 후 서면신청 하시기 바랍니다)",
    ],
    "TRACK_CREDIT_RECOGNITION": [
        r"(\* 학점인정프로그램: [^1]+?등)",
        r"(동일과목을 제1트랙과 제2트랙에서 중복 인정받는 것은 불가함)",
        r"(학과\(학부․전공․트랙\)간 전공과목 상호인정 과목은 자동으로 인정되므로 신청 대상이 아님)",
        r"(학점인정 미신청이나 인정되지 않은 전공과목은 일선\(일반선택\)으로 이수구분 변경됨)",
    ],
    "GRADUATION_REVIEW": [
        ("조기졸업 요건: ", r"조기졸업 요건 : (.+?) ※"),
        r"(조기졸업 신청자 중 최종 취득학점 및 전공·교양별 졸업이수학점이 부족한 경우는 정규 8학기를 이수하여야 함)",
        r"(변경신청 가능 과목은 전공과목에 한함으로 교양과목은 해당사항 없으며 .+?신청불가능 함)",
        r"(Micro Degree과정 이수 학생 중 본인의 1,2트랙과 전공상호인정되는 MD과목에 한해 .+?이메일 송부)",
        r"(교육과정 변경으로 인한 이수 인정은 .+?경우)",
    ],
}


def article_meta(a):
    t = clean(a["text"])
    m = re.search(r"단축 url (?:학사|한성공지)\s+(.+?)\s+작성일 : (\d{4})\.(\d{2})\.(\d{2})", t)
    if not m:
        raise SystemExit(f"cannot parse title/date of article {a['id']}")
    return m.group(1).strip(), f"{m.group(2)}-{m.group(3)}-{m.group(4)}", t


def num(cell):
    c = clean(cell).replace("명", "")
    if re.fullmatch(r"\d+", c):
        return int(c)
    return None


def is_num_cell(cell):
    c = clean(cell)
    return bool(re.fullmatch(r"\d+명?|-|<없음>", c))


def parse_quota_table(table, basis):
    """Generic parser for 선발인원/모집인원 tables flattened from rowspans."""
    entries = OrderedDict()
    order = []
    unit = None
    cohort = None
    for row in table:
        cells = [clean(c) for c in row]
        if not cells or not any(is_num_cell(c) for c in cells):
            continue
        for c in cells:
            if "학과제" in c or "트랙제" in c:
                cohort = c
        first_num = next(i for i, c in enumerate(cells) if is_num_cell(c))
        session_marker = None
        if first_num > 0 and cells[first_num - 1] in ("주", "야"):
            session_marker = cells[first_num - 1]
            name_cells = cells[: first_num - 1]
        else:
            name_cells = cells[:first_num]
        name_cells = [c for c in name_cells if c and "학과제" not in c and "트랙제" not in c]
        if name_cells:
            unit = name_cells[-1]
        if unit is None or unit.replace(" ", "") in ("소계", "총합계"):
            continue
        nums = []
        for c in cells[first_num:]:
            if is_num_cell(c):
                nums.append(num(c))
            else:
                break
        e = entries.get(unit)
        if e is None:
            e = OrderedDict([("unit", re.sub(r"\((?:●|◆)\)", "", unit).strip()), ("day", None), ("night", None),
                             ("total", None), ("basis", basis), ("note", None)])
            if "(●)" in unit:
                e["note"] = "미래플러스대학 학생만 지원 가능"
            if "(◆)" in unit:
                e["note"] = "신설 학부로 신청 불가(공고 주석)"
            if cohort and "학과제" in cohort:
                e["note"] = "학과제(16학번 이전) 모집단위"
            entries[unit] = e
            order.append(unit)
        if session_marker == "주":
            e["day"] = nums[0]
        elif session_marker == "야":
            e["night"] = nums[0]
        elif len(nums) >= 3:
            e["day"], e["night"], e["total"] = nums[0], nums[1], nums[2]
        elif len(nums) == 1:
            e["total"] = nums[0]
    out = []
    for u in order:
        e = entries[u]
        if e["total"] is None and (e["day"] is not None or e["night"] is not None):
            e["total"] = (e["day"] or 0) + (e["night"] or 0)
        out.append(e)
    return out


def parse_creative_selection(table):
    """'<주간> 6명 선발' style cells in the program table of 트랙변경 notices."""
    out = []
    for row in table:
        cells = [clean(c) for c in row]
        unit = next((c for c in cells if c in CREATIVE_DEPARTMENTS), None)
        if unit is None:
            continue
        text = " ".join(cells[cells.index(unit) + 1:])
        if "선발" not in text and "없음" not in text:
            continue
        def part_value(part):
            m = re.search(r"(\d+)명\s*선발", part)
            if m:
                return int(m.group(1))
            if "없음" in part:
                return 0
            return None
        if "<야간>" in text or "<주간>" in text:
            day_part = text.split("<야간>")[0]
            night_part = text.split("<야간>")[1] if "<야간>" in text else ""
            day = part_value(day_part) if "<주간>" in day_part else None
            night = part_value(night_part) if night_part else None
        else:
            day, night = part_value(text), None
        e = OrderedDict([("unit", unit), ("day", day), ("night", night),
                         ("total", (day or 0) + (night or 0) if day is not None or night is not None else None),
                         ("basis", "SECOND_TRACK_CHANGE_SEATS"),
                         ("note", truncate(re.sub(r"(\s+[○\-])+\s*$", "", text), 120))])
        out.append(e)
    return out


def parse_creative_limit_table(table, basis):
    """Rows 'unit | 주 | 모집 | 한도 | ... | 잔여' or 'unit(주) | 모집주 | 모집야 | 한도주 | 한도야'."""
    out = OrderedDict()
    unit = None
    header = " ".join(clean(c) for r in table[:2] for c in r)
    remaining = "잔여" in header
    for row in table:
        cells = [clean(c) for c in row]
        if not any(re.fullmatch(r"\d+", c) for c in cells):
            continue
        if cells[0] not in ("주", "야"):
            unit = cells[0]
            rest = cells[1:]
        else:
            rest = cells
        m = re.match(r"(.+?)\((주|야)\)$", unit)
        if m and rest and rest[0] not in ("주", "야"):
            name = m.group(1)
            e = out.setdefault(name, OrderedDict([("unit", name), ("day", None), ("night", None), ("total", None),
                                                  ("basis", basis), ("note", None)]))
            vals = [num(c) for c in rest]
            e["day"], e["night"] = vals[2], vals[3]
            e["note"] = f"모집정원 주 {vals[0]}·야 {vals[1] if vals[1] is not None else '-'}의 30% 이내"
            continue
        session = rest[0]
        vals = rest[1:]
        name = unit
        e = out.setdefault(name, OrderedDict([("unit", name), ("day", None), ("night", None), ("total", None),
                                              ("basis", basis), ("note", None)]))
        if remaining:
            value = 0 if vals[-1] == "<없음>" else num(vals[-1])
            detail = f"{session}: 모집 {vals[0]}, 2트랙 한도 {vals[1]}, 잔여 {value}"
        else:
            value = num(vals[1]) if len(vals) > 1 else None
            detail = f"{session}: 모집 {vals[0]}, 2트랙 한도 {vals[1] if len(vals) > 1 else '-'}"
        if num(vals[0]) is None and value is None:
            continue
        if session == "주":
            e["day"] = value
        else:
            e["night"] = value
        e["note"] = (e["note"] + "; " if e["note"] else "") + detail
    res = []
    for e in out.values():
        if e["day"] is not None or e["night"] is not None:
            e["total"] = (e["day"] or 0) + (e["night"] or 0)
        res.append(e)
    return res


def extract_quotas(ptype, a):
    tables = a.get("tables") or []
    quotas = []
    for t in tables:
        if not t:
            continue
        head = " ".join(clean(c) for r in t[:2] for c in r)
        if ptype == "GENERAL_TRANSFER" and "선발인원" in head and "모집단위" in head:
            quotas += parse_quota_table(t, "TRANSFER_QUOTA")
        elif ptype == "CROSS_TRANSFER" and "모집인원" in head and "모집단위" in head:
            quotas += parse_quota_table(t, "TRANSFER_QUOTA")
        elif ptype in ("TRACK_SELECT", "TRACK_CHANGE"):
            if "잔여" in head:
                quotas += parse_creative_limit_table(t, "REMAINING_SECOND_TRACK_SEATS")
            elif "2트랙 선발인원" in head or "선발인원(모집정원의 30%)" in head:
                quotas += parse_creative_limit_table(t, "SECOND_TRACK_LIMIT")
            elif ptype == "TRACK_CHANGE" and "전공․트랙" in head:
                quotas += parse_creative_selection(t)
    return quotas


def normalize_to_unit(raw):
    s = raw.strip()
    session = None
    m = re.match(r"^\[(주|야)\](.+)$", s)
    if m:
        session, s = m.group(1), m.group(2)
    m = re.match(r"^(.+?)\((주|야)\)$", s)
    if m:
        s, session = m.group(1), m.group(2)
    s = s.replace("AI응응학과", "AI응용학과")
    return s, {"주": "DAY", "야": "EVENING"}.get(session)


def build_procedures(notices, aggregates):
    groups = OrderedDict()
    sources = []
    for a in notices["articles"]:
        title, published, text = article_meta(a)
        sources.append((a["id"], title, published))
        if a["id"] in NON_PROCEDURE_ARTICLES:
            continue
        if a["id"] not in ARTICLE_PLAN:
            raise SystemExit(f"article {a['id']} not classified: {title}")
        ptype, term, role = ARTICLE_PLAN[a["id"]]
        gkey = (ptype, term, role if role in ("SURVEY", "WRITTEN_REGISTRATION", "EARLY_GRADUATION", "SCHEDULE",
                                              "TRACK_CATEGORY_SWAP", "CURRICULUM_CHANGE_RECOGNITION") else "")
        if role == "WRITTEN_REGISTRATION":
            gkey = (ptype, term, role, a["id"])
        groups.setdefault(gkey, []).append((a, title, published, text, role))

    procedures = []
    for gkey, items in groups.items():
        ptype, term = gkey[0], gkey[1]
        # primary = announcement if present (latest-published first), else result
        items.sort(key=lambda x: (0 if x[4] != "RESULT" else 1, x[2], -len(x[3])), reverse=False)
        notices_first = [i for i in items if i[4] != "RESULT"]
        primary = max(notices_first, key=lambda x: len(x[3])) if notices_first else items[0]
        a, title, published, text, role = primary
        year = int(published[:4])
        start, end = range_after(text, APPLY_KEYWORDS.get(ptype, []), year)
        if start is None and end is None:
            start, end = title_range(title, published)
        result_at = None
        for it in items:
            if it[4] != "RESULT":
                result_at = result_at or date_after(it[3], RESULT_KEYWORDS, int(it[2][:4]))
        if result_at is not None and result_at[:10] < published:
            result_at = None  # source typo (see knownConflicts); fall back to result notice date
        results = []
        by_unit = OrderedDict()
        result_urls = []
        total_accepted = None
        for it in sorted(items, key=lambda x: x[2]):
            if it[4] != "RESULT":
                continue
            result_urls.append(article_url(it[0]["id"]))
            if result_at is None:
                result_at = it[2]
            agg = aggregates["articles"].get(str(it[0]["id"]))
            if not agg:
                continue
            total_accepted = (total_accepted or 0) + agg["totalAccepted"]
            for r in agg["acceptedByPublishedUnit"]:
                unit, session = normalize_to_unit(r["toUnit"])
                results.append(OrderedDict([("toUnit", r["toUnit"]), ("unit", unit), ("session", session),
                                            ("accepted", r["accepted"])]))
                label = unit + ({"DAY": "(주)", "EVENING": "(야)"}.get(session, ""))
                by_unit[label] = by_unit.get(label, 0) + r["accepted"]
        quotas = []
        for it in items:
            if it[4] != "RESULT":
                quotas += extract_quotas(ptype, it[0])
        # de-duplicate quotas coming from duplicated notices
        seen, uq = set(), []
        for q in quotas:
            k = json.dumps(q, ensure_ascii=False)
            if k not in seen:
                seen.add(k)
                uq.append(q)
        notes = []
        for it in items:
            for n in all_matches(it[3], NOTES.get(ptype, [])):
                if n not in notes:
                    notes.append(n)
        if ptype == "KMOOC":
            t0 = next((t for t in a.get("tables") or [] if t and clean(t[0][0]) == "구분"), None)
            if t0:
                for r in t0[1:]:
                    cells = [clean(c) for c in r]
                    notes.append(f"{cells[0]}: 일반 재학생 {cells[1]}, 조기 취업·창업자 {cells[2]}")
        if ptype == "GRADUATION_REVIEW" and role == "SCHEDULE":
            t1 = next((t for t in a.get("tables") or [] if t and clean(t[0][0]) == "대상"), None)
            if t1:
                for r in t1[1:]:
                    cells = [clean(c) for c in r]
                    if len(cells) >= 3:
                        notes.append(truncate(f"{cells[1]} {cells[2]}", 110))
        if len(clean(a["text"])) < 320:
            notes.append("본문이 첨부파일로만 게시되어 세부 내용(기간 외)은 수집되지 않음")
        if role == "SURVEY":
            notes.insert(0, "2026학번 대상 트랙선택 가수요조사(실제 트랙선택은 2026년 11월 예정)")
        eligibility = None
        for it in items:
            eligibility = eligibility or first_match(it[3], ELIGIBILITY.get(ptype, []))
        pid = f"{ptype.lower().replace('_', '-')}-{term}" + (f"-{role.lower().replace('_', '-')}" if len(gkey) > 2 and gkey[2] else "")
        if len(gkey) > 3:
            pid += f"-{gkey[3]}"
        proc = OrderedDict([
            ("id", pid), ("type", ptype), ("term", term), ("title", title), ("publishedAt", published),
            ("applyStart", start), ("applyEnd", end), ("resultAt", result_at),
            ("eligibility", eligibility), ("notes", notes), ("quotas", uq),
            ("results", results),
            ("transferAcceptedByUnit", dict(by_unit) if by_unit else None),
            ("totalAccepted", total_accepted),
            ("averageGpa", None),
            ("sourceUrl", article_url(a["id"])),
            ("relatedSourceUrls", sorted({article_url(it[0]["id"]) for it in items} - {article_url(a["id"])})),
        ])
        if ptype in ("GENERAL_TRANSFER", "CROSS_TRANSFER") and not by_unit and any(i[4] == "RESULT" for i in items):
            proc["notes"].append("합격자 명단이 본문 표로 공개되지 않아(첨부/미게시) 합격 인원 미집계")
        procedures.append(proc)
    type_order = ["TRACK_SELECT", "TRACK_CHANGE", "GENERAL_TRANSFER", "CROSS_TRANSFER", "THIRD_TRACK",
                  "DOUBLE_MINOR", "KMOOC", "MICRO_DEGREE", "TRACK_CREDIT_RECOGNITION", "GRADUATION_REVIEW"]
    procedures.sort(key=lambda p: (type_order.index(p["type"]), [-int(x) for x in p["term"].split("-")], p["id"]))
    return procedures, sources


# --------------------------------------------------------------------------
# Micro degrees
# --------------------------------------------------------------------------

def build_microdegrees(notices, observations):
    page = next(p for p in notices["pages"] if p["p"] == "/hansung/6215/subview.do")
    text = clean(page["text"])
    mds = observations["microdegrees"]
    positions = []
    for md in mds:
        m = re.search(re.escape(md["name"]) + r" \(유형 ?\d\)", text)
        positions.append(m.start() if m else None)
    found = sorted(p for p in positions if p is not None)
    out = []
    for md, pos in zip(mds, positions):
        courses = []
        if pos is not None:
            nxt = [p for p in found if p > pos]
            end = nxt[0] if nxt else (text.find(" NOTE ", pos) if text.find(" NOTE ", pos) > 0 else len(text))
            seg = text[pos:end]
            m = re.search(r"과목구성\s*:\s*(.+)$", seg)
            if m:
                courses = [c.strip() for c in re.split(r"\s*,\s*", m.group(1).strip()) if c.strip()]
        out.append(OrderedDict([
            ("id", md["observation_id"].lower()), ("name", md["name"]), ("mdType", md["type"]),
            ("category", md["category_as_published"]), ("creditMilli", md["requirement_credits"] * 1000),
            ("year", md["operating_year"]), ("courses", courses),
            ("courseCodesVerified", False),
            ("sourceUrl", BASE + "/hansung/6215/subview.do"),
        ]))
    return out


# --------------------------------------------------------------------------
# Requirement profiles / graduation
# --------------------------------------------------------------------------

def cm(*vals):
    return [v * 1000 if v is not None else None for v in vals]


def requirement_profiles(notices):
    def prof(label, basic, required, elective, total, free=None, extra=None):
        b, r, e, t = cm(basic, required, elective, total)
        d = OrderedDict([("label", label), ("basic", b), ("required", r), ("elective", e), ("total", t)])
        if free is not None:
            d["freeElective"] = free * 1000
        if extra:
            d.update(extra)
        return d
    profiles = OrderedDict([
        ("FUSION_I", prof("융합전공Ⅰ (프로그램당)", 3, 15, 21, 39, 21,
                          {"programsRequired": 2, "majorTotal": 78000,
                           "note": "트랙·학과·전공 중 2개 이상 교육과정을 각 39학점 이수"})),
        ("FUSION_II_MAIN", prof("융합전공Ⅱ 주전공", 3, 15, 39, 57, 21,
                                {"pairedWith": "MINOR", "majorTotal": 78000,
                                 "note": "학과·전공 1개 57학점 + 타 교육과정 부전공 21학점, 다전공 신청기간(2월·8월)에 부전공 신청 필요"})),
        ("MINOR", prof("부전공", 3, 12, 6, 21, None,
                       {"note": "트랙·학과·전공 교육과정 21학점. 모든 이수과정에 1개 이상 추가 가능, 부전공 지정과목 확인 필요"})),
        ("DEEP_GENERAL", prof("심화전공(일반 학과·전공)", 3, 15, 60, 78, 21,
                              {"note": "1·2트랙을 동일 학과·전공으로 선택"})),
        ("DEEP_CREATIVE", prof("심화전공(창의융합대학 소속 학과)", 3, 21, 54, 78, 21,
                               {"note": "문학문화콘텐츠·AI응용·융합보안·미래모빌리티학과 단일전공"})),
        ("MICRO_DEGREE", OrderedDict([("label", "Micro Degree"), ("credits", 9), ("creditMilli", 9000),
                                      ("note", "유형1은 전공 이수학점 범위 안, 유형2(현장심화형)는 2개 트랙 외 추가 이수")])),
        ("COMBINATIONS", OrderedDict([
            ("FUSION_I_PLUS_MINOR", 99000), ("FUSION_I_PLUS_MICRO_DEGREE", 87000),
            ("FUSION_I_PLUS_THIRD_TRACK", 117000)])),
        ("pre2016", OrderedDict([
            ("FUSION_I", "39+39학점"), ("FUSION_II", "57+21학점"), ("DEEP", "78학점"),
            ("note", "16학번 이전(학부·학과제에서 트랙제로 전환한 학생 포함) 기준. 세부 기초/필수/선택 배분은 6218 페이지 표 기준 재확인 필요")])),
        ("sourceUrl", BASE + "/hansung/6218/subview.do"),
        ("verifiedIn", []),
    ])
    # Cross-check against the 트랙제 전공교육과정 이수학점 체계 table in the 2026-2 트랙선택 notice.
    art = next(a for a in notices["articles"] if a["id"] == 221936)
    tbl = next(t for t in art["tables"] if t and "전공기초" in " ".join(t[0]))
    rows = {}
    current = None
    for r in tbl[1:]:
        cells = [clean(c) for c in r]
        if cells[0] in ("융합전공Ⅰ", "융합전공Ⅱ", "심화전공"):
            current = cells[0]
            cells = cells[1:]
        rows.setdefault(current, []).append(cells)
    def nums(cells):
        return [int(c) if c.isdigit() else None for c in cells[1:5]]
    checks = [
        ("FUSION_I", nums(rows["융합전공Ⅰ"][0])),
        ("FUSION_II_MAIN", nums(rows["융합전공Ⅱ"][0])),
        ("MINOR", nums(rows["융합전공Ⅱ"][1])),
        ("DEEP_GENERAL", nums(rows["심화전공"][0])),
        ("DEEP_CREATIVE", nums(rows["심화전공"][1])),
    ]
    for key, (b, r, e, t) in checks:
        p = profiles[key]
        if [p["basic"], p["required"], p["elective"]] != cm(b, r, e) or (t is not None and p["total"] != t * 1000):
            raise SystemExit(f"requirement table mismatch for {key}: {(b, r, e, t)}")
    profiles["verifiedIn"] = [article_url(221936), article_url(219546)]
    return profiles


def graduation_section(notices, curricula):
    pages = {p["p"]: p for p in notices["pages"]}
    g = clean(pages["/hansung/6234/subview.do"]["text"])
    m = re.search(r"취득학점 총계 (\d+)학점\((\d+)학번 이전은 (\d+)학점\)", g)
    pts = re.search(r"비교과포인트 : (\d+)pt이상", g)
    gpa = re.search(r"성적평점평균이 (\d\.\d) 이상", g)
    quote = re.search(r"(학점 : 취득학점 총계 .+?성적평점평균이 \d\.\d 이상인 자)", g)
    transfer = re.search(r"(일반편입학 : .+?2\.0이상인 자 학사편입학 : .+?2\.0이상인 자)", g)
    total = OrderedDict([
        ("totalCreditMilli", int(m.group(1)) * 1000 if m else None),
        ("appliesTo", "16학번 이후 (6234 표 기준; 본문 '15학번 이전은 140학점')"),
        ("pre2016TotalCreditMilli", int(m.group(3)) * 1000 if m else None),
        ("nonCurricularPoints", int(pts.group(1)) if pts else None),
        ("nonCurricularNote", "16학번 이후 800포인트 충족 시 졸업, 미충족 시 수료. 15학번 이전 해당 없음"),
        ("minGpa", float(gpa.group(1)) if gpa else None),
        ("trackRequirementNote", "트랙제 융합전공자는 제1트랙과 제2트랙 졸업요건을 각각 충족해야 함(미충족 시 수료)"),
        ("transferStudents", truncate(transfer.group(1), 300) if transfer else None),
        ("quote", truncate(quote.group(1), 200) if quote else None),
    ])
    # Liberal arts course lists (상상력교양대학)
    def lib_courses(path):
        rows = pages[path]["tables"][0]
        out = OrderedDict()
        for r in rows[1:]:
            cells = [clean(c) for c in r]
            code = cells[3]
            e = out.setdefault(code, OrderedDict([("code", code), ("name", cells[4]),
                                                  ("creditMilli", credit_milli(cells[5])), ("areaAsPublished", cells[2]),
                                                  ("terms", [])]))
            term = f"{cells[0]}-{cells[1]}"
            if term not in e["terms"]:
                e["terms"].append(term)
        return list(out.values())
    required = lib_courses("/LibArt/5417/subview.do")
    selective = lib_courses("/LibArt/5432/subview.do")
    general = lib_courses("/LibArt/5437/subview.do")
    crecon = next(p for p in curricula["programs"] if p["href"] == "/CreCon/2762/subview.do")
    imag = []
    area = None
    for r in crecon["tables"][0][1:]:
        cells = [clean(c) for c in r]
        if len(cells) == 4:
            area = cells[0]
            imag.append(OrderedDict([("area", area), ("courseOrGroup", cells[1]), ("creditMilli", credit_milli(cells[2])),
                                     ("note", cells[3])]))
        elif len(cells) == 2 and cells[0] == "소계":
            imag.append(OrderedDict([("area", "소계"), ("courseOrGroup", None), ("creditMilli", credit_milli(cells[1])), ("note", None)]))
        else:
            imag.append(OrderedDict([("area", area), ("courseOrGroup", cells[0]), ("creditMilli", credit_milli(cells[1])), ("note", None)]))
    liberal = OrderedDict([
        ("summary", "교양은 학번·소속별로 다름(수강신청 안내문 기준). 상상력교양대학 공개 교육과정: 교양필수(교필) "
                    f"{len(required)}과목, 선택필수교양(선필교) {len(selective)}과목, 일반교양(일교) {len(general)}과목. "
                    "상상력인재학부 표 기준 교양필수 16학점 + 선택필수교양 4개 분야 이상 12학점(전공기초 6학점 포함 소계 34학점). "
                    "K-MOOC는 자율교양 P/F로 졸업까지 일반 재학생 최대 3학점(본교 개발 강좌 포함 6학점)."),
        ("imaginationTalentStructure", imag),
        ("imaginationTalentSourceUrl", BASE + "/CreCon/2762/subview.do"),
        ("futurePlusNote", "미래플러스대학(2024학번 이전): 기초교양(사고와 표현 택1, 영어커뮤니케이션 독해·작문/청취·회화 필수) + 미래플러스 핵심역량 18학점 등 합계 28학점 이상"),
        ("requiredCourses", required),
        ("selectiveRequiredCourses", selective),
        ("generalCourses", general),
        ("notes", ["/LibArt/5417 과 /LibArt/5427 은 동일한 교필 표를 게시(각 페이지가 어느 학번용인지 크롤에서 확인 불가)",
                   "사고와 표현 과목은 단과대학별 1학기 또는 2학기 개설(/LibArt/5422)"]),
    ])
    return OrderedDict([
        ("totalCreditsNote", total),
        ("liberalArts", liberal),
        ("sourceUrls", [BASE + "/hansung/6234/subview.do", BASE + "/LibArt/5417/subview.do",
                        BASE + "/LibArt/5427/subview.do", BASE + "/LibArt/5432/subview.do",
                        BASE + "/LibArt/5437/subview.do", BASE + "/LibArt/5422/subview.do",
                        BASE + "/CreCon/2762/subview.do", BASE + "/futureplus/721/subview.do",
                        article_url(224491)]),
    ])


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def apply_second_track_exclusions(notices, programs):
    """글로벌인재대학: a department's 모트랙 cannot be chosen as its 2nd track (FAQ /hansung/6148)."""
    faq = next((p for p in notices["pages"] if p["p"] == "/hansung/6148/subview.do"), None)
    if not faq:
        return
    by_name = {}
    for prog in programs.values():
        for name in [prog["name"], *prog.get("aliases", [])]:
            by_name[re.sub(r"[\s·ㆍ]", "", name)] = prog["name"]
    for table in faq["tables"]:
        if not table or not table[0] or "모트랙" not in table[0][-1]:
            continue
        for row in table[1:]:
            dept, tracks = row[0], row[1]
            target = by_name.get(re.sub(r"[\s·ㆍ]", "", dept))
            if not target:
                continue
            names = [by_name.get(re.sub(r"[\s·ㆍ]", "", t.strip())) for t in tracks.split(",")]
            for prog in programs.values():
                if prog["name"] == target:
                    prog["secondTrackExclusions"] = sorted({n for n in names if n})
                    prog["secondTrackExclusionSource"] = BASE + "/hansung/6148/subview.do"


def main():
    aggregates, notices = sanitize_notices()
    curricula = load(CURRICULA)
    catalog = load(CATALOG)
    observations = load(OBSERVATIONS)
    load_stopped_tracks(notices)

    programs = build_programs(curricula, observations, catalog)
    courses = build_courses(programs, notices, catalog)
    graduation_info(curricula, programs)

    per_program = {}
    for c in courses:
        for m in c["mappings"]:
            per_program.setdefault(m["programId"], set()).add(c["code"])
    for p in programs.values():
        codes = per_program.get(p["id"], set())
        p["courseCount"] = len(codes)
        statuses = {m["sourceStatus"] for c in courses for m in c["mappings"] if m["programId"] == p["id"]}
        if CRAWLED in statuses:
            p["sourceStatus"] = CRAWLED
        elif PREVIOUS in statuses:
            p["sourceStatus"] = PREVIOUS
        else:
            p["sourceStatus"] = NO_TABLE
        if p["id"] == "self-designed-major":
            p["requirementNote"] = ("상상력인재학부 교육과정 표(과목 목록 아님): 전공기초 트랙기초 2과목 6학점, "
                                    "교양필수 16학점(사고와표현·영어커뮤니케이션·코딩·디자인 Thinking·삶과 꿈·글로벌 시민의식/사회봉사), "
                                    "선택필수교양 4개 분야 이상 12학점, 소계 34학점")
        del p["_pages"]
    apply_second_track_exclusions(notices, programs)

    procedures, article_sources = build_procedures(notices, aggregates)
    microdegrees = build_microdegrees(notices, observations)
    profiles = requirement_profiles(notices)
    graduation = graduation_section(notices, curricula)

    # Sources
    sources = []
    def add_source(sid, title, url, published):
        sources.append(OrderedDict([("id", sid), ("title", title), ("url", url), ("publishedAt", published),
                                    ("accessedAt", ACCESSED)]))
    for p in curricula["programs"]:
        site, pg = p["href"].split("/")[1:3]
        add_source(f"{site.lower()}-{pg}", p["label"].replace(">", " > "), BASE + p["href"], None)
    for g in curricula["grads"]:
        site, pg = g["href"].split("/")[1:3]
        add_source(f"{site.lower()}-{pg}", g["label"].replace(">", " > "), BASE + g["href"], None)
    page_titles = {
        "/hansung/6213/subview.do": "트랙제도(트랙 선택 및 변경)", "/hansung/6215/subview.do": "Micro Degree 운영과정",
        "/hansung/6234/subview.do": "졸업 및 학위수여", "/hansung/6239/subview.do": "내가그린학기(학점인정 프로그램)",
        "/hansung/6246/subview.do": "일반전과(부)", "/hansung/6253/subview.do": "제3트랙 신청(복수·부전공)",
        "/hansung/6225/subview.do": "수강신청", "/hansung/6161/subview.do": "학습공간(자원예약시스템 안내)",
        "/hansung/6164/subview.do": "건물별 빈강의실 현황", "/hansung/6139/subview.do": "학내잔류 신청",
        "/hansung/6148/subview.do": "학사 FAQ", "/LibArt/5417/subview.do": "교양 교육과정(교양필수)",
        "/LibArt/5422/subview.do": "교양 교육과정 안내(사고와 표현)", "/LibArt/5427/subview.do": "교양 교육과정(교양필수, 5417과 동일 표)",
        "/LibArt/5432/subview.do": "교양 교육과정(선택필수교양)", "/LibArt/5437/subview.do": "교양 교육과정(일반교양)",
        "/cncschool/4157/subview.do": "스마트융합교육센터 운영시간", "/cncschool/4182/subview.do": "코딩라운지 예약현황",
        "/cncschool/5934/subview.do": "코딩라운지 세미나실", "/hansung/7566/subview.do": "상상력교양대학 조직 안내",
    }
    for p in notices["pages"]:
        site, pg = p["p"].split("/")[1:3]
        add_source(f"{site.lower()}-{pg}", page_titles.get(p["p"], p["p"]), BASE + p["p"], None)
    for aid, title, published in article_sources:
        add_source(f"notice-{aid}", title, article_url(aid), published)
    sources.append(OrderedDict([("id", "hansung-6218"), ("title", "전공 최소 이수학점(17학번 이후/16학번 이전)"),
                                ("url", BASE + "/hansung/6218/subview.do"), ("publishedAt", "2026-06-18"),
                                ("accessedAt", "2026-09-28")]))

    known_conflicts = list(observations["known_conflicts"])
    known_conflicts += [
        OrderedDict([("source_ids", ["notice-66365"]), ("subject", "2025-2 일반 전부(과) 합격자발표 연도"),
                     ("observations", ["본문 표: 합격자발표 2024.05.27.(화)", "공고일 2025-04-30, 결과 공고 2025-05-28"]),
                     ("resolution", "원문 오기로 보고 resultAt은 결과 공고일(2025-05-28) 사용")]),
        OrderedDict([("source_ids", ["notice-223981"]), ("subject", "RISE 창업MD 서면신청 접수 마감 연도"),
                     ("observations", ["본문: 접수 시간 2025.08.14.(금) 15:00까지", "공고일 2026-08-13 (2026-08-14가 금요일)"]),
                     ("resolution", "원문 오기 가능성. applyEnd 미설정, 원문 확인 필요")]),
        OrderedDict([("source_ids", ["notice-222601", "notice-63668"]), ("subject", "합격자 명단의 학과명 오기"),
                     ("observations", ["전과(후) 학부 'AI응응학과(주)'", "AI응용학과와 동일 단위로 추정"]),
                     ("resolution", "results.toUnit은 원문 유지, unit은 AI응용학과로 정규화")]),
        OrderedDict([("source_ids", ["notice-219665", "notice-223669"]), ("subject", "교차 전부(과) 모집단위 표기"),
                     ("observations", ["'크리에이티브인문예술학부(주)'", "'크리에이티브인문학부'", "'미래융합사회과학대학'(사회과학부)"]),
                     ("resolution", "단위명은 원문 그대로 집계, 동일 단위 병합은 앱에서 별도 매핑 필요")]),
        OrderedDict([("source_ids", ["notice-67391"]), ("subject", "2026-1 트랙변경 공고의 전부(과) 참조 학기"),
                     ("observations", ["'2025학년도 1학기 일반전부(과) 신청을 통해 선발된 학생만 가능함'", "2026-1 공고"]),
                     ("resolution", "이전 공고 문구 재사용으로 보이는 오기. 2026-1 일반 전부(과)로 해석 필요")]),
        OrderedDict([("source_ids", ["notice-219546", "notice-67139"]), ("subject", "2026-1 트랙선택 공고 중복 게시"),
                     ("observations", ["동일 제목·본문이 두 게시물 번호로 존재", "67139에만 창업트랙 교과구성 PDF 첨부"]),
                     ("resolution", "하나의 procedure로 병합(relatedSourceUrls)")]),
        OrderedDict([("source_ids", ["notice-222590"]), ("subject", "2025학년도 후기 졸업사정 일정표 연도"),
                     ("observations", ["학사학위취득유예신청 2025.6.1.~6.10.", "여름계절학기 2025.6.23.~7.13.", "나머지 일정은 2026년"]),
                     ("resolution", "전년도 일정 문구 잔존 가능성. 원문 확인 전 해당 행 날짜 사용 금지")]),
        OrderedDict([("source_ids", ["hmnart-5615", "hmnart-5622", "crecon-7500"]), ("subject", "모듈형 교육과정 페이지"),
                     ("observations", ["과목 코드·학점 미표기", "지식정보문화·디지털인문정보학 과목은 2026-09-22 catalog 과목명으로 코드 매칭"]),
                     ("resolution", "이름으로 코드를 찾은 매핑은 codeMatchedByName=true(이전 catalog 또는 현재 크롤의 유일 과목명), 못 찾으면 SYNTHETIC 코드 + creditVerified=false(3학점 가정)")]),
        OrderedDict([("source_ids", ["hansung-6148", "cncschool-4157"]), ("subject", "상상파크·코딩라운지 운영시간"),
                     ("observations", ["FAQ: 상상파크·코딩라운지 학기 중 09:00~21:00, 상상파크 플러스 09:00~17:00",
                                       "운영시간 페이지: 상상파크/상상파크 플러스 학기 중 09:00~21:00"]),
                     ("resolution", "기존 충돌 유지, 담당 부서 확인 전 미확정")]),
    ]

    coverage_limits = [
        "기계시스템디자인트랙·AI로봇융합트랙은 교육과정이 이미지로만 게시되고 2026-09-22 catalog에도 과목 행이 없어 과목 0개(NO_PUBLIC_TABLE). 졸업요건 페이지의 과목 수(15개 45학점 중 13개 39학점)만 반영",
        "빈 표/미게시 프로그램: 이민·다문화, 부동산, 인테리어디자인, 기계설계, 기계자동화, 시스템경영공학, 생산물류시스템, 컨설팅, 글로벌벤처창업학과, 인테리어디자인학과(계약), 스마트제조혁신컨설팅학과 공대 페이지(미래플러스 페이지에는 표 있음)",
        "창업트랙 모듈 과목과 컨소시엄(경일대·동의대·호서대) 과목은 코드·학점 미공개 → 합성 코드(NC-) + 3학점 가정(creditVerified=false)",
        "문학문화콘텐츠학과와 글로벌인재대학 학과 표에는 교과목코드가 없어 합성 코드 사용. 글로벌K비즈니스학과는 교과구분 미표기(미분류)",
        "교육과정 표는 현재 게시본이며 학번(입학년도)별 교육과정, 실제 학기 개설 여부, 선수과목, 전공 상호인정 관계는 포함하지 않음",
        "학부(과)·트랙별 졸업요건 중 게시판 첨부(HWP/PDF)로만 공개된 항목(전자·시스템반도체·정보시스템·문학문화콘텐츠학과 등)과 '준비중'·빈 페이지는 graduationSummary=null",
        "16학번 이전 전공 이수학점의 기초/필수/선택 세부 배분과 6218 페이지 원문은 이번 크롤 대상이 아님(2026-09-28 관찰값 사용)",
        "2024-1~2025-1 트랙선택·트랙변경·제3트랙·다전공 공고 다수는 본문이 첨부파일로만 게시되어 제목의 기간만 추출",
        "2024-1·2024-2 교차 전부(과), 2024-2 일반 전부(과) 합격자 명단은 첨부/미게시로 합격 인원 미집계. 합격자 평균 평점은 어떤 공고에도 없음(averageGpa=null)",
        "합격 인원은 공개 명단의 행 수를 전과(후)/모집단위별로 센 값이며 학번·이름은 저장하지 않음. 추가합격·취소는 반영되지 않음",
        "Micro Degree 과목명은 6215 본문 기준이며 과목 코드·학기 개설은 검증되지 않음",
        "교양 교육과정 페이지(5417/5427)의 적용 학번 구분을 크롤 데이터에서 확인할 수 없음",
        "공간 예약(코딩라운지 예약현황 등) 실시간 데이터와 공식 예약 API는 포함하지 않음",
    ]

    prog_list = list(programs.values())
    # Catalog diff for the 39 previous tracks
    new_codes = {}
    for c in courses:
        for m in c["mappings"]:
            new_codes.setdefault(m["program"], set()).add(c["code"])
    old_codes = {}
    for c in catalog["courses"]:
        for m in c["mappings"]:
            old_codes.setdefault(m["track"], set()).add(c["code"])
    catalog_diff = OrderedDict()
    for t in catalog["tracks"]:
        o, n = old_codes.get(t["name"], set()), new_codes.get(t["name"], set())
        catalog_diff[t["name"]] = OrderedDict([("previous", len(o)), ("current", len(n)),
                                               ("added", sorted(n - o)), ("removed", sorted(o - n))])

    summary = OrderedDict([
        ("programCount", len(prog_list)),
        ("programsByStatus", dict(sorted(Counter(p["status"] for p in prog_list).items()))),
        ("programsByKind", dict(sorted(Counter(p["kind"] for p in prog_list).items()))),
        ("programsBySourceStatus", dict(sorted(Counter(p["sourceStatus"] for p in prog_list).items()))),
        ("courseCount", len(courses)),
        ("coursesWithPageCode", sum(1 for c in courses if c["codeSource"] == "PAGE")),
        ("coursesWithCatalogNameMatchedCode", sum(1 for c in courses if c["codeSource"] == "CATALOG_NAME_MATCH")),
        ("mappingsWithNameMatchedCode", sum(1 for c in courses for m in c["mappings"] if m["codeMatchedByName"])),
        ("coursesWithSyntheticCode", sum(1 for c in courses if c["codeSource"] == "SYNTHETIC")),
        ("mappingCount", sum(len(c["mappings"]) for c in courses)),
        ("procedureCount", len(procedures)),
        ("proceduresByType", dict(sorted(Counter(p["type"] for p in procedures).items()))),
        ("microdegreeCount", len(microdegrees)),
        ("microdegreesWithCourseList", sum(1 for m in microdegrees if m["courses"])),
        ("sourceCount", len(sources)),
        ("catalogDiff", catalog_diff),
    ])

    output = OrderedDict([
        ("schemaVersion", "2.0"),
        ("crawledAt", ACCESSED),
        ("summary", summary),
        ("sources", sources),
        ("colleges", [OrderedDict([("id", i), ("name", n)]) for i, n in COLLEGES]),
        ("programs", prog_list),
        ("courses", courses),
        ("requirementProfiles", profiles),
        ("graduation", graduation),
        ("procedures", procedures),
        ("microdegrees", microdegrees),
        ("knownConflicts", known_conflicts),
        ("coverageLimits", coverage_limits),
    ])
    rendered = dump(output)
    if MASKED_ID.search(rendered):
        raise SystemExit("masked student identifier leaked into reference.json")
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        fh.write(rendered)

    # Console summary
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(rendered.encode('utf-8'))} bytes)")
    for k in ("programCount", "programsByStatus", "programsByKind", "programsBySourceStatus", "courseCount",
              "coursesWithPageCode", "coursesWithCatalogNameMatchedCode", "mappingsWithNameMatchedCode",
              "coursesWithSyntheticCode",
              "mappingCount", "procedureCount", "proceduresByType", "microdegreeCount", "microdegreesWithCourseList"):
        print(f"  {k}: {summary[k]}")


if __name__ == "__main__":
    main()
