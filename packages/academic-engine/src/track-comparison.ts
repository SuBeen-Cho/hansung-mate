import type { StudentCourseRecord } from "@hansung/contracts";

export type TrackCatalogEntry = {
  code: string;
  name: string;
  creditMilli: number;
  category: string;
  recommendedYear: string;
  semester: string;
};

export type TrackComparison = {
  matched: TrackCatalogEntry[];
  candidates: TrackCatalogEntry[];
  completedOutsideTarget: string[];
  matchedCreditMilli: number;
};

/** A curriculum overlap preview. It does not decide individual credit recognition. */
export function compareTrackCatalog(
  completed: readonly StudentCourseRecord[],
  targetCourses: readonly TrackCatalogEntry[],
): TrackComparison {
  const completedCodes = new Set(
    completed
      .filter((record) => record.status === "COMPLETED" && record.courseCode)
      .map((record) => record.courseCode as string),
  );
  const targetByCode = new Map(targetCourses.map((course) => [course.code, course]));
  const matched = [...completedCodes]
    .flatMap((code) => {
      const course = targetByCode.get(code);
      return course ? [course] : [];
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const candidates = [...targetByCode.values()]
    .filter((course) => !completedCodes.has(course.code))
    .sort((a, b) =>
      `${a.recommendedYear}${a.semester}${a.code}`.localeCompare(
        `${b.recommendedYear}${b.semester}${b.code}`,
      ),
    );
  return {
    matched,
    candidates,
    completedOutsideTarget: [...completedCodes].filter((code) => !targetByCode.has(code)).sort(),
    matchedCreditMilli: matched.reduce((total, course) => total + course.creditMilli, 0),
  };
}
