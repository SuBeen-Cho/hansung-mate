/** Cohort liberal-arts rule from the school's 학업이수가이드 (shape of cohort-requirements.json). */
export type LiberalRule = {
  cohorts: string;
  fromYear: number | null;
  toYear: number | null;
  totalMilli: number;
  required: {
    creditMilli: number;
    creditMilliMax?: number;
    courses: { name: string; creditMilli: number; note?: string }[];
  };
  distribution: { creditMilli: number; minAreas: number; areas: string[]; rule: string } | null;
  free: { creditMilli: number; rule: string } | null;
};
export type LiberalRecord = {
  name: string;
  creditMilli: number;
  category: string;
  /** 배분이수 영역 when known (from the official timetable), otherwise undefined. */
  area?: string | undefined;
};

export function liberalRuleFor(rules: LiberalRule[], entryYear: number) {
  return rules.find(
    (r) =>
      (r.fromYear === null || entryYear >= r.fromYear) &&
      (r.toYear === null || entryYear <= r.toYear),
  );
}

const key = (s: string) => s.replace(/[\s()（）/·ㆍⅠⅡ]/g, "").toLowerCase();

/**
 * Liberal-arts progress for one cohort. Required courses match by course name; area coverage counts
 * only records whose 배분 영역 is known, and unknown areas stay UNKNOWN instead of being guessed.
 */
export function liberalArtsProgress(rule: LiberalRule, records: LiberalRecord[]) {
  const sum = (xs: LiberalRecord[]) => xs.reduce((n, r) => n + r.creditMilli, 0);
  const required = records.filter((r) => r.category === "교양필수");
  const distribution = records.filter((r) => r.category === "선택필수");
  const free = records.filter((r) => r.category === "자율교양");
  const requiredCourses = rule.required.courses.map((c) => ({
    ...c,
    done: required.some(
      (r) => key(r.name).includes(key(c.name)) || key(c.name).includes(key(r.name)),
    ),
  }));
  const coveredAreas = [
    ...new Set(distribution.map((r) => r.area).filter((a): a is string => !!a)),
  ];
  const unknownAreaCount = distribution.filter((r) => !r.area).length;
  const total = sum(required) + sum(distribution) + sum(free);
  const areaStatus = !rule.distribution
    ? "NOT_REQUIRED"
    : coveredAreas.length >= rule.distribution.minAreas
      ? "MET"
      : coveredAreas.length + unknownAreaCount >= rule.distribution.minAreas
        ? "UNKNOWN"
        : "SHORT";
  return {
    cohorts: rule.cohorts,
    total: {
      earned: total,
      target: rule.totalMilli,
      remaining: Math.max(0, rule.totalMilli - total),
    },
    required: {
      earned: sum(required),
      target: rule.required.creditMilli,
      courses: requiredCourses,
      missing: requiredCourses.filter((c) => !c.done).map((c) => c.name),
    },
    distribution: rule.distribution
      ? {
          earned: sum(distribution),
          target: rule.distribution.creditMilli,
          minAreas: rule.distribution.minAreas,
          coveredAreas,
          unknownAreaCount,
          status: areaStatus,
        }
      : null,
    free: { earned: sum(free), target: rule.free?.creditMilli ?? 0 },
  };
}
