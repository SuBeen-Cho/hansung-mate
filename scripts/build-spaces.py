"""Build data/normalized/spaces.json from the 2026-10-26 public crawl.

Inputs are public pages only (learning-space table, operating hours, overnight-stay rules,
coding-lounge public reservation calendar). The calendar lists room numbers and time ranges
only; no applicant data exists in the source.

Run: python3 -I scripts/build-spaces.py
"""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/hansung-2026-10-26/notices-pages.json"
OUT = ROOT / "data/normalized/spaces.json"
BASE = "https://www.hansung.ac.kr"

raw = json.loads(RAW.read_text(encoding="utf-8"))
pages = {p["p"]: p for p in raw["pages"]}

SRC = {
    "learning": BASE + "/hansung/6161/subview.do",
    "hours": BASE + "/cncschool/4157/subview.do",
    "coding": BASE + "/cncschool/4182/subview.do",
    "codingInfo": BASE + "/cncschool/5934/subview.do",
    "night": BASE + "/hansung/6139/subview.do",
    "classroom": BASE + "/hansung/6164/subview.do",
    "examLibrary": BASE + "/bbs/hansung/2127/222531/artclView.do",
    "faq": BASE + "/hansung/6148/subview.do",
}


def parse_coding_calendar():
    """Return {date: {room: [[start, end], ...]}} from the October 2026 public calendar."""
    page = pages["/cncschool/4182/subview.do"]
    month = re.search(r"(\d{4})년 (\d{1,2})월", page["text"])
    year, mon = int(month.group(1)), int(month.group(2))
    out = defaultdict(lambda: defaultdict(list))
    for table in page["tables"]:
        for row in table[1:]:
            for cell in row:
                m = re.match(r"^(\d{1,2})\b(.*)$", cell.strip())
                if not m:
                    continue
                day = int(m.group(1))
                date = f"{year:04d}-{mon:02d}-{day:02d}"
                for room, start, end in re.findall(
                    r"세미나실 (\d{3})호 (\d{2}:\d{2})~(\d{2}:\d{2})", m.group(2)
                ):
                    out[date][room].append([start, end])
    return year, mon, {d: {r: sorted(v) for r, v in rooms.items()} for d, rooms in sorted(out.items())}


year, mon, calendar = parse_coding_calendar()
coding_rooms = [f"{n}" for n in range(101, 114)]

spaces = []
for room in coding_rooms:
    spaces.append(
        {
            "id": f"coding-{room}",
            "name": f"코딩라운지 세미나실 {room}호",
            "building": "공학관A동 1층 코딩라운지",
            "group": "코딩라운지",
            "kind": "INSTANT",
            "capacityMin": None,
            "capacityMax": 8,
            "capacityVerified": False,
            "open": "09:00",
            "close": "21:00",
            "hoursVerified": True,
            "vacationOpen": "10:00",
            "vacationClose": "16:00",
            "booking": "스마트융합교육센터 홈페이지 시설예약 → 코딩라운지 → 공간예약 · 실물 신분증 지참",
            "features": ["세미나·팀 프로젝트", "음식물 취식 금지"],
            "sourceUrl": SRC["coding"],
            "notes": "학기 중 09:00~21:00, 방학 10:00~16:00(공간 이용 FAQ). 방 번호와 예약 시간은 공개 달력 관찰값. 정원은 공개되지 않아 데모용 8명으로 둠.",
        }
    )

for n in range(1, 5):
    spaces.append(
        {
            "id": f"base-ib10{n}",
            "name": f"상상베이스 그룹스터디룸 IB10{n}",
            "building": "상상관 B2층",
            "group": "상상베이스",
            "kind": "INSTANT",
            "capacityMin": 4,
            "capacityMax": 8,
            "capacityVerified": True,
            "open": "09:00",
            "close": "22:00",
            "hoursVerified": False,
            "booking": "자원예약시스템 온라인 예약 · 02-760-8000",
            "features": ["접이식 가벽"],
            "sourceUrl": SRC["learning"],
            "notes": "공식 안내의 그룹스터디룸 IB101~104. 운영시간은 공개 자료에서 확인하지 못함.",
        }
    )

