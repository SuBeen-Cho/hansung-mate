export type ActivityStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED";
export type RecognitionStatus = "APPROVED" | "PENDING" | "REJECTED" | "UNKNOWN";
export type RequirementState = "SATISFIED" | "UNSATISFIED" | "UNKNOWN" | "NOT_APPLICABLE";
export type AssessmentState = "INDETERMINATE" | "REQUIREMENTS_REMAIN" | "INPUT_REQUIREMENTS_MET";
export type CurriculumCategory =
  | "교양필수"
  | "선택필수"
  | "자율교양"
  | "일선"
  | "전기"
  | "전필"
  | "전선"
  | "미분류";

export type StudentCourseRecord = {
  id: string;
  courseCode?: string;
  name: string;
  creditMilli: number;
  category: CurriculumCategory;
  recommendedYear?: string;
  semester?: string;
  term: string;
  status: "COMPLETED" | "PLANNED";
  source: "PUBLIC_CURRICULUM" | "DEMO_SUMMARY" | "MANUAL";
};

export type CreditSummary = {
  completedCreditMilli: number;
  plannedCreditMilli: number;
  categoryCredits: Array<{
    category: CurriculumCategory;
    completedCreditMilli: number;
    plannedCreditMilli: number;
  }>;
  termCredits: Array<{ key: string; completedCreditMilli: number; plannedCreditMilli: number }>;
};

export type CreditAllocation = {
  requirementKey: string;
  creditMilli: number;
};

export type CreditAward = {
  id: string;
  courseCode?: string;
  label: string;
  kind: "COURSE" | "TRANSFER_SUMMARY" | "SUMMARY_BALANCE";
  creditMilli: number;
  activityStatus: ActivityStatus;
  recognitionStatus: RecognitionStatus;
  allocations: CreditAllocation[];
};

export type PlannedAllocation = CreditAllocation & {
  assumptionId?: string;
  sourceId: string;
};

export type PlannedCourse = {
  courseCode: string;
  name: string;
  creditMilli: number;
  term: string;
  allocations: PlannedAllocation[];
};

export type Requirement = {
  key: string;
  label: string;
  scope: "TOTAL" | "TRACK" | "OTHER";
  thresholdCreditMilli: number | null;
  sourceIds: string[];
  unknownReasons: string[];
};

export type Assumption = {
  id: string;
  label: string;
  enabled: boolean;
  status: "DEMO" | "PENDING";
};

export type AuditInput = {
  profileRevision: number;
  recordVersionId: string;
  rulePackKey: string;
  rulePackHash: string;
  scenarioRevision: number;
  engineVersion: string;
  awards: CreditAward[];
  plannedCourses: PlannedCourse[];
  selectedPlanCourseCodes: string[];
  assumptions: Assumption[];
  requirements: Requirement[];
};

export type RequirementResult = {
  requirementKey: string;
  label: string;
  state: RequirementState;
  recordedCreditMilli: number | null;
  projectedCreditMilli: number | null;
  remainingCreditMilli: number | null;
  sourceRefs: string[];
  assumptionRefs: string[];
  unknownReasons: string[];
};

export type AuditResult = {
  assessment: AssessmentState;
  recordedTotalCreditMilli: number;
  projectedTotalCreditMilli: number;
  remainingTotalCreditMilli: number | null;
  requirements: RequirementResult[];
  selectedCourseCodes: string[];
  assumptions: Assumption[];
  warnings: string[];
  calculationId: string;
};

export const DEMO_RULE_PACK = "DEMO-HANSUNG-DUALTRACK-v1";
export const DUAL_RECOGNITION_ASSUMPTION = "DEMO-DUAL-RECOGNITION";
export const DEMO_COURSE_CODE = "V024004";

export function createDemoAuditInput(options?: {
  includeCourse?: boolean;
  dualRecognition?: boolean;
}): AuditInput {
  const includeCourse = options?.includeCourse ?? false;
  const dualRecognition = options?.dualRecognition ?? false;

  return {
    profileRevision: 1,
    recordVersionId: "DEMO-RECORD-90",
    rulePackKey: DEMO_RULE_PACK,
    rulePackHash: "demo-not-an-official-rule",
    scenarioRevision: 1,
    engineVersion: "0.1.0",
    awards: [
      {
        id: "DEMO-WEB-BASE",
        label: "웹공학 전필 가상 실적",
        kind: "TRANSFER_SUMMARY",
        creditMilli: 9_000,
        activityStatus: "COMPLETED",
        recognitionStatus: "APPROVED",
        allocations: [{ requirementKey: "web-required", creditMilli: 9_000 }],
      },
      {
        id: "DEMO-MOBILE-BASE",
        label: "모바일 전선 가상 실적",
        kind: "TRANSFER_SUMMARY",
        creditMilli: 12_000,
        activityStatus: "COMPLETED",
        recognitionStatus: "APPROVED",
        allocations: [{ requirementKey: "mobile-elective", creditMilli: 12_000 }],
      },
      {
        id: "DEMO-OTHER-BASE",
        label: "기타 가상 이수 요약",
        kind: "SUMMARY_BALANCE",
        creditMilli: 69_000,
        activityStatus: "COMPLETED",
        recognitionStatus: "APPROVED",
        allocations: [],
      },
    ],
    plannedCourses: [
      {
        courseCode: DEMO_COURSE_CODE,
        name: "웹서버프로그래밍",
        creditMilli: 3_000,
        term: "2026-2",
        allocations: [
          {
            requirementKey: "web-required",
            creditMilli: 3_000,
            sourceId: "HSU-WEB-CURRICULUM-V024004",
          },
          {
            requirementKey: "mobile-elective",
            creditMilli: 3_000,
            assumptionId: DUAL_RECOGNITION_ASSUMPTION,
            sourceId: "HSU-MOBILE-CURRICULUM-V024004",
          },
        ],
      },
    ],
    selectedPlanCourseCodes: includeCourse ? [DEMO_COURSE_CODE] : [],
    assumptions: [
      {
        id: DUAL_RECOGNITION_ASSUMPTION,
        label: "두 트랙 동시 인정 가정",
        enabled: dualRecognition,
        status: "DEMO",
      },
    ],
    requirements: [
      {
        key: "total-credit",
        label: "총학점",
        scope: "TOTAL",
        thresholdCreditMilli: 130_000,
        sourceIds: ["DEMO-RULE-TOTAL-130"],
        unknownReasons: [],
      },
      {
        key: "web-required",
        label: "웹공학 전필",
        scope: "TRACK",
        thresholdCreditMilli: 15_000,
        sourceIds: ["HSU-WEB-CURRICULUM"],
        unknownReasons: [],
      },
      {
        key: "mobile-elective",
        label: "모바일 전선",
        scope: "TRACK",
        thresholdCreditMilli: 21_000,
        sourceIds: ["HSU-MOBILE-CURRICULUM"],
        unknownReasons: [],
      },
      {
        key: "official-graduation-rules",
        label: "학번별 공식 졸업요건",
        scope: "OTHER",
        thresholdCreditMilli: null,
        sourceIds: [],
        unknownReasons: ["해당 학번·입학유형에 대해 검토·발행된 규칙 묶음이 없습니다."],
      },
    ],
  };
}
