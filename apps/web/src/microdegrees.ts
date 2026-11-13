export type PublicMicroDegree = {
  id: string;
  name: string;
  year: number;
  courseNames: string[];
  sourceUrl: string;
};

/** 2026 notice excerpts; course codes and individual recognition are not supplied in the notice. */
export const publicMicroDegrees: [PublicMicroDegree, ...PublicMicroDegree[]] = [
  {
    id: "cloud-service",
    name: "클라우드컴퓨팅 서비스 전문과정",
    year: 2026,
    courseNames: [
      "오픈소스소프트웨어",
      "클라우드컴퓨팅",
      "웹공학 캡스톤디자인",
      "AI/클라우드 온캠퍼스인턴십",
    ],
    sourceUrl: "https://www.hansung.ac.kr/bbs/cncschool/1871/217913/artclView.do",
  },
  {
    id: "xr-service",
    name: "확장현실 전문과정",
    year: 2026,
    courseNames: [
      "XR 프로그래밍",
      "가상현실",
      "디지털콘텐츠·가상현실 캡스톤디자인",
      "XR 온캠퍼스 인턴십",
    ],
    sourceUrl: "https://www.hansung.ac.kr/bbs/cncschool/1871/217913/artclView.do",
  },
];

export function normalizedCourseName(value: string): string {
  return value.replace(/\s+/g, "").replace(/[ㆍ·]/g, "·");
}
