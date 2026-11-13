import type { LiberalRule } from "@hansung/academic-engine";
import rawCohort from "../../../data/normalized/cohort-requirements.json";
import rawGraduation from "../../../data/normalized/graduation-requirements.json";
import rawOfferings from "../../../data/normalized/offerings-2026-2.json";
import rawReference from "../../../data/normalized/reference.json";

/** 미분류 = the school page publishes the course without a 전기/전필/전선 label. */
export type CourseCategory = "전기" | "전필" | "전선" | "미분류";

export type CurriculumMapping = {
  track: string;
  category: CourseCategory;
  recommendedYear: string;
  semester: string;
  sourceUrl: string;
  recognition: "UNVERIFIED";
  module?: string | null;
};

export type CatalogCourse = {
  code: string;
  name: string;
  creditMilli: number;
  codeVerified: boolean;
  mappings: CurriculumMapping[];
};

export type ProgramKind = "TRACK" | "DEPARTMENT" | "MAJOR" | "SELF_DESIGNED" | "CONTRACT";
export type ProgramStatus = "ACTIVE" | "LEGACY" | "FUTUREPLUS" | "CONTRACT";

export type CatalogProgram = {
  id: string;
  name: string;
  aliases: string[];
  college: string | null;
  unit: string | null;
  kind: ProgramKind;
  session: "DAY" | "EVENING" | "BOTH" | null;
  status: ProgramStatus;
  firstSlotAllowed: boolean;
  secondSlotAllowed: boolean;
  requirementProfile: string;
  curriculumUrl: string | null;
  graduationUrl: string | null;
  graduationSummary: string | null;
  courseCount: number;
  sourceStatus: string;
  slotNote?: string | null;
  secondTrackExclusions?: string[];
  requirementNote?: string | null;
  /** Kept for older screens that expect the previous catalog track shape. */
  sourceUrl: string;
  rowCount: number;
};

type RawMapping = {
  program: string;
  category: string;
  recommendedYear: string;
  semester: string;
  module?: string | null;
  partnerUniversity?: string | null;
  sourceUrl: string;
};
type RawCourse = {
  code: string;
  name: string;
  creditMilli: number;
  codeVerified?: boolean;
  mappings: RawMapping[];
};
export type Procedure = {
  id: string;
  type: string;
  term: string;
  title: string;
  publishedAt: string | null;
  applyStart: string | null;
  applyEnd: string | null;
  resultAt: string | null;
  eligibility: string | null;
  notes: string[];
  quotas: {
    unit: string;
    day: number | null;
    night: number | null;
    total: number | null;
    basis?: string;
    note?: string | null;
  }[];
  results: { toUnit: string; accepted: number }[];
  averageGpa: number | null;
  sourceUrl: string;
};
export type MicroDegree = {
  id: string;
  name: string;
  mdType: 1 | 2;
  category: string;
  creditMilli: number;
  year: number;
  courses: string[];
  sourceUrl: string;
};
type Reference = {
  crawledAt: string;
  colleges: { id: string; name: string }[];
  programs: Omit<CatalogProgram, "sourceUrl" | "rowCount">[];
  courses: RawCourse[];
  requirementProfiles: Record<string, unknown>;
  graduation: Record<string, unknown>;
  procedures: Procedure[];
  microdegrees: MicroDegree[];
};

const reference = rawReference as unknown as Reference;
const MAJOR_CATEGORIES = new Set(["전기", "전필", "전선", "미분류"]);

export const referenceCrawledAt = reference.crawledAt;
export const colleges = reference.colleges;
export const catalogPrograms: CatalogProgram[] = reference.programs.map((p) => ({
  ...p,
  sourceUrl: p.curriculumUrl ?? "",
  rowCount: 0,
}));
/** Programs a student can pick in the planner: published curricula first, legacy tracks kept. */
export const catalogTracks = catalogPrograms.filter(
  (p) => p.courseCount > 0 || p.status === "ACTIVE",
);
export const catalogCourses: CatalogCourse[] = reference.courses
  .map((c) => ({
    code: c.code,
    name: c.name,
    creditMilli: c.creditMilli,
    codeVerified: c.codeVerified ?? true,
    mappings: c.mappings
      .filter((m) => MAJOR_CATEGORIES.has(m.category))
      .map((m) => ({
        track: m.program,
        category: m.category as CourseCategory,
        recommendedYear: String(m.recommendedYear),
        semester: String(m.semester),
        sourceUrl: m.sourceUrl,
        recognition: "UNVERIFIED" as const,
        module: m.module ?? null,
      })),
  }))
  .filter((c) => c.mappings.length > 0);
for (const p of catalogPrograms)
  p.rowCount = catalogCourses.reduce(
    (n, c) => n + c.mappings.filter((m) => m.track === p.name).length,
    0,
  );
