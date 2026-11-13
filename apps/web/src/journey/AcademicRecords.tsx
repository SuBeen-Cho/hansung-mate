import {
  earnedRecords,
  formatCredit,
  type PersonalRecord,
  recordErrors,
  summarizeCourseRecords,
} from "@hansung/academic-engine";
import { useEffect, useRef, useState } from "react";
import { catalogCourses } from "../catalog";
import { type AcademicData, initialRecords } from "./AcademicData";
import { ConfirmDialog } from "./ConfirmDialog";
import { uid } from "./model";
import { planningTerms, termLabel } from "./SemesterBoard";
export function AcademicRecords({
  data,
  onChange,
}: {
  data: AcademicData;
  onChange: (data: AcademicData) => void;
}) {
  const [edit, setEdit] = useState<PersonalRecord | null>(null);
  const [query, setQuery] = useState("");
  const editRef = useRef<HTMLElement>(null);
  const editId = edit?.id;
  useEffect(() => {
    if (editId) {
      editRef.current?.scrollIntoView?.({ block: "start" });
      editRef.current?.querySelector("input")?.focus({ preventScroll: true });
    }
  }, [editId]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reset, setReset] = useState<"EMPTY" | "DEMO" | null>(null);
  const [remove, setRemove] = useState<PersonalRecord | null>(null);
  const saveRecords = (records: PersonalRecord[]) =>
    onChange({ ...data, records, revision: data.revision + 1 });
  const matches = query.trim()
    ? catalogCourses.filter((c) => `${c.name} ${c.code}`.includes(query.trim())).slice(0, 15)
    : [];
  const groups = [...new Set(data.records.map((r) => r.term))].sort();
  return (
    <section className="j-stack">
      <h1>이수한 과목과 성적</h1>
      <p>실제 수강 학기별 기록이에요. 직접 입력한 정보는 학교 성적표와 대조해 주세요.</p>
      <div className="j-paper">
        <b>
          {formatCredit(summarizeCourseRecords(earnedRecords(data.records)).completedCreditMilli)}
          학점
        </b>
        <p className="j-caption">
          F·NP 제외 ·{" "}
          {data.records.some((r) => r.origin === "DEMO") ? "가상 성적 포함" : "직접 입력 기록"} ·
          공식 인정 미확인
        </p>
      </div>
      <label className="j-field">
        과목명·코드로 이수 기록 추가
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="공개 과목표에서 찾기"
        />
      </label>
      {matches.map((c) => (
        <button
          key={c.code}
          type="button"
          className="j-menu-row"
          onClick={() => {
            setEdit(
              data.records.find((r) => r.courseCode === c.code) ?? {
                id: uid(),
                courseCode: c.code,
                name: c.name,
                creditMilli: c.creditMilli,
                category: c.mappings[0]?.category ?? "미분류",
                term: "1-1",
                grade: "P",
                status: "COMPLETED",
                source: "MANUAL",
                origin: "MANUAL",
                recognition: "UNVERIFIED",
              },
            );
            setErrors([]);
          }}
        >
          {c.name} · {c.code}
        </button>
      ))}
      <button
        type="button"
        className="j-secondary"
        onClick={() => {
          setEdit({
            id: uid(),
            name: "",
            creditMilli: 3000,
            category: "미분류",
            term: "1-1",
            grade: "P",
            status: "COMPLETED",
            source: "MANUAL",
            origin: "MANUAL",
            recognition: "UNVERIFIED",
          });
          setErrors([]);
        }}
      >
        교양·일반·학점 인정 기록 직접 추가
      </button>
      {edit && (
        <section ref={editRef} className="j-paper j-stack" aria-label="이수 기록 편집">
          <h2>이수 기록 편집</h2>
          <label className="j-field">
            과목명
            <input
              value={edit.name}
              maxLength={100}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <div className="j-fields">
            <label>
              실제 수강 학기
              <select
                aria-label="실제 수강 학기"
                value={edit.term}
                onChange={(e) => setEdit({ ...edit, term: e.target.value })}
              >
                {edit.term === "DEMO" && <option value="DEMO">데모 합산 기록</option>}
                {planningTerms.map((term) => (
                  <option key={term} value={term}>
                    {termLabel(term)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              내 성적
              <select
                aria-label="내 성적"
                value={edit.grade}
                onChange={(e) => setEdit({ ...edit, grade: e.target.value })}
              >
                {[
                  ...new Set([
                    edit.grade,
                    "A+ · 4.5",
                    "A0 · 4.0",
                    "B+ · 3.5",
                    "B0 · 3.0",
                    "C+ · 2.5",
                    "C0 · 2.0",
                    "D+ · 1.5",
                    "D0 · 1.0",
                    "F",
                    "P",
                    "NP",
                  ]),
                ].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              취득 대상 학점
              <input
                type="number"
                min={0.5}
                max={60}
                step={0.5}
                value={edit.creditMilli / 1000}
                onChange={(e) => setEdit({ ...edit, creditMilli: Number(e.target.value) * 1000 })}
              />
            </label>
            <label>
              성적표 이수 구분
              <select
                value={edit.category}
                onChange={(e) =>
                  setEdit({ ...edit, category: e.target.value as PersonalRecord["category"] })
                }
              >
                {["전기", "전필", "전선", "교양필수", "선택필수", "자율교양", "일선", "미분류"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          {(() => {
            const listed = edit.courseCode
              ? catalogCourses.find((c) => c.code === edit.courseCode)
              : undefined;
            if (edit.courseCode && !listed)
              return (
                <p className="j-warning">
                  {edit.courseCode}는 학교 공개 전공 과목표에 없는 코드예요. 교양·폐지·타학과
                  과목이면 그대로 저장해도 돼요.
                </p>
              );
            if (listed && listed.creditMilli !== edit.creditMilli)
              return (
                <p className="j-warning">
                  학교 과목표에는 {listed.creditMilli / 1000}학점으로 나와요. 성적표 학점과 같은지
                  확인해 주세요.
                </p>
              );
            return null;
          })()}
          <p className="j-caption">
            직접 입력은 공식 전공 인정으로 바뀌지 않아요. K-MOOC 등은 승인된 성적표의 취득 학점만
            입력해 주세요. 재수강은 C+ 이하 과목만, 학기당 3학점·재학 중 12학점까지 가능하고 최종
            성적(최대 A)만 인정돼요.
          </p>
          {errors.length > 0 && (
            <p role="alert" className="j-error">
              {errors.join(" ")}
            </p>
          )}
          <button
            type="button"
            className="j-primary"
            onClick={() => {
              const problems = recordErrors(edit, data.records);
              setErrors(problems);
              if (problems.length) return;
              saveRecords([
                ...data.records.filter((r) => r.id !== edit.id),
                { ...edit, name: edit.name.trim(), origin: "MANUAL", source: "MANUAL" },
              ]);
              setEdit(null);
              setQuery("");
            }}
          >
            이수 기록 저장
          </button>
          <button type="button" className="j-link" onClick={() => setEdit(null)}>
            기록 수정 취소
          </button>
        </section>
      )}
      {groups.map((term) => (
        <section key={term} className="j-term">
          <h2>{term === "DEMO" ? "데모 합산 기록" : termLabel(term)}</h2>
          {data.records
            .filter((r) => r.term === term)
            .map((r) => (
              <article className="j-course j-course-completed" key={r.id}>
                <div>
                  <span className="j-course-category" data-category={r.category}>
                    {r.category}
                  </span>
                  <b>{r.name}</b>
                  <small>
                    {r.origin === "DEMO" ? "가상 기록" : "직접 입력"} ·{" "}
                    {r.courseCode ?? "개별 인정 확인 필요"}
                  </small>
                  <div className="j-row">
                    <button
                      type="button"
                      className="j-link"
                      aria-label={`${r.name} 기록 수정`}
                      onClick={() => {
                        setEdit({ ...r });
                        setErrors([]);
                      }}
                    >
                      {"수정"}
                    </button>
                    <button
                      type="button"
                      className="j-link"
                      aria-label={`${r.name} 기록 삭제`}
                      onClick={() => setRemove(r)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="j-credit-grade">
                  <span>{formatCredit(r.creditMilli)}학점</span>
                  <strong>{r.grade}</strong>
                  {["F", "NP"].includes(r.grade) && <small>취득 제외</small>}
                </div>
              </article>
            ))}
        </section>
      ))}
      {!data.records.length && <p className="j-empty">성적표를 보며 첫 과목을 입력해 주세요.</p>}
      <div className="j-row j-wrap">
        <button type="button" className="j-link" onClick={() => setReset("EMPTY")}>
          빈 성적표로 시작
        </button>
        <button type="button" className="j-link" onClick={() => setReset("DEMO")}>
          가상 성적표 불러오기
        </button>
      </div>
      {reset && (
        <ConfirmDialog
          title="이수 기록을 바꿀까요?"
          confirmLabel="기록 교체"
          onCancel={() => setReset(null)}
          onConfirm={() => {
            saveRecords(reset === "EMPTY" ? [] : initialRecords.map((r) => ({ ...r })));
            setEdit(null);
            setReset(null);
          }}
        >
          <p>
            현재 이수 기록을 {reset === "EMPTY" ? "비워요" : "가상 기록으로 교체해요"}. 저장한
            로드맵은 남고 학점은 새 기록으로 다시 계산돼요.
          </p>
        </ConfirmDialog>
      )}
      {remove && (
        <ConfirmDialog
          title="이수 기록을 삭제할까요?"
          confirmLabel="기록 삭제"
          onCancel={() => setRemove(null)}
          onConfirm={() => {
            saveRecords(data.records.filter((r) => r.id !== remove.id));
            setRemove(null);
          }}
        >
          <p>{remove.name} · 목표 학점도 다시 계산해요.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
