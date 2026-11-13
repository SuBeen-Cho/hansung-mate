import type {
  AssessmentState,
  AuditInput,
  AuditResult,
  CreditAward,
  CreditSummary,
  PlannedCourse,
  Requirement,
  RequirementResult,
  StudentCourseRecord,
} from "@hansung/contracts";

export type { TrackCatalogEntry, TrackComparison } from "./track-comparison.js";
export { compareTrackCatalog } from "./track-comparison.js";

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isRecorded(award: CreditAward): boolean {
  return award.activityStatus === "COMPLETED" && award.recognitionStatus === "APPROVED";
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function enabledAssumptions(input: AuditInput): Set<string> {
  return new Set(input.assumptions.filter((item) => item.enabled).map((item) => item.id));
}

function selectedCourses(input: AuditInput): PlannedCourse[] {
  const selected = new Set(input.selectedPlanCourseCodes);
  const completedCodes = new Set(
    input.awards
      .filter(isRecorded)
      .flatMap((award) => (award.courseCode ? [award.courseCode] : [])),
  );
  return uniqueBy(
    input.plannedCourses.filter(
      (course) => selected.has(course.courseCode) && !completedCodes.has(course.courseCode),
    ),
    (course) => course.courseCode,
  ).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

function recordedContribution(awards: CreditAward[], requirementKey: string): number {
  return sum(
    awards.map((award) => {
      const allocated = sum(
        award.allocations
          .filter((allocation) => allocation.requirementKey === requirementKey)
          .map((allocation) => Math.max(0, allocation.creditMilli)),
      );
      return Math.min(award.creditMilli, allocated);
    }),
  );
}

function plannedContribution(
  courses: PlannedCourse[],
  requirementKey: string,
  assumptions: Set<string>,
): { creditMilli: number; assumptionRefs: string[] } {
  const allocations = courses.flatMap((course) => {
    const eligible = course.allocations.filter(
      (allocation) =>
        allocation.requirementKey === requirementKey &&
        (!allocation.assumptionId || assumptions.has(allocation.assumptionId)),
    );
    const allocated = Math.min(
      course.creditMilli,
      sum(eligible.map((allocation) => Math.max(0, allocation.creditMilli))),
    );
    if (allocated === 0) return [];
    return [
      {
        creditMilli: allocated,
        assumptionIds: eligible.flatMap((allocation) =>
          allocation.assumptionId ? [allocation.assumptionId] : [],
        ),
      },
    ];
  });
  return {
    creditMilli: sum(allocations.map((allocation) => allocation.creditMilli)),
    assumptionRefs: uniqueBy(
      allocations.flatMap((allocation) => allocation.assumptionIds),
      (id) => id,
    ),
  };
}

function requirementResult(
  requirement: Requirement,
  recordedAwards: CreditAward[],
  courses: PlannedCourse[],
  assumptions: Set<string>,
  totals: { recorded: number; projected: number },
): RequirementResult {
  if (requirement.thresholdCreditMilli === null) {
    return {
      requirementKey: requirement.key,
      label: requirement.label,
      state: "UNKNOWN",
      recordedCreditMilli: null,
      projectedCreditMilli: null,
      remainingCreditMilli: null,
      sourceRefs: requirement.sourceIds,
      assumptionRefs: [],
      unknownReasons: requirement.unknownReasons,
    };
  }

  const recorded =
    requirement.scope === "TOTAL"
      ? totals.recorded
      : recordedContribution(recordedAwards, requirement.key);
  const planned =
    requirement.scope === "TOTAL"
      ? { creditMilli: totals.projected - totals.recorded, assumptionRefs: [] }
      : plannedContribution(courses, requirement.key, assumptions);
  const projected =
    requirement.scope === "TOTAL" ? totals.projected : recorded + planned.creditMilli;

  return {
    requirementKey: requirement.key,
    label: requirement.label,
    state: projected >= requirement.thresholdCreditMilli ? "SATISFIED" : "UNSATISFIED",
    recordedCreditMilli: recorded,
    projectedCreditMilli: projected,
    remainingCreditMilli: Math.max(0, requirement.thresholdCreditMilli - projected),
    sourceRefs: requirement.sourceIds,
    assumptionRefs: planned.assumptionRefs,
    unknownReasons: [],
  };
}

function assessmentFor(results: RequirementResult[]): AssessmentState {
  if (results.some((result) => result.state === "UNKNOWN")) return "INDETERMINATE";
  return results.every((result) => result.state === "SATISFIED")
    ? "INPUT_REQUIREMENTS_MET"
    : "REQUIREMENTS_REMAIN";
}

function calculationId(input: AuditInput, courses: PlannedCourse[]): string {
  const assumptionKey = input.assumptions
    .filter((item) => item.enabled)
    .map((item) => item.id)
    .sort()
    .join(",");
  return [
    input.engineVersion,
    input.recordVersionId,
    input.scenarioRevision,
    courses.map((course) => course.courseCode).join(","),
    assumptionKey,
  ].join(":");
}

export function auditScenario(input: AuditInput): AuditResult {
  const recordedAwards = uniqueBy(input.awards.filter(isRecorded), (award) => award.id).sort(
    (a, b) => a.id.localeCompare(b.id),
  );
  const courses = selectedCourses(input);
  const assumptions = enabledAssumptions(input);
  const recordedTotalCreditMilli = sum(recordedAwards.map((award) => award.creditMilli));
  const projectedTotalCreditMilli =
    recordedTotalCreditMilli + sum(courses.map((course) => course.creditMilli));
  const requirements = input.requirements.map((requirement) =>
    requirementResult(requirement, recordedAwards, courses, assumptions, {
      recorded: recordedTotalCreditMilli,
      projected: projectedTotalCreditMilli,
    }),
  );
  const totalRequirement = input.requirements.find((item) => item.scope === "TOTAL");

  return {
    assessment: assessmentFor(requirements),
    recordedTotalCreditMilli,
    projectedTotalCreditMilli,
    remainingTotalCreditMilli:
      totalRequirement?.thresholdCreditMilli == null
        ? null
        : Math.max(0, totalRequirement.thresholdCreditMilli - projectedTotalCreditMilli),
    requirements,
    selectedCourseCodes: courses.map((course) => course.courseCode),
    assumptions: input.assumptions.map((item) => ({ ...item })),
    warnings: [
      "DEMO 규칙과 가상 개인 이수 내역을 사용한 결과입니다.",
      "학번별 공식 졸업요건이 없어 전체 졸업 여부는 판정하지 않습니다.",
    ],
    calculationId: calculationId(input, courses),
  };
}

export function formatCredit(creditMilli: number | null): string {
  if (creditMilli === null) return "확인 필요";
  const credit = creditMilli / 1000;
  return Number.isInteger(credit) ? `${credit}` : credit.toFixed(1);
}

/** Aggregates entered course data without inferring approval of graduation requirements. */
export function summarizeCourseRecords(records: StudentCourseRecord[]): CreditSummary {
  const categoryMap = new Map<
    string,
    { completedCreditMilli: number; plannedCreditMilli: number }
  >();
  const termMap = new Map<string, { completedCreditMilli: number; plannedCreditMilli: number }>();
  let completedCreditMilli = 0;
  let plannedCreditMilli = 0;

  for (const record of uniqueBy(records, (item) => item.id)) {
    const credit = Math.max(0, record.creditMilli);
    const target = record.status === "COMPLETED" ? "completedCreditMilli" : "plannedCreditMilli";
    if (record.status === "COMPLETED") completedCreditMilli += credit;
    else plannedCreditMilli += credit;

    const category = categoryMap.get(record.category) ?? {
      completedCreditMilli: 0,
      plannedCreditMilli: 0,
    };
    category[target] += credit;
    categoryMap.set(record.category, category);

    const key =
      record.recommendedYear && record.semester
        ? `${record.recommendedYear}-${record.semester}`
        : record.term;
    const term = termMap.get(key) ?? { completedCreditMilli: 0, plannedCreditMilli: 0 };
    term[target] += credit;
    termMap.set(key, term);
  }

  return {
    completedCreditMilli,
    plannedCreditMilli,
    categoryCredits: [...categoryMap.entries()]
      .map(([category, credits]) => ({
        category: category as StudentCourseRecord["category"],
        ...credits,
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "ko")),
    termCredits: [...termMap.entries()]
      .map(([key, credits]) => ({ key, ...credits }))
      .sort((a, b) => a.key.localeCompare(b.key, "ko")),
  };
}

export function explainDemoResult(result: AuditResult): string[] {
  const web = result.requirements.find((item) => item.requirementKey === "web-required");
  const mobile = result.requirements.find((item) => item.requirementKey === "mobile-elective");
  if (!result.selectedCourseCodes.length) {
    return [
      "웹서버프로그래밍을 계획에 추가하면 총학점과 트랙별 기여 변화를 비교할 수 있어요.",
      "현재 공개 교육과정 분류와 개인별 실제 인정 여부는 서로 다른 정보예요.",
    ];
  }
  const dual = (mobile?.assumptionRefs.length ?? 0) > 0;
  return [
    `과목을 추가해 총학점 예상은 ${formatCredit(result.recordedTotalCreditMilli)} → ${formatCredit(result.projectedTotalCreditMilli)}학점입니다.`,
    `웹공학 전필은 ${formatCredit(web?.recordedCreditMilli ?? null)} → ${formatCredit(web?.projectedCreditMilli ?? null)}학점으로 바뀝니다.`,
    dual
      ? `모바일 전선도 ${formatCredit(mobile?.recordedCreditMilli ?? null)} → ${formatCredit(mobile?.projectedCreditMilli ?? null)}학점으로 표시되지만, 이는 양쪽 인정 DEMO 가정입니다.`
      : "모바일 전선은 유지됩니다. 동시 인정 가정을 켜면 조건부 영향을 볼 수 있어요.",
    "총학점은 한 번만 증가하며 공식 졸업 여부는 판정하지 않습니다.",
  ];
}

/** Progress against explicitly supplied planning targets; not an official degree audit. */
export function planningProgress(
  records: StudentCourseRecord[],
  targets: { required: number; elective: number; total: number; basic?: number },
) {
  const completedCodes = new Set(
    records
      .filter((r) => r.status === "COMPLETED")
      .flatMap((r) => (r.courseCode ? [r.courseCode] : [])),
  );
  const normalized = uniqueBy(
    records.filter(
      (r) => r.status === "COMPLETED" || !r.courseCode || !completedCodes.has(r.courseCode),
    ),
    (r) => r.courseCode ?? r.id,
  );
  const summary = summarizeCourseRecords(normalized);
  const row = (key: "required" | "elective" | "total", category?: string) => {
    const c = summary.categoryCredits.find((c) => c.category === category);
    const completed = category ? (c?.completedCreditMilli ?? 0) : summary.completedCreditMilli;
    const planned = category ? (c?.plannedCreditMilli ?? 0) : summary.plannedCreditMilli;
    return {
      key,
      target: targets[key],
      completed,
      planned,
      remaining: Math.max(0, targets[key] - completed - planned),
    };
  };
  const rows = [row("required", "전필"), row("elective", "전선"), row("total")];
  if (targets.basic === undefined) return rows;
  // Hansung: each track's flexible 21 credits accept 전기·전필·전선, so credits above the
  // 전기/전필 minimums spill into the elective row (completed first, then planned).
  const credits = (category: string) => {
    const c = summary.categoryCredits.find((x) => x.category === category);
    return { done: c?.completedCreditMilli ?? 0, plan: c?.plannedCreditMilli ?? 0 };
  };
  const spill = (category: string, target: number) => {
    const { done, plan } = credits(category);
    const done0 = Math.max(0, done - target);
    return { done: done0, plan: Math.max(0, done + plan - target) - done0 };
  };
  const extra = [spill("전필", targets.required), spill("전기", targets.basic)];
  const elective = rows[1];
  if (elective) {
    elective.completed += extra.reduce((n, x) => n + x.done, 0);
    elective.planned += extra.reduce((n, x) => n + x.plan, 0);
    elective.remaining = Math.max(0, elective.target - elective.completed - elective.planned);
  }
  return rows;
}

export {
  type LiberalRecord,
  type LiberalRule,
  liberalArtsProgress,
  liberalRuleFor,
} from "./liberal-arts.js";
export { auditOfficialMajor, HANSUNG_FUSION_I_2026, type MajorEvidence } from "./official-major.js";
export {
  allocationPreview,
  auditPlan,
  earnedRecords,
  PASSING_GRADES,
  type PersonalRecord,
  PLANNING_ENGINE_VERSION,
  type PlanIssue,
  type PlanningCourse,
  type PlanningItem,
  proposePlans,
  recordErrors,
} from "./planning-audit.js";
export {
  type AllocatableRecord,
  type Allocated,
  type AllocationTargets,
  allocateToTracks,
} from "./track-allocation.js";