export const catalogCategories: CourseCategory[] = ["전기", "전필", "전선", "미분류"];
export const catalog = {
  summary: {
    trackCount: catalogTracks.length,
    observedRowCount: catalogCourses.reduce((n, c) => n + c.mappings.length, 0),
    uniqueCourseCount: catalogCourses.length,
  },
  tracks: catalogTracks,
  courses: catalogCourses,
};
export const procedures = reference.procedures;
export const microDegrees = reference.microdegrees;
export const requirementProfiles = reference.requirementProfiles;
export const graduationInfo = reference.graduation;

const programByName = new Map<string, CatalogProgram>();
for (const p of catalogPrograms) {
  programByName.set(p.name, p);
  for (const alias of p.aliases ?? []) if (!programByName.has(alias)) programByName.set(alias, p);
}
export function findProgram(name: string): CatalogProgram | undefined {
  return programByName.get(name) ?? programByName.get(name.replace(/·/g, "ㆍ"));
}

const semesterOrder = (s: string) => (s === "1" ? 1 : s === "2" ? 2 : s === "1·2" ? 1.5 : 3);
export function courseMappingsForTrack(course: CatalogCourse, track: string): CurriculumMapping[] {
  return course.mappings.filter((mapping) => mapping.track === track);
}

export function primaryMappingForTrack(
  course: CatalogCourse,
  track: string,
): CurriculumMapping | undefined {
  return courseMappingsForTrack(course, track).sort((a, b) => {
    const termA = (Number(a.recommendedYear) || 9) * 10 + semesterOrder(a.semester);
    const termB = (Number(b.recommendedYear) || 9) * 10 + semesterOrder(b.semester);
    return termA - termB;
  })[0];
}

export function coursesForTrack(track: string): CatalogCourse[] {
  return catalogCourses
    .filter((course) => course.mappings.some((mapping) => mapping.track === track))
    .sort((a, b) => a.code.localeCompare(b.code, "ko"));
}

/** School-published pairing limits: some departments cannot take their 모트랙 as the 2nd track. */
export function pairingError(track1: string, track2: string): string {
  const p1 = findProgram(track1);
  const blocked = p1?.secondTrackExclusions ?? [];
  if (track2 && blocked.includes(findProgram(track2)?.name ?? track2))
    return `${p1?.name}은(는) ${track2}을(를) 2트랙으로 선택할 수 없어요(학교 FAQ).`;
  return "";
}

type CohortData = {
  source: string;
  liberalArts: LiberalRule[];
  semesterRules: Record<string, { rule?: string; maxMilli?: number; maxMilliPerSession?: number }>;
  transfer: {
    type: string;
    cohorts: string;
    creditMilli: number;
    nonCurricularPoints: number | null;
  }[];
};
const cohort = rawCohort as unknown as CohortData;
export const liberalRules = cohort.liberalArts;
export const semesterRules = cohort.semesterRules;
export const cohortSource = cohort.source;

type Offering = {
  kind: string;
  group: string;
  code: string;
  name: string;
  category: string | null;
  credit: number | null;
};
const offeringData = rawOfferings as unknown as {
  term: string;
  source: string;
  offerings: Offering[];
};
export const offeringTerm = offeringData.term;
const offered = new Set(offeringData.offerings.map((o) => o.code));
/** True when the course code appears in the official timetable of the current term. */
export const isOffered = (code: string | undefined) => !!code && offered.has(code);
const liberalArea = new Map<string, string>();
for (const o of offeringData.offerings) {
  const m = o.group.match(/^선택필수교양·(.+ 상상력)$/);
  if (o.kind === "LIBERAL" && m?.[1]) {
    liberalArea.set(o.code, m[1]);
    liberalArea.set(o.name.replace(/\s/g, ""), m[1]);
  }
}
/** 배분이수 영역 of a liberal-arts course, from the official timetable (code first, then name). */
export function liberalAreaOf(code: string | undefined, name: string): string | undefined {
  return (code && liberalArea.get(code)) || liberalArea.get(name.replace(/\s/g, ""));
}

export type ProgramGraduation = {
  program: string;
  found: boolean;
  kinds: string[];
  summary: string;
  options: string[];
  minOptions: number | null;
  cohortRules: { cohorts: string; summary: string }[];
  substitutes: string[];
  submission: string;
  sources: { title: string; url: string; date: string | null }[];
  attachmentOnly: { name: string; url: string }[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  note?: string;
};
const graduationByProgram = new Map(
  (rawGraduation as unknown as { programs: ProgramGraduation[] }).programs.map((g) => [
    g.program,
    g,
  ]),
);
/** 트랙·학과별 졸업요건 (학과 홈페이지·게시판 공지 기준, 2026-10-26 수집). */
export function graduationFor(name: string): ProgramGraduation | undefined {
  return graduationByProgram.get(findProgram(name)?.name ?? name);
}