spaces += [
    {
        "id": "base-seminar",
        "name": "상상베이스 세미나실",
        "building": "상상관 B2층",
        "group": "상상베이스",
        "kind": "INSTANT",
        "capacityMin": 6,
        "capacityMax": 16,
        "capacityVerified": True,
        "open": "09:00",
        "close": "22:00",
        "hoursVerified": False,
        "booking": "자원예약시스템 온라인 예약 · 02-760-8000",
        "features": ["86인치 TV"],
        "sourceUrl": SRC["learning"],
        "notes": "호실 번호는 공개 자료에 없음.",
    },
    {
        "id": "library-group",
        "name": "학술정보관 그룹스터디실",
        "building": "학술정보관 3~6층",
        "group": "학술정보관",
        "kind": "INSTANT",
        "capacityMin": 3,
        "capacityMax": 11,
        "capacityVerified": True,
        "open": "09:00",
        "close": "21:00",
        "hoursVerified": False,
        "booking": "온라인 예약 · 02-760-5667, 5695",
        "features": ["TV"],
        "sourceUrl": SRC["learning"],
        "notes": "층별 호실 목록은 공개 자료에 없음.",
    },
    {
        "id": "parkplus-room",
        "name": "상상파크플러스 소모임실",
        "building": "공학관 B1층",
        "group": "상상파크플러스",
        "kind": "INSTANT",
        "capacityMin": None,
        "capacityMax": 8,
        "capacityVerified": True,
        "open": "09:00",
        "close": "21:00",
        "hoursVerified": True,
        "booking": "온라인 예약",
        "features": ["TV 또는 빔프로젝터"],
        "sourceUrl": SRC["learning"],
        "notes": "학기 중 평일 09:00~21:00, 방학 10:00~16:00, 주말·공휴일 미운영(센터 운영시간). FAQ의 09:00~17:00 표기와 충돌.",
        "vacationOpen": "10:00",
        "vacationClose": "16:00",
        "closedWeekends": True,
        "closedHolidays": True,
    },
    {
        "id": "park-cnc",
        "name": "상상파크 C&C멀티스튜디오",
        "building": "연구관 1층",
        "group": "상상파크",
        "kind": "INSTANT",
        "capacityMin": None,
        "capacityMax": 36,
        "capacityVerified": True,
        "open": "09:00",
        "close": "21:00",
        "hoursVerified": True,
        "booking": "일정이 없을 때 자유 이용",
        "vacationOpen": "10:00",
        "vacationClose": "16:00",
        "closedWeekends": True,
        "closedHolidays": True,
        "features": ["공구류 이용"],
        "sourceUrl": SRC["learning"],
        "notes": "",
    },
    {
        "id": "classroom",
        "name": "강의실 (미래관·우촌관·탐구관·진리관)",
        "building": "강의동",
        "group": "강의실",
        "kind": "ROOM",
        "capacityMin": None,
        "capacityMax": 120,
        "capacityVerified": False,
        "open": "09:00",
        "close": "22:00",
        "hoursVerified": False,
        "booking": "학사운영팀에 사용 여부 확인 후 IT인프라팀에 신청서 제출",
        "features": ["빈 강의실 현황 공개"],
        "sourceUrl": SRC["classroom"],
        "notes": "실제 호실은 신청서에 직접 기재.",
    },
]

exam_spaces = [
    {"id": "exam-creative", "name": "창의열람실", "building": "학술정보관 일반열람실", "capacity": None,
     "observed": "2026-1 기말 연장운영 6.2~6.22 24시간 상시 개방", "sourceUrl": SRC["examLibrary"], "verified": True},
    {"id": "exam-focus", "name": "집중열람실", "building": "학술정보관 4층", "capacity": 162,
     "observed": "평소 06:30~23:00, 시험기간 연장운영 24시간 · 노트북 이용 불가", "sourceUrl": SRC["examLibrary"], "verified": True},
    {"id": "exam-wuchon", "name": "우촌관열람실", "building": "우촌관 101호", "capacity": 55,
     "observed": "24시간 운영", "sourceUrl": SRC["learning"], "verified": True},
    {"id": "exam-park", "name": "상상파크", "building": "연구관 1층", "capacity": 150,
     "observed": "시험기간 야간 운영 근거 미확인 · 운영 부서 확인 필요", "sourceUrl": SRC["hours"], "verified": False},
    {"id": "exam-base", "name": "상상베이스 자유이용공간", "building": "상상관 B2층", "capacity": 50,
     "observed": "시험기간 야간 운영 근거 미확인 · 운영 부서 확인 필요", "sourceUrl": SRC["learning"], "verified": False},
]

night_rules = {
    "minMembers": 5,
    "unit": "1주일 단위",
    "submitBefore": "최소 하루 전, 부득이한 당일 제출은 낮 12시 전",
    "office": "학생복지팀 방문 제출·승인 → 승인 사본을 교내 캡스 상황실에 제출",
    "sourceUrl": SRC["night"],
}

result = {
    "schemaVersion": "1.0",
    "crawledAt": "2026-10-26",
    "sources": SRC,
    "spaces": spaces,
    "examSpaces": exam_spaces,
    "nightStay": night_rules,
    "codingLoungeCalendar": {
        "month": f"{year:04d}-{mon:02d}",
        "note": "공개 예약 달력의 방 번호·시간 관찰값. 같은 요일 패턴을 데모 점유로 사용한다.",
        "days": calendar,
    },
}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
booked = sum(len(v) for d in calendar.values() for v in d.values())
print(f"spaces={len(spaces)} exam={len(exam_spaces)} calendarDays={len(calendar)} bookedSlots={booked}")
