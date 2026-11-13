#!/usr/bin/env python3
"""Build data/normalized/graduation-requirements.json (학과·트랙별 졸업요건).

Inputs (read-only):
  data/normalized/reference.json                      -> program names / status
  data/raw/hansung-2026-10-26/curricula.json          -> grads[] dedicated 졸업요건 pages
  data/raw/hansung-2026-10-26/grad-search.json        -> arts[] board posts, results[] menu pages

The requirement texts were read by hand from those inputs; the mapping decisions
(which source applies to which program, and the condensed Korean summary) are
embedded below in PROGRAMS. The script checks every cited source exists in the
inputs, pulls post dates from the crawled text, validates field limits and that
every reference program is covered exactly once.

Run:  python3 -I scripts/build-graduation-requirements.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hansung-2026-10-26"
OUT = ROOT / "data" / "normalized" / "graduation-requirements.json"
BASE = "https://www.hansung.ac.kr"
KINDS = {"EXAM", "CERTIFICATE", "WORK", "PROJECT", "PAPER", "POINTS", "COURSE", "PORTFOLIO", "OTHER"}

# ---------------------------------------------------------------- sources
# key -> (href, title). Title None = take from crawl.
S = {
    # dedicated pages (curricula.json grads[])
    "p_litcon_track": ("/HmnArt/5596/subview.do", "문학문화콘텐츠트랙 졸업요건"),
    "p_kic": ("/HmnArt/5618/subview.do", "지식정보문화트랙 트랙졸업요건"),
    "p_dhi": ("/HmnArt/5625/subview.do", "디지털인문정보학트랙 트랙졸업요건"),
    "p_hcur": ("/HmnArt/5632/subview.do", "역사문화큐레이션트랙 트랙졸업요건(내용 없음)"),
    "p_hcon": ("/HmnArt/5639/subview.do", "역사콘텐츠트랙 트랙졸업요건(내용 없음)"),
    "p_engcon": ("/HmnArt/5646/subview.do", "영미문화콘텐츠트랙 트랙졸업요건(페이지 준비중)"),
    "p_kdance": ("/HmnArt/5667/subview.do", "한국무용전공 트랙졸업요건"),
    "p_mdance": ("/HmnArt/5674/subview.do", "현대무용전공 트랙졸업요건"),
    "p_ballet": ("/HmnArt/5681/subview.do", "발레전공 트랙졸업요건"),
    "p_fmkt": ("/Design/5108/subview.do", "패션마케팅트랙 트랙졸업요건(내용 없음)"),
    "p_fdes": ("/Design/5115/subview.do", "패션디자인트랙 트랙졸업요건(내용 없음)"),
    "p_fcd": ("/Design/5122/subview.do", "패션크리에이티브디렉션트랙 트랙졸업요건(내용 없음)"),
    "p_elec": ("/Engineering/4920/subview.do", "전자트랙 트랙졸업요건(게시판 목록)"),
    "p_semi": ("/Engineering/4927/subview.do", "시스템반도체트랙 트랙졸업요건(게시판 목록)"),
    "p_infosys": ("/Engineering/4948/subview.do", "정보시스템트랙 트랙졸업요건(게시판 목록)"),
    "p_mech": ("/Engineering/4934/subview.do", "기계시스템디자인트랙 트랙졸업요건"),
    "p_airobot": ("/Engineering/4941/subview.do", "AI로봇융합트랙 트랙졸업요건"),
    "p_ie": ("/Engineering/4997/subview.do", "산업공학트랙 트랙졸업요건"),
    "p_sme": ("/Engineering/5004/subview.do", "시스템경영공학트랙 트랙졸업요건"),
    "p_plog": ("/Engineering/5011/subview.do", "생산물류시스템트랙 트랙졸업요건"),
    "p_cons": ("/Engineering/5018/subview.do", "컨설팅트랙 트랙졸업요건"),
    "p_aide": ("/Engineering/5025/subview.do", "응용산업데이터공학트랙 트랙졸업요건"),
    "p_litcon_dept": ("/CreCon/2772/subview.do", "문학문화콘텐츠학과 졸업요건"),
    # 2026-10-26 2차 수집(grad-search-2.json): 게시글 본문·이미지 확인
    "a_elec": ("/bbs/Engineering/1553/1592/artclView.do", None),
    "a_semi": ("/bbs/Engineering/1557/222699/artclView.do", None),
    "a_semi_capstone": ("/bbs/Engineering/1556/220447/artclView.do", None),
    "a_litcon_pdf": ("/bbs/CreCon/1948/222306/artclView.do", None),
    "p_aiapp": ("/CreCon/2781/subview.do", "AI응용학과 졸업요건"),
    "p_csec": ("/CreCon/2791/subview.do", "융합보안학과 졸업요건"),
    "p_mob": ("/CreCon/2800/subview.do", "미래모빌리티학과 졸업요건"),
    "p_kled": ("/global/7579/subview.do", "한국언어문화교육학과 졸업 요건"),
    "p_gkb": ("/global/7580/subview.do", "글로벌K비즈니스학과 졸업 요건"),
    "p_vent": ("/global/7581/subview.do", "영상엔터테인먼트학과 졸업 요건"),
    "p_fbc": ("/global/7582/subview.do", "패션뷰티크리에이션학과 졸업 요건"),
    "p_swc": ("/global/7583/subview.do", "SW융합학과 졸업 요건"),
    "p_gvs": ("/global/7584/subview.do", "글로벌벤처창업학과 졸업 요건"),
    "p_fp": ("/futureplus/721/subview.do", "미래플러스대학 학과 졸업요건"),
    # board posts (grad-search.json arts[])
    "a_engl_lit": ("/bbs/HmnArt/1980/218024/artclView.do", None),
    "a_engl_ling": ("/bbs/HmnArt/1982/218021/artclView.do", None),
    "a_engl_con": ("/bbs/HmnArt/1996/218018/artclView.do", None),
    "a_kedu": ("/bbs/HmnArt/1981/218026/artclView.do", None),
    "a_kedu_sub": ("/bbs/HmnArt/1981/222776/artclView.do", None),
    "a_litcon": ("/bbs/HmnArt/1985/27975/artclView.do", None),
    "a_hist1986": ("/bbs/HmnArt/1986/222934/artclView.do", None),
    "a_hist1987": ("/bbs/HmnArt/1987/222935/artclView.do", None),
    "a_lis_exam_kic": ("/bbs/HmnArt/1988/221749/artclView.do", None),
    "a_lis_rev_kic": ("/bbs/HmnArt/1988/28335/artclView.do", None),
    "a_lis_exam_dhi": ("/bbs/HmnArt/1989/221748/artclView.do", None),
    "a_lis_rev_dhi": ("/bbs/HmnArt/1989/28576/artclView.do", None),
    "a_trade_exam": ("/bbs/SclScn/1765/221954/artclView.do", None),
    "a_trade_cert": ("/bbs/SclScn/1765/225326/artclView.do", None),
    "a_econ_261": ("/bbs/SclScn/1767/222745/artclView.do", None),
    "a_econ_252": ("/bbs/SclScn/1767/11931/artclView.do", None),
    "a_econ_241": ("/bbs/SclScn/1767/11926/artclView.do", None),
    "a_pa_262": ("/bbs/SclScn/1768/225556/artclView.do", None),
    "a_law_262": ("/bbs/SclScn/1764/225557/artclView.do", None),
    "a_re_262": ("/bbs/SclScn/1763/225581/artclView.do", None),
    "a_smart_262": ("/bbs/SclScn/1762/225584/artclView.do", None),
    "a_smart_foreign": ("/bbs/SclScn/1762/12216/artclView.do", None),
    "a_beauty": ("/bbs/Design/1743/223173/artclView.do", None),
    "a_cse_rule": ("/bbs/Engineering/1537/1576/artclView.do", None),
    "a_cse_thesis": ("/bbs/Engineering/1537/1577/artclView.do", None),
    "a_it_int": ("/bbs/Engineering/1545/222963/artclView.do", None),
    "a_it_iot": ("/bbs/Engineering/1544/222964/artclView.do", None),
    "a_it_sec": ("/bbs/Engineering/1543/222965/artclView.do", None),
    "a_it_ict": ("/bbs/Engineering/1542/222966/artclView.do", None),
    "a_ie_sub": ("/bbs/Engineering/1552/223135/artclView.do", None),
    "a_aiapp_chg": ("/bbs/CreCon/1943/217982/artclView.do", None),
}

# ---------------------------------------------------------------- shared rule blocks
ENGLISH = dict(
    found=True,
    kinds=["CERTIFICATE", "OTHER", "PORTFOLIO"],
    summary=("글로벌캠프 참가와 토익 요건을 모두 충족. 캠프는 글로벌 문화언어 현장학습(1학기)·글로벌 자기주도 문화체험(2학기) 중 1개. "
             "토익은 900점 이상, 또는 학번별 800점 이상 기준(아래 학번별 규정), 또는 4대보험 취업생 특례 중 1개. "
             "OPIc·TOEIC Speaking(IH/150점 이상)으로 대체 가능."),
    options=["토익 900점 이상(유효기간 내)", "토익 800점 이상 + 학번별 추가조건", "4대보험 가입 취업생: 공인·모의토익 성적표 3장 + 재직·보험 증명"],
    minOptions=1,
    cohortRules=[
        {"cohorts": "23학번까지", "summary": "토익 800점 이상 1회(유효기간 내) 포함 공인토익 3회 응시 성적표 3장 제출."},
        {"cohorts": "24학번부터", "summary": "토익 800점 이상(유효기간 내) + 포트폴리오(프로젝트 합 5점: 개인 5·2~3인 3·4인 이상 2점, 영문 자기소개서 첨부, 10분 발표 형식) 제출. 포트폴리오 마감 매년 5월·11월 첫째 주 월요일."},
    ],
    substitutes=["OPIc Intermediate High 이상", "TOEIC Speaking 150점(IH) 이상"],
    submission="졸업서류는 매 학기 종강 2주 전~종강일 원본 제출(2026-1: 6/1~6/22, 진리관 402호 영어영문학부).",
)

HISTORY = dict(
    found=True,
    kinds=["WORK", "PAPER"],
    summary=("졸업작품(졸업논문 또는 콘텐츠)을 제출하고 지도교수 승인을 받아야 졸업 가능. 영상콘텐츠는 콘텐츠 기획서 필수, 공동제작은 대표 1명이 참여자 전원 기재해 제출. "
             "수업에서 제작한 콘텐츠 제출 시 지도교수 면담 생략 가능."),
    options=["졸업논문", "졸업 콘텐츠(+기획서)"],
    minOptions=1,
    submission="매 학기 졸업작품 제출 기간 공지(2026-1: 6/15~6/26) 역사트랙 이메일로 제출, 정해진 메일 제목·파일명 양식 준수.",
    note="역사 계열 4개 트랙 공동 공지(크리에이티브인문예술대학 교학팀). 미제출 시 졸업·졸업유예 불가. 첨부 HWP는 논문·콘텐츠 표지 양식.",
    confidence="MEDIUM",
)

def lis(track, other, extra_sub=None, extra_note=""):
    subs = ["졸업시험 대체 자격증(재학 중 취득, 1개당 1과목, 최대 4과목; 토익 850+는 2과목)",
            "전공 비교과포인트(총 950p 이상 시 1과목, 1,100p 이상 시 2과목)"]
    if extra_sub:
        subs.append(extra_sub)
    return dict(
        found=True,
        kinds=["EXAM", "CERTIFICATE", "POINTS"],
        summary=(f"졸업시험 합격이 졸업요건. {track} 출제과목 중 3과목 선택 응시, 100점 만점 70점 이상 합격(미통과 시 수료). "
                 f"1학기 1·2차, 2학기 3차 실시하며 1차 미응시자는 2·3차 응시 불가. 1·2트랙이 {other}와 함께면 두 트랙 과목 중 4과목 응시."),
        options=[],
        minOptions=None,
        cohortRules=[{"cohorts": "2022년 8월 졸업생부터", "summary": "현행 졸업시험 내규 적용(2025.3.24 개정: 70점 합격선, 1차 응시 필수, 재학 중 취득 자격증만 인정)."}],
        substitutes=subs,
        submission="졸업시험 신청은 매년 1학기(2026: 4/24~5/1) 학과 이메일로 신청서 제출, 1차 시험 5월 말. 자격증·비교과 대체 증빙은 졸업학기 종강일까지.",
        confidence="HIGH",
        note=("문헌정보전공(지식정보문화·디지털인문정보학) 공통 내규. 트랙 페이지는 비교과 대체 최대 1과목으로 적었으나 2025·2026 공지 FAQ는 300p로 2과목 대체 가능하다고 안내." + extra_note),
    )

ECON = dict(
    found=True,
    kinds=["CERTIFICATE", "OTHER"],
    summary=("경제학과 졸업요건 적용: 졸업논문을 쓰지 않은 학생은 공인어학시험 기준 충족, 지정 자격증 취득, 한성대 대학원 경제학과 석사 진학 중 1개 충족 서류 제출. "
             "MOS류 자격증은 불인정."),
    options=["공인어학(토익 600/토익스피킹 110/G-TELP 50/TEPS 520/OPIc IM2/HSK 4급/JLPT 2급 이상)",
             "자격증(공인회계사·세무사·감정평가사·투자자산운용사·재무분석사·SAS Base·전산세무회계 등)",
             "한성대 대학원 경제학과 석사과정 진학"],
    minOptions=1,
    cohortRules=[
        {"cohorts": "12학번 이전", "summary": "기타 졸업요건 해당 없음으로 표기되나 어학성적 또는 자격증 취득 서류 제출 요망."},
        {"cohorts": "12학번 이후", "summary": "17-1학기 이전 논문 합격자(경제학세미나 기수강 포함)는 충족 인정. 그 외에는 어학·자격증·대학원 진학 중 1개 필수."},
    ],
    substitutes=[],
    submission="매 학기 졸업요건 제출 기간에 학과 메일로 서류 제출(2026-1: 6/22~6/25 16시).",
)

PUBADMIN = dict(
    found=True,
    kinds=["CERTIFICATE", "EXAM", "OTHER"],
    summary=("졸업인증제도: 공무원 채용시험 합격, 취업(재직증명), 산업체 인턴십 40시간(또는 지식컨설팅 연계전공 수료), 공직·컴퓨터 자격증, 영어성적, 공공기관 봉사 50시간(또는 LEET 응시) 중 1개 이상 증빙 제출."),
    options=["공무원 채용시험 합격", "취업(졸업학기 말까지 재직증명, ROTC 포함)", "산업체 인턴십 40시간 또는 지식컨설팅 연계전공 수료",
             "자격증(행정사·정책분석평가사 2급·사회조사분석사 2급·정보처리(산업)기사·사무자동화산업기사·컴활 2급 이상)",
             "영어(TOEIC 750/TOEFL iBT 85/TOEIC S&W 각 140/TEPS 597/IELTS 6.0/G-TELP L2 69/OPIc IM2 이상)",
             "공공기관 자원봉사 50시간 또는 LEET 응시"],
    minOptions=1,
    cohortRules=[
        {"cohorts": "13학번부터", "summary": "졸업인증제도만 가능(표의 자격요건 중 1개 이상)."},
        {"cohorts": "12학번까지", "summary": "졸업시험(정책학원론·공공조직론·인사행정론 각 60점 이상), 3과목 모두 B+ 이상 성적증명서로 면제, 졸업인증제도 중 택1."},
    ],
    substitutes=["외국인 유학생: TOPIK 2급 이상 또는 전공 관련 essay 1편(학과장 심사)"],
    submission="매 학기 공지 기간 이메일 온라인 제출(2026-2: 11/30~12/11), 기간 외 제출 불인정. 워드프로세서·헌혈 불인정.",
    confidence="HIGH",
    note="행정학과 계열(공공행정·법&정책) 공통 졸업인증제도. 1트랙이면 졸업불가사유 B, 2트랙이면 B2 해소 절차.",
)

CSE = dict(
    found=True,
    kinds=["WORK", "PROJECT", "CERTIFICATE", "PAPER"],
    summary=("컴퓨터공학부 졸업내규: 17학번부터 캡스톤디자인 졸업작품을 지도교수 허가 후 졸업작품 전시회에 출품해야 함. "
             "16학번 이전은 정보처리기사 등 자격증, 졸업작품 출품, 교내외 공모전 입상, 졸업논문 합격 중 1개 이상."),
    options=["정보처리기사 또는 상응 자격증", "졸업작품 전시회 출품(캡스톤디자인)", "교내외 공모전 입상", "졸업논문 제출·합격"],
    minOptions=1,
    cohortRules=[
        {"cohorts": "17학번 이후", "summary": "캡스톤디자인 졸업작품 전시회 출품이 졸업요건."},
        {"cohorts": "16학번 이전", "summary": "자격증·졸업작품 출품·공모전 입상·졸업논문 중 1개 이상."},
    ],
    substitutes=[],
    submission="졸업논문 희망자는 지도교수 승인 후 졸업예정 학기말까지 논문과 심사결과 보고서를 학과사무실에 제출.",
    confidence="MEDIUM",
    note="2024.01 학부 공통 내규(모바일소프트웨어트랙 게시판). 편입·복수·전과생도 동일 적용.",
)

ITC = dict(
    found=True,
    kinds=["CERTIFICATE", "PAPER", "PROJECT", "OTHER"],
    summary=("IT융합공학부 학부졸업요건 증빙을 제출해야 졸업불가사유 B가 해소됨. 공지 예시상 증빙은 자격증 취득확인서, 공인영어(토익·토플), 대회 수상 실적보고서, 학술대회 논문, 캡스톤디자인 결과보고서 등이며 "
             "캡스톤 수강만으로는 불인정. 학부 내 2개 트랙 이수 시 트랙별로 다른 서류 2부."),
    options=[],
    minOptions=None,
    substitutes=[],
    submission="매 학기 공지 기간 구글폼 제출(2026-1: 6/16 10시~6/23 12시), 파일명 [졸업요건]서류(트랙)_학번_이름.",
    confidence="LOW",
    note="세부 인정 기준은 학부 게시판 '졸업공지-졸업요건' 게시물과 종합정보시스템에 있어 수집되지 않음. 위 증빙 종류는 제출 공지의 예시에서만 확인됨.",
)

IE_COMMON = ("다음 4가지 중 1개 이상 충족: 트랙 인정 자격증 취득, 전국 규모 교외 공모전 입상, 전국 학술대회 구두발표 또는 등재후보지 이상 논문 게재, 트랙 인정 졸업논문(작품·프로젝트 포함) 제출.")

def ie(certs, extra_src=False):
    d = dict(
        found=True,
        kinds=["CERTIFICATE", "PAPER", "PROJECT", "OTHER"],
        summary=IE_COMMON + " 졸업 직전 학기에 증빙 서류를 학과에 제출.",
        options=["트랙 인정 자격증", "교외 공모전 입상(대학생 대상 전국 규모)", "학술대회 구두발표 또는 등재후보지 이상 게재", "졸업논문(작품·프로젝트)"],
        minOptions=1,
        substitutes=certs,
        submission="졸업 직전 학기에 학과 이메일로 직인 있는 확인서 PDF 제출(2026-8 졸업: 수료생 6/25, 재학생 7/6까지).",
        confidence="HIGH",
        note="졸업논문(작품·프로젝트) 기준은 매 학기 초 공고. 트랙 주임교수가 심사.",
    )
    return d

IE_CERTS = ["품질경영기사", "인간공학기사", "산업안전기사", "물류관리사", "정보처리기사", "ERP정보관리사 1급", "경영지도사", "기술지도사",
            "유통관리사 2급 이상", "마케팅통계분석가 XL", "비즈니스머신러닝 XL", "정보처리산업기사", "빅데이터분석기사", "CPIM", "SAP Certificate"]

NOT_FOUND = lambda note, sources=(), attach=None: dict(found=False, kinds=[], summary="", options=[], minOptions=None,
                                                       cohortRules=[], substitutes=[], submission="", src=list(sources),
                                                       attachmentOnly=attach or [], confidence="LOW", note=note)

# ---------------------------------------------------------------- per-program decisions
PROGRAMS = {
    # 크리에이티브인문학부
    "영미문학문화트랙": dict(ENGLISH, src=["a_engl_lit", "a_engl_con", "a_engl_ling"], confidence="MEDIUM",
                        note="트랙 게시판 공지가 영미문화콘텐츠·영미언어정보 트랙 졸업요건을 따르도록 안내. 트랙소개의 예전 문구(문화체험+토익 900)보다 게시판 공지를 우선."),
    "영미언어정보트랙": dict(ENGLISH, src=["a_engl_ling"], confidence="HIGH",
                        note="게시물 작성일은 2022-03-11이지만 본문에 2026-1 제출기간이 반영돼 있어 갱신된 것으로 판단."),
    "영미문화콘텐츠트랙": dict(ENGLISH, src=["a_engl_con", "p_engcon"], confidence="HIGH",
                         note="트랙졸업요건 페이지는 '준비중'. 게시판 공지(본문에 2026-1 제출기간 반영) 기준."),
    "문학문화콘텐츠트랙": dict(
        found=True, kinds=["POINTS", "PORTFOLIO", "EXAM", "PAPER"],
        summary=("역량점수제: 4년간(1학년 포함) 필수 3점을 포함해 역량점수 20점 이상 취득. 항목은 지도교수 상담, 문화자원 콘텐츠화 프로젝트, 봉사, 학내외 활동, 자격증, 공모전, 직무수행능력 검증(필수 3점) 등. "
                 "1트랙·2트랙 모두 적용."),
        options=["문화콘텐츠 포트폴리오", "졸업시험(국어영역형)", "졸업논문"], minOptions=1,
        cohortRules=[{"cohorts": "17·18학번", "summary": "지도교수 상담 점수를 학기당 2점(2회 이상 상담)까지 인정(경과조치)."}],
        substitutes=[], submission="", src=["p_litcon_track", "a_litcon"], confidence="HIGH",
        note="options는 필수 항목 '직무수행능력 검증(5점 중 3점 필수)'에서 고르는 방식. 국어국문전공/한국어문학부(구 학과명)는 필수점수 없이 20점 이상(별도 항목표). 점검표는 HWP 첨부."),
    "한국어교육트랙": dict(
        found=True, kinds=["POINTS"],
        summary=("항목별 점수를 모아 인정받는 방식으로 보임(교육프로그램 참여 점수, 지도교수가 부여하는 한국어교육 콘텐츠 개발 점수 등). 졸업예정 학기 공지 기간에 증빙을 압축해 학과 메일로 제출."),
        options=[], minOptions=None, cohortRules=[], substitutes=[],
        submission="매 학기 졸업예정자 서류 제출 공지(2026-1: 6/2~6/21 24시) 학과 메일로 압축파일 제출, 제목·파일명 양식 준수.",
        src=["a_kedu_sub", "a_kedu"], confidence="LOW",
        note="필요 총점·항목표 원문은 수집되지 않음(게시판 공지는 제출 방법과 점수 인정 시 유의사항만 포함). 한국어교원 2급 자격은 졸업요건이 아니라 졸업 후 개별 신청."),
    "글로컬역사트랙": dict(HISTORY, src=["a_hist1986"]),
    "역사문화콘텐츠트랙": dict(HISTORY, src=["a_hist1987"]),
    "역사문화큐레이션트랙": dict(HISTORY, src=["a_hist1986", "p_hcur"]),
    "역사콘텐츠트랙": dict(HISTORY, src=["a_hist1987", "p_hcon"]),
    "지식정보문화트랙": dict(lis("지식정보문화트랙", "디지털인문정보학트랙"), src=["p_kic", "a_lis_exam_kic", "a_lis_rev_kic"]),
    "디지털인문정보학트랙": dict(lis("디지털인문정보학트랙", "지식정보문화트랙", extra_sub="웹콘텐츠 출판(트랙 교수 승인 시 2과목 대체)"),
                           src=["p_dhi", "a_lis_exam_dhi", "a_lis_rev_dhi"]),
    # 예술학부
    "동양화전공": NOT_FOUND("예술학부 사이트에 동양화전공 졸업요건 메뉴·게시물이 없음."),
    "서양화전공": NOT_FOUND("예술학부 사이트에 서양화전공 졸업요건 메뉴·게시물이 없음."),
    "한국무용전공": dict(found=True, kinds=["WORK"], summary="창작발표회 2회 참여와 졸업작품 발표.", options=[], minOptions=None,
                     cohortRules=[], substitutes=[], submission="", src=["p_kdance"], confidence="HIGH"),
    "현대무용전공": dict(found=True, kinds=["WORK"], summary="창작발표회 2회 참여와 졸업작품 발표.", options=[], minOptions=None,
                     cohortRules=[], substitutes=[], submission="", src=["p_mdance"], confidence="HIGH"),
    "발레전공": dict(found=True, kinds=["WORK"], summary="창작발표회 2회 참여와 졸업작품 발표.", options=[], minOptions=None,
                   cohortRules=[], substitutes=[], submission="", src=["p_ballet"], confidence="HIGH"),
    "이민·다문화트랙": NOT_FOUND("트랙소개 외 졸업요건 페이지·게시물 없음."),
    # 사회과학부
    "국제무역트랙": dict(
        found=True, kinds=["EXAM", "CERTIFICATE"],
        summary="무역학과/국제무역트랙 졸업시험이 있으며 지정 자격증 제출로 대체할 수 있음(게시물 제목 기준). 세부 과목·합격선·인정 자격증은 비공개 게시물이라 확인 불가.",
        options=["졸업시험 응시·합격", "졸업 대체자격증 제출"], minOptions=1, cohortRules=[], substitutes=[],
        submission="매 학기 졸업시험 안내와 졸업 대체자격증 제출 안내가 트랙 게시판에 공지됨(2027년 2월 졸업생 대상 공지 2026-10-12).",
        src=["a_trade_cert", "a_trade_exam"], confidence="LOW",
        note="해당 게시물 본문이 '접근 권한이 없습니다'(로그인 필요)로 수집되지 않음. 무역학과 = 국제무역트랙."),
    "글로벌비즈니스트랙": NOT_FOUND("트랙소개 외 졸업요건 게시물 없음."),
    "기업ㆍ경제분석트랙": dict(ECON, src=["a_econ_252", "a_econ_261"], confidence="MEDIUM",
                          note="금융·데이터분석트랙 게시판의 25-2 공지가 '기업경제분석,금융데이터분석트랙'을 함께 명시. 최신 26-1 공지도 동일한 경제학과 요건."),
    "경제금융투자트랙": dict(ECON, src=["a_econ_241", "a_econ_261"], confidence="MEDIUM",
                        note="트랙명은 24-1 공지('기업경제/경제금융투자/금융데이터분석트랙')에만 명시. 요건 본문은 최신 26-1 경제학과 졸업요건 기준(어학 기준은 2019-2부터 토익 600·토스 110으로 하향)."),
    "금융·데이터분석트랙": dict(ECON, src=["a_econ_261", "a_econ_252"], confidence="HIGH",
                           note="26-1학기 금융데이터분석트랙 졸업요건 공지 기준(경제학과 졸업요건, 18년 8월 졸업자부터 적용)."),
    "공공행정트랙": dict(PUBADMIN, src=["a_pa_262"]),
    "법&정책트랙": dict(PUBADMIN, src=["a_law_262"]),
    "부동산트랙": dict(
        found=True, kinds=["CERTIFICATE"],
        summary="공인외국어시험 성적 또는 공인자격증 중 1개만 제출. 입학 이후 취득분만 인정(편입생은 입학 전 취득도 인정), 영어성적 유효기간은 적용하지 않음.",
        options=["공인외국어(TOEIC 700/TOEFL PBT 537·CBT 203·iBT 74/TEPS 527/신HSK 5급/JPT 650/JLPT 4/OPIc IM2)",
                 "공인자격증(공인중개사, CFP·부동산투자상담사·펀드투자상담사·투자자산운용사, 한자·국어능력 2급 이상, 지적기사·정보처리기사·도시계획기사·컴활 1급, PCT 650점·MOS 마스터/MCAS, 감정평가사)"],
        minOptions=1, cohortRules=[], substitutes=[],
        submission="매 학기 자격증 제출기간 학과 메일로 제출(2026-2: 12/1~12/18), 제목 [졸업요건] 학번 이름 서류명.",
        src=["a_re_262"], confidence="HIGH",
        note="증권투자상담사·파생상품투자상담사는 불인정. 산업기사는 불인정(기사만). 외국어 표의 JLPT 기준은 원문 표기 '4'(1급 만점 기준)."),
    "스마트도시ㆍ교통계획트랙": dict(
        found=True, kinds=["PROJECT", "COURSE", "CERTIFICATE"],
        summary="두 요건 모두 충족: ①스마트도시 캡스톤디자인 이수(조기취업·IPP 등으로 불가 시 교수회의 승인 하에 졸업논문 대체) ②공인외국어시험 또는 지정 자격증 중 1개 제출. 입학 이후 취득분만 인정.",
        options=["공인외국어(TOEIC 600/TOEFL iBT 79/TEPS 298/OPIc IM2/신HSK 5급/JPT 650/JLPT 4)",
                 "자격증(도시계획·교통·지적기사, 감정평가사·공인중개사·CFP·부동산자산관리사·투자자산운용사, 한자·국어능력 2급↑, 정보처리기사·컴활 1급, PCT 650·MOS 마스터/MCAS, SAP)"],
        minOptions=1, cohortRules=[], substitutes=["캡스톤디자인 이수 불가 시 졸업논문(교수회의 승인)"],
        submission="매 학기 자격증 제출기간 학과 메일로 제출(2026-2: 12/1~12/18 23:59).",
        src=["a_smart_262", "a_smart_foreign"], confidence="HIGH",
        note="외국인학생(2025-1 공지): 캡스톤디자인 이수(불가 시 교수회의 승인 면제), TOPIK 4급 이상, 졸업논문. 영어성적 유효기간 미적용."),
    "기업경영트랙": NOT_FOUND("트랙소개 외 졸업요건 게시물 없음(경영학과 계열 게시판 미수집)."),
    "비즈니스애널리틱스트랙": NOT_FOUND("트랙소개 외 졸업요건 게시물 없음."),
    "회계ㆍ재무경영트랙": NOT_FOUND("트랙소개 외 졸업요건 게시물 없음."),
    # 글로벌패션산업학부
    "패션마케팅트랙": dict(
        found=True, kinds=["CERTIFICATE", "PORTFOLIO"],
        summary="두 가지 모두 충족: ①공인외국어 성적(토익 600점 이상 또는 표 1의 6등급 이상 동등 성적) 또는 패션 관련 자격증(MOS·GTQ·컬러리스트산업기사 등) ②개인 포트폴리오 제출.",
        options=[], minOptions=None,
        cohortRules=[{"cohorts": "17학번 이후 또는 2021년 졸업예정자부터", "summary": "트랙별 졸업인증 요건 적용."}],
        substitutes=["공인외국어 대신 패션 관련 자격증(MOS, VMD, 샵마스터, GTQ, ACA, 컴퓨터활용능력, 컬러리스트산업기사, 유통관리사, 컴퓨터그래픽스운용기능사, 양장·한복기능사 등)"],
        submission="",
        src=["p_fmkt"], confidence="HIGH",
        note="트랙졸업요건 페이지가 이미지로만 게시되어 이미지를 직접 확인함(글로벌패션산업학부 3개 트랙 공통)."),
    "패션디자인트랙": dict(
        found=True, kinds=["CERTIFICATE", "PORTFOLIO"],
        summary="두 가지 모두 충족: ①공인외국어 성적(토익 600점 이상 또는 표 1의 6등급 이상 동등 성적) 또는 패션 관련 자격증(MOS·GTQ·컬러리스트산업기사 등) ②개인 포트폴리오 제출.",
        options=[], minOptions=None,
        cohortRules=[{"cohorts": "17학번 이후 또는 2021년 졸업예정자부터", "summary": "트랙별 졸업인증 요건 적용."}],
        substitutes=["공인외국어 대신 패션 관련 자격증(MOS, VMD, 샵마스터, GTQ, ACA, 컴퓨터활용능력, 컬러리스트산업기사, 유통관리사, 컴퓨터그래픽스운용기능사, 양장·한복기능사 등)"],
        submission="",
        src=["p_fdes"], confidence="HIGH",
        note="트랙졸업요건 페이지가 이미지로만 게시되어 이미지를 직접 확인함(글로벌패션산업학부 3개 트랙 공통)."),
    "패션크리에이티브디렉션트랙": dict(
        found=True, kinds=["CERTIFICATE", "PORTFOLIO"],
        summary="두 가지 모두 충족: ①공인외국어 성적(토익 600점 이상 또는 표 1의 6등급 이상 동등 성적) 또는 패션 관련 자격증(MOS·GTQ·컬러리스트산업기사 등) ②개인 포트폴리오 제출.",
        options=[], minOptions=None,
        cohortRules=[{"cohorts": "17학번 이후 또는 2021년 졸업예정자부터", "summary": "트랙별 졸업인증 요건 적용."}],
        substitutes=["공인외국어 대신 패션 관련 자격증(MOS, VMD, 샵마스터, GTQ, ACA, 컴퓨터활용능력, 컬러리스트산업기사, 유통관리사, 컴퓨터그래픽스운용기능사, 양장·한복기능사 등)"],
        submission="",
        src=["p_fcd"], confidence="HIGH",
        note="트랙졸업요건 페이지가 이미지로만 게시되어 이미지를 직접 확인함(글로벌패션산업학부 3개 트랙 공통)."),
    # ICT디자인학부
    "영상ㆍ애니메이션디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "미디어디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "제품·서비스디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "시각디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "VMDㆍ전시디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "인테리어디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "UX/UI디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    "게임그래픽디자인트랙": NOT_FOUND("ICT디자인학부 사이트에 졸업요건 메뉴·게시물 없음."),
    # 뷰티
    "뷰티디자인매니지먼트학과": dict(
        found=True, kinds=["WORK", "CERTIFICATE", "OTHER"],
        summary="졸업전시회 작품 출품·전시는 공통 필수. 1트랙(단일트랙 포함) 내국인은 미용사 자격증 1개 이상과 미용대회 1회 이상 참가도 필요, 외국인은 자격증 또는 대회 중 1개. 2트랙은 졸업전시회만.",
        options=[], minOptions=None,
        cohortRules=[
            {"cohorts": "1트랙(단일트랙 포함)·내국인", "summary": "졸업전시회 출품·전시 + 미용사 자격증 1개 이상(입학 전 취득 인정) + 미용대회 1회 이상 참가."},
            {"cohorts": "1트랙·외국인", "summary": "졸업전시회 출품·전시 + 미용사 자격증 1개 이상 또는 미용대회 1회 참가."},
            {"cohorts": "2트랙", "summary": "졸업전시회 작품 출품·전시."},
        ],
        substitutes=[],
        submission="매 학기 졸업예정자 서류 제출 기간(2026-1: 6/29~7/2 17시) 학과 메일로 PDF 압축 제출. 자격증은 자격취득확인서 원본 PDF.",
        src=["a_beauty"], confidence="HIGH",
        note="cohortRules는 학번이 아니라 트랙·국적 구분. 인정 자격증: 미용사(일반·메이크업·피부·네일) 국가기술자격, 맞춤형화장품조제관리사. 원문에 '4학년 편입 X' 표기."),
    "뷰티매니지먼트학과(계약학과)": NOT_FOUND("학과소개에 졸업작품(뷰티 스타일 쇼, 브랜드기획) 교육목표만 있고 졸업요건 공지 없음."),
    # 컴퓨터공학부
    "웹공학트랙": dict(CSE, src=["a_cse_rule"]),
    "모바일소프트웨어트랙": dict(CSE, src=["a_cse_rule", "a_cse_thesis"]),
    "디지털콘텐츠ㆍ가상현실트랙": dict(CSE, src=["a_cse_rule"]),
    "빅데이터트랙": dict(CSE, src=["a_cse_rule"]),
    # 기계전자공학부
    "기계시스템디자인트랙": dict(
        found=True, kinds=["COURSE", "PROJECT", "PAPER"],
        summary="트랙 개설 15과목(45학점) 중 13과목(39학점) 이상 이수. 1학년 창의적기계설계 필수, 2~3학년 트랙필수 5과목 중 4과목 이상, 4학년 기계시스템디자인캡스톤디자인(졸업논문) 반드시 수강.",
        options=[], minOptions=None, cohortRules=[], substitutes=["AI로봇융합트랙 2~4학년 지정 과목 수강 인정"], submission="",
        src=["p_mech"], confidence="HIGH"),
    "AI로봇융합트랙": dict(
        found=True, kinds=["COURSE", "PROJECT", "PAPER"],
        summary="트랙 개설 15과목(45학점) 중 13과목(39학점) 이상 이수. 1학년 로봇공학기초 필수, 2~3학년 트랙필수 5과목 중 4과목 이상, 4학년 AI로봇융합캡스톤디자인(졸업논문) 반드시 수강.",
        options=[], minOptions=None, cohortRules=[], substitutes=["기계시스템디자인트랙 2~4학년 지정 과목 수강 인정"], submission="",
        src=["p_airobot"], confidence="HIGH"),
    "전자트랙": dict(
        found=True, kinds=["PROJECT", "WORK", "COURSE"],
        summary="트랙 39학점(전공기초 3·전공지정 15·전공선택 21) 이수와 전자종합설계프로젝트 수강 및 작품 출품. 외부 경진대회 수상 시 작품 출품 예외.",
        options=[], minOptions=None, cohortRules=[], substitutes=["외부 경진대회 수상"], submission="",
        src=["p_elec", "a_elec"], confidence="MEDIUM",
        note="전자트랙 졸업요건 메뉴가 기계전자공학부 공용 게시판(게시물 제목 '정보시스템트랙 졸업요건', 2025-01-22)으로 연결됨."),
    "시스템반도체트랙": dict(
        found=True, kinds=["PROJECT", "COURSE", "WORK"],
        summary="트랙 39학점(전공기초 3·전공필수 15·전공선택 21). 2026년부터 시스템반도체 캡스톤디자인(1학기) 또는 SoC 캡스톤디자인(2학기) 수강 필수, 전국 규모 경진대회 수상으로 대체 가능(교수회의 결정).",
        options=[], minOptions=None,
        cohortRules=[
            {"cohorts": "2026년 이전 충족자", "summary": "전자·시스템반도체·정보시스템 종합설계프로젝트 중 1과목 수강 후 작품 1개 출품(또는 전국 경진대회 수상)으로 충족, 이후 요건 무관."},
            {"cohorts": "2026년 이후", "summary": "시스템반도체 캡스톤디자인 또는 SoC 캡스톤디자인 수강(전자종합설계프로젝트와 별도)."},
        ],
        substitutes=["전국 규모 경진대회 수상(교수회의 인정)"], submission="",
        src=["p_semi", "a_semi", "a_semi_capstone"], confidence="HIGH",
        note="2025-1학기 이전 전자종합설계프로젝트 이수자는 캡스톤 요건 충족으로 간주."),
    "정보시스템트랙": NOT_FOUND("트랙졸업요건 게시판에 '정보시스템트랙 졸업요건'(2025-01-22) 게시물이 있으나 본문 미수집.", ["p_infosys"]),
    "기계설계트랙": NOT_FOUND("트랙소개 외 졸업요건 페이지 없음."),
    "기계자동화트랙": NOT_FOUND("트랙소개 외 졸업요건 페이지 없음."),
    # IT융합공학부 (폐지 트랙)
    "지능시스템트랙": dict(ITC, src=["a_it_int"]),
    "사물인터넷트랙": dict(ITC, src=["a_it_iot"]),
    "사이버보안트랙": dict(ITC, src=["a_it_sec"], note=ITC["note"] + " 캡스톤디자인이 개설되지 않은 폐지 트랙(사이버보안)은 성적증명서 제출."),
    "ICT융합엔터테인먼트트랙": dict(ITC, src=["a_it_ict"], note=ITC["note"] + " 캡스톤디자인이 개설되지 않은 폐지 트랙(ICT융합엔터테인먼트)은 성적증명서 제출."),
    # 산업시스템공학부
    "산업공학트랙": dict(ie(IE_CERTS), src=["p_ie", "a_ie_sub"]),
    "시스템경영공학트랙": dict(ie(IE_CERTS), src=["p_sme"]),
    "생산물류시스템트랙": dict(ie(IE_CERTS), src=["p_plog"]),
    "컨설팅트랙": dict(ie(["경영지도사", "기술지도사", "CMC(Certified Management Consultant)"]), src=["p_cons"]),
    "응용산업데이터공학트랙": dict(ie(["물류관리사", "정보처리기사", "ERP정보관리사 1급", "경영지도사(생산관리)", "기술지도사(생산관리)", "빅데이터분석기사", "CPIM", "SAP Certificate"]), src=["p_aide"]),
    "스마트제조혁신컨설팅학과(계약학과)": NOT_FOUND("학과소개(3학년 편입 계약학과) 외 졸업요건 정보 없음."),
    # 상상력인재학부 / 창의융합대학
    "자기설계전공": NOT_FOUND("수집된 페이지에 자기설계전공 졸업요건 없음."),
    "문학문화콘텐츠학과": dict(
        found=True, kinds=["POINTS", "PORTFOLIO", "OTHER"],
        summary="역량점수제: 4년간 25점 이상(직무 수행 능력 검증 필수 7점 포함). 항목: 지도교수 상담 6, 문화자원 콘텐츠화 프로젝트 6, 봉사 5, 학내외 활동 5, 자격증 5, 공모전 입상 5, 직무 수행 능력 검증(포트폴리오) 10.",
        options=[], minOptions=None, cohortRules=[], substitutes=[],
        submission="졸업예정 시 포트폴리오(스토리텔링·문화콘텐츠 기획·신기술 활용 역량 중 해당) 제출, 최종 판정은 학과 교수회의.",
        src=["p_litcon_dept", "a_litcon_pdf"], confidence="HIGH",
        note="졸업요건 페이지 이미지와 2026-05-14 공지(PDF 첨부)로 확인."),
    "AI응용학과": dict(
        found=True, kinds=["CERTIFICATE", "PAPER", "OTHER", "PROJECT", "COURSE"],
        summary="필수요건 모두 충족: ①졸업인증(TOEIC 700 이상, 단독 제1저자 논문, 지정 공모전 참여 중 1개) ②인공지능 캡스톤디자인 이수 ③기업연계형 프로젝트(기업연계 교과 1과목 이수 또는 산학 프로젝트 수행). 충족 후 인정 신청서 제출.",
        options=["TOEIC 700점 이상(타 시험은 학과장 사전 승인)", "국내외 학술대회 발표·학술지 게재(단독 제1저자)", "교내외 공모전 참여(SW중심대학 경진대회 등, 캡스톤 전시회 불인정)"],
        minOptions=1,
        cohortRules=[
            {"cohorts": "27년 2월 졸업 예정자부터", "summary": "인공지능 캡스톤디자인 이수 필수(25-1학기 종료 기준 6학기 이상 이수자는 제외)."},
            {"cohorts": "25학번부터", "summary": "기업연계형 프로젝트 필수: 기업연계 AI캡스톤디자인·인공지능 캡스톤디자인(기업연계 시)·산학협력 프로젝트 중 1과목 이수 또는 산학공동연구 등 참여."},
        ],
        substitutes=[],
        submission="모든 필수요건 충족 후 졸업요건 인정 신청서를 학과사무실에 제출. 기간·방법은 매 학기 학과 게시판 공지.",
        src=["p_aiapp", "a_aiapp_chg"], confidence="HIGH"),
    "융합보안학과": dict(
        found=True, kinds=["PAPER", "OTHER", "PROJECT", "CERTIFICATE", "COURSE"],
        summary="역량 분야별 택1: 보안 엔지니어링 역량은 교외 학술대회 발표(1저자)·학술지 게재(1저자)·교외 공모전 입상·캡스톤디자인 참여·정보처리기사 중 1개, 암호·인증 역량은 정보처리기사를 뺀 4개 중 1개. 25학번 이후 산학협력 프로젝트 이수 필수.",
        options=["교외 학술대회 발표(1저자)", "학술지 게재(1저자)", "교외 공모전 입상", "캡스톤디자인 참여", "정보처리기사(보안 엔지니어링 역량만)"],
        minOptions=1,
        cohortRules=[{"cohorts": "25학번 이후", "summary": "산학협력 프로젝트형 교과 1과목 이상 이수 필수(인정 여부는 학과 사무실 확인)."}],
        substitutes=[], submission="", src=["p_csec"], confidence="HIGH"),
    "미래모빌리티학과": dict(found=True, kinds=["PROJECT", "COURSE"], summary="종합설계프로젝트 I, II 이수.", options=[], minOptions=None,
                         cohortRules=[], substitutes=[], submission="", src=["p_mob"], confidence="HIGH"),
    "창업트랙": NOT_FOUND("트랙 소개 페이지만 있고 졸업요건 정보 없음."),
    # 글로벌대학
    "한국언어문화교육학과": dict(
        found=True, kinds=["POINTS", "CERTIFICATE"],
        summary="졸업역량점수(졸업마일리지) 10점 이상 취득. 항목: 교육봉사·교육 프로그램 참여(최대 7점), 전공역량강화(콘텐츠 개발·전공역량 상담 등, 8점), TOPIK(4급 3·5급 4·6급 5점), 영어 2~3점, 제2외국어 2점.",
        options=[], minOptions=None, cohortRules=[], substitutes=[], submission="", src=["p_kled"], confidence="HIGH"),
    "글로벌K비즈니스학과": dict(
        found=True, kinds=["COURSE", "PROJECT", "OTHER"],
        summary="역량 인증 6개 조건 중 4건 이상 충족. 서로 다른 활동이면 같은 기준 내 중복 인정, 한 활동으로 여러 기준 중복 인정은 불가.",
        options=["현장학습 또는 현장연계형 수업 학점", "프로젝트형(PBL) 수업 학점", "취업 또는 학교 취업준비 프로그램 이수", "컴퓨터활용 수업 학점 또는 프로그램 이수",
                 "모국어 외 어학 특별수업 학점 또는 프로그램 이수", "캡스톤디자인·프로젝트형 수업 결과물 성과공유·확산"],
        minOptions=4, cohortRules=[], substitutes=[], submission="", src=["p_gkb"], confidence="HIGH"),
    "영상엔터테인먼트학과": dict(
        found=True, kinds=["PORTFOLIO", "WORK"],
        summary="전공 역량 인증 2개 조건 중 1개 충족.",
        options=["연기 오디션 포트폴리오(프로필 사진·자기소개·연기 영상 2분) 발표 및 상영회",
                 "팀/개인 영상(드라마·영화·뉴미디어 중 1편, 3분 이상) 제작 + 포트폴리오(제작노트) 제출 및 상영회"],
        minOptions=1, cohortRules=[], substitutes=[], submission="", src=["p_vent"], confidence="HIGH"),
    "패션뷰티크리에이션학과": dict(
        found=True, kinds=["WORK", "PROJECT", "CERTIFICATE", "OTHER"],
        summary="역량인증 5개 조건 중 2개 이상 충족.",
        options=["패션뷰티컬렉션 참여", "뷰티산학협력프로젝트 참여", "전공 관련 기술자격증 취득", "전공 관련 공모전 참가", "TOPIK 4급 이상"],
        minOptions=2, cohortRules=[], substitutes=[], submission="", src=["p_fbc"], confidence="HIGH"),
    "SW융합학과": dict(
        found=True, kinds=["PAPER", "OTHER", "PROJECT", "CERTIFICATE"],
        summary="5개 조건 중 1개 이상 충족.",
        options=["교외 학술대회 발표(1저자)", "학술지 게재(1저자)", "교외 공모전 입상", "캡스톤디자인 참여", "TOPIK 4급 이상"],
        minOptions=1, cohortRules=[], substitutes=[], submission="", src=["p_swc"], confidence="HIGH"),
    "글로벌벤처창업학과": dict(
        found=True, kinds=["PROJECT", "OTHER", "CERTIFICATE"],
        summary="역량인증 3개 조건 중 2개 이상 충족.",
        options=["캡스톤디자인 이수", "학과 인정 창업경진대회 입상", "TOPIK 4급 이상"],
        minOptions=2, cohortRules=[], substitutes=[], submission="", src=["p_gvs"], confidence="HIGH"),
    # 미래플러스대학
    "융합행정학과": dict(
        found=True, kinds=["PAPER", "EXAM", "CERTIFICATE"],
        summary="4개 조건 중 1개 충족. 법학사 학위는 졸업논문 제출만 가능. 기간 있는 자격증·영어성적은 기간 내 제시 시 인정, 그 밖에 입학 전 취득분은 불인정.",
        options=["졸업논문 제출(법학사 필수)", "공무원 채용시험 합격",
                 "공직/컴퓨터 자격증(행정사, 정책분석평가사 2급, 사회조사분석사 2급, 워드프로세서, 정보처리(산업)기사, 사무자동화산업기사, 컴활 2급)",
                 "영어(TOEIC 750/TOEFL iBT 85/TOEIC S&W 각 140/TEPS 597/IELTS 6.0 이상)"],
        minOptions=1, cohortRules=[], substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    "호텔외식경영학과": dict(
        found=True, kinds=["WORK", "PROJECT", "COURSE"],
        summary="졸업작품 제출·평가 100점 만점 80점 이상. 졸업작품은 캡스톤디자인 2과목 이수 후 제출하는 프로젝트 결과물로 인정(24학번부터).",
        options=[], minOptions=None,
        cohortRules=[{"cohorts": "24학번부터", "summary": "캡스톤디자인 2과목 이수 후 제출한 프로젝트 결과물을 졸업작품으로 인정."}],
        substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    "비즈니스컨설팅학과": dict(
        found=True, kinds=["PAPER", "PROJECT", "CERTIFICATE", "OTHER"],
        summary="4개 조건 중 1개 충족. 졸업논문에는 작품·프로젝트 포함(팀 수행 가능, 캡스톤디자인 2과목 이수 후 결과물 인정).",
        options=["졸업논문(작품·프로젝트 포함) 제출", "전공 자격증(SAP 국제공인, 사회조사분석사 2급, 경영지도사, 기술지도사, CMC)", "교외 공모전 입상", "학회 논문 발표"],
        minOptions=1, cohortRules=[], substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    "뷰티디자인학과": dict(
        found=True, kinds=["WORK", "PORTFOLIO"],
        summary="졸업작품(50점)과 포트폴리오(50점) 심사 합산 80점 이상.",
        options=[], minOptions=None, cohortRules=[], substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    "ICT융합디자인학과": dict(
        found=True, kinds=["WORK"], summary="졸업작품(100점) 심사 80점 이상.",
        options=[], minOptions=None, cohortRules=[], substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    "AI·소프트웨어학과": dict(
        found=True, kinds=["WORK", "PROJECT", "OTHER", "PAPER"],
        summary="3개 조건 중 1개 충족. 졸업작품은 팀 수행 가능하며 학과 교수회의에서 평가.",
        options=["졸업작품 제출·평가", "교내외 관련 공모전 입상", "국내외 학술대회 발표 또는 학술지 게재"],
        minOptions=1, cohortRules=[], substitutes=[], submission="", src=["p_fp"], confidence="HIGH"),
    # 계약학과
    "디지털콘텐츠디자인학과(계약학과)": NOT_FOUND("수집된 페이지에 졸업요건 정보 없음."),
    "인테리어디자인학과(계약학과)": NOT_FOUND("수집된 페이지에 졸업요건 정보 없음."),
}
PROGRAMS = {k: v for k, v in PROGRAMS.items() if v is not None}


def main():
    ref = json.loads((ROOT / "data/normalized/reference.json").read_text(encoding="utf-8"))
    cur = json.loads((RAW / "curricula.json").read_text(encoding="utf-8"))
    gs = json.loads((RAW / "grad-search.json").read_text(encoding="utf-8"))
    grads = {g["href"]: g for g in cur["grads"]}
    arts = {}
    for a in gs["arts"]:
        arts.setdefault(a["href"], a)
    gs2_path = RAW / "grad-search-2.json"
    if gs2_path.exists():
        for o in json.loads(gs2_path.read_text(encoding="utf-8"))["out"]:
            for a in o["arts"]:
                arts.setdefault(a["href"], a)
            if o.get("imgs"):
                grads.setdefault(o["href"], o)

    def source(key):
        href, title = S[key]
        date = None
        if href in arts:
            a = arts[href]
            title = title or re.sub(r"\s*새글$", "", re.sub(r"^(트랙공지사항|졸업공지|공지사항)\s+", "", a["title"])).strip()
            m = re.search(r"작성일 : (\d{4})\.(\d{2})\.(\d{2})", a["text"])
            if m:
                date = "-".join(m.groups())
        elif href not in grads:
            sys.exit(f"source {key} {href} not in inputs")
        return {"title": title, "url": BASE + href, "date": date}

    errors = []
    names = [p["name"] for p in ref["programs"]]
    for n in PROGRAMS:
        if n not in names:
            errors.append(f"unknown program {n}")
    out_programs = []
    for p in ref["programs"]:
        d = PROGRAMS.get(p["name"])
        if d is None:
            errors.append(f"missing decision for {p['name']}")
            continue
        srcs = [source(k) for k in d.get("src", [])]
        # newest first
        srcs.sort(key=lambda s: s["date"] or "0000", reverse=True)
        e = {
            "program": p["name"],
            "status": p["status"],
            "found": d["found"],
            "kinds": d["kinds"],
            "summary": d["summary"],
            "options": d.get("options", []),
            "minOptions": d.get("minOptions"),
            "cohortRules": d.get("cohortRules", []),
            "substitutes": d.get("substitutes", []),
            "submission": d.get("submission", ""),
            "sources": srcs,
            "attachmentOnly": d.get("attachmentOnly", []),
            "confidence": d["confidence"],
        }
        if d.get("note"):
            e["note"] = d["note"]
        if not set(e["kinds"]) <= KINDS:
            errors.append(f"{p['name']}: bad kinds {e['kinds']}")
        if len(e["summary"]) > 220:
            errors.append(f"{p['name']}: summary {len(e['summary'])} chars")
        if e["found"] and not e["summary"]:
            errors.append(f"{p['name']}: found without summary")
        if re.search(r"\d{7}|@", json.dumps(e, ensure_ascii=False)):
            errors.append(f"{p['name']}: contains id/email-like text")
        out_programs.append(e)
    if errors:
        sys.exit("\n".join(errors))

    coverage = {}
    for e in out_programs:
        c = coverage.setdefault(e["status"], {"found": 0, "notFound": 0})
        c["found" if e["found"] else "notFound"] += 1
    coverage["total"] = {"found": sum(c["found"] for c in coverage.values()),
                         "notFound": sum(c["notFound"] for c in coverage.values())}
    doc = {
        "schemaVersion": "1.0",
        "collectedAt": "2026-10-26",
        "note": ("학과·트랙별 졸업요건(교과 학점·비교과 800포인트 등 전교 공통 요건 제외). 2026-2 학업이수가이드: 16학번 이후 1트랙·2트랙 졸업요건을 각각 충족해야 함. "
                 "found=false는 수집 자료에서 요건 본문을 찾지 못했다는 뜻이며 요건이 없다는 뜻이 아님."),
        "programs": out_programs,
        "coverage": coverage,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out_programs)} programs, coverage {coverage}")


if __name__ == "__main__":
    main()
