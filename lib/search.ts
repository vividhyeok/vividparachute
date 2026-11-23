import type { Question } from "./types";
export function resolveQuestion(
  text: string,
  questions: Question[],
  selected?: string,
) {
  const full = text.match(
    /(20\d{2})\s*(?:학년도|년)?\s*(?:전공\s*)?([ABab])\s*(?:형)?\s*(\d{1,2})\s*(?:번)?/,
  );
  if (full) {
    const id = `info-computer-${full[1]}-${full[2].toUpperCase()}-${Number(full[3])}`;
    const q = questions.find((q) => q.id === id);
    if (!q) throw new Error(`${full[0]}에 해당하는 실제 문항이 없습니다.`);
    return q;
  }
  // Never silently use the selected question when an incomplete reference is given.
  const partial =
    text.match(/(20\d{2})\s*(?:학년도|년)?\s*(\d{1,2})\s*번/) ||
    text.match(/(?:^|\s)(\d{1,2})\s*번/);
  if (partial)
    throw new Error(
      "문항을 정확히 지정해 주세요. 예: 2026 A 3번 (학년도 · A/B · 번호)",
    );
  const q = questions.find((q) => q.id === selected);
  if (!q)
    throw new Error("문제를 선택하거나 “2026 A 3번”처럼 질문에 적어 주세요.");
  return q;
}
export function questionLabel(q: Pick<Question, "exam" | "question_number">) {
  return `${q.exam.academic_year} ${q.exam.section} ${q.question_number}번`;
}
