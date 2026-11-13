import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourcePath = "hansung-handoff/data/Hansung_Public_Curriculum_Observed_2026-09-22.json";
const outputPath = "data/normalized/catalog.json";
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const rows = source.tracks.flatMap((track) => track.normalized_observations);
const byCode = new Map();

for (const row of rows) {
  const current = byCode.get(row.course_code) ?? {
    code: row.course_code,
    name: row.course_name,
    creditMilli: Number.parseFloat(row.credits_text || "0") * 1000,
    mappings: [],
  };
  const mapping = {
    track: row.track,
    category: row.category_text,
    recommendedYear: row.recommended_year_text,
    semester: row.semester_text,
    sourceUrl: row.source_url,
    recognition: row.personal_recognition,
  };
  if (
    !current.mappings.some(
      (item) =>
        item.track === mapping.track &&
        item.category === mapping.category &&
        item.recommendedYear === mapping.recommendedYear &&
        item.semester === mapping.semester,
    )
  ) {
    current.mappings.push(mapping);
  }
  byCode.set(row.course_code, current);
}

const output = {
  schemaVersion: "1.0",
  generatedFrom: sourcePath,
  investigationDate: source.investigation_date,
  summary: {
    trackCount: source.tracks.length,
    observedRowCount: rows.length,
    uniqueCourseCount: byCode.size,
  },
  tracks: source.tracks.map((track) => ({
    name: track.track,
    status: track.status,
    rowCount: track.course_row_count,
    uniqueCourseCount: track.unique_code_count,
    sourceUrl: track.url,
  })),
  courses: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, "ko")),
};

if (
  output.summary.trackCount !== 39 ||
  output.summary.observedRowCount !== 880 ||
  output.summary.uniqueCourseCount !== 478
) {
  throw new Error(`예상 집계와 다릅니다: ${JSON.stringify(output.summary)}`);
}

await mkdir("data/normalized", { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `카탈로그 생성 완료: ${output.summary.trackCount}트랙 / ${output.summary.observedRowCount}행 / ${output.summary.uniqueCourseCount}과목`,
);
