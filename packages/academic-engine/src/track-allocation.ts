/**
 * Assigns each completed major course to ONE of the student's two programs.
 *
 * Hansung track system: 1학년 courses are shared across the 학부 and tracks split from 2학년,
 * so many courses appear in both curricula. A course may count only once (no 중복 인정), and
 * its 전기/전필/전선 label is the one in the program it is assigned to.
 *
 * Rule (deterministic, demo-level — not an official recognition result):
 * - only one program lists the course → that program;
 * - both list it → the program that still needs that category minimum (전기, then 전필),
 *   otherwise the program with more credits left to its per-program total; ties → 1st program.
 * Records are processed in term order so earlier courses fill minimums first.
 * A student's own choice (`chosenSlot`) moves only that course when both programs list it;
 * the automatic placement of every other course is computed as if no choice was made.
 */
export type AllocationTargets = { basic: number; required: number; perTrack: number };
export type AllocatableRecord = {
  id: string;
  courseCode?: string | undefined;
  creditMilli: number;
  term: string;
  category: string;
};
export type Allocated<R> = R & {
  category: string;
  assignedTrack: 1 | 2 | null;
  shared: boolean;
  /** true when the student picked the program for a shared course. */
  chosen: boolean;
};

export function allocateToTracks<R extends AllocatableRecord>(
  records: R[],
  categoryIn: (code: string, slot: 1 | 2) => string | undefined,
  targets: AllocationTargets,
  single = false,
  chosenSlot: (record: R) => 1 | 2 | undefined = () => undefined,
): Allocated<R>[] {
  const filled = {
    1: { basic: 0, required: 0, total: 0 },
    2: { basic: 0, required: 0, total: 0 },
  };
  const need = (slot: 1 | 2, category: string | undefined) =>
    category === "전기"
      ? targets.basic - filled[slot].basic
      : category === "전필"
        ? targets.required - filled[slot].required
        : 0;
  const order = records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.term.localeCompare(b.r.term) || a.i - b.i);
  const result = new Map<number, Allocated<R>>();
  for (const { r, i } of order) {
    const c1 = r.courseCode ? categoryIn(r.courseCode, 1) : undefined;
    const c2 = r.courseCode && !single ? categoryIn(r.courseCode, 2) : undefined;
    let slot: 1 | 2 | null = c1 ? 1 : c2 ? 2 : null;
    if (c1 && c2) {
      const n1 = need(1, c1);
      const n2 = need(2, c2);
      if (n1 > 0 || n2 > 0) slot = n2 > n1 ? 2 : 1;
      else {
        const left1 = targets.perTrack - filled[1].total;
        const left2 = targets.perTrack - filled[2].total;
        slot = left2 > left1 ? 2 : 1;
      }
    }
    const category = slot === 1 ? c1 : slot === 2 ? c2 : undefined;
    if (slot) {
      filled[slot].total += r.creditMilli;
      if (category === "전기") filled[slot].basic += r.creditMilli;
      if (category === "전필") filled[slot].required += r.creditMilli;
    }
    // A student's choice moves only that course; the rest keep their automatic place,
    // so moving one shared course really shifts its credits between the two programs.
    const chosen = c1 && c2 ? chosenSlot(r) : undefined;
    const finalSlot = chosen ?? slot;
    result.set(i, {
      ...r,
      category: (finalSlot === 1 ? c1 : finalSlot === 2 ? c2 : undefined) ?? "미분류",
      assignedTrack: finalSlot,
      shared: !!(c1 && c2),
      chosen: !!chosen,
    });
  }
  return records.map((_, i) => result.get(i) as Allocated<R>);
}
