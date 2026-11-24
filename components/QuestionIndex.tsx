import type { QuestionStudy, QuestionSummary } from '@/lib/types';
import { questionLabel } from '@/lib/search';
import HintButton from './HintButton';

type Props = {
  questions: QuestionSummary[];
  study: Record<string, QuestionStudy>;
  visited: Record<string, string>;
  onSelect: (id: string) => void;
  currentId?: string;
  compact?: boolean;
};
const statusNames = { unrecorded: '기록 없음', visited: '열어봄', in_progress: '공부 중', completed: '풀이 완료' };

export default function QuestionIndex({ questions, study, visited, onSelect, currentId, compact = false }: Props) {
  const ordered = [...questions].sort((a, b) => b.exam.academic_year - a.exam.academic_year || a.exam.section.localeCompare(b.exam.section) || a.question_number - b.question_number);
  const groups = new Map<string, QuestionSummary[]>();
  for (const q of ordered) {
    const key = `${q.exam.academic_year}학년도 · 전공 ${q.exam.section}`;
    const group = groups.get(key) ?? [];
    group.push(q);
    groups.set(key, group);
  }
  const latest = [...ordered].filter(q => study[q.id]?.lastStudiedAt).sort((a, b) => study[b.id].lastStudiedAt!.localeCompare(study[a.id].lastStudiedAt!))[0];
  const lastViewed = latest ? undefined : [...ordered].filter(q => visited[q.id]).sort((a, b) => visited[b.id].localeCompare(visited[a.id]))[0];
  const resume = latest ?? lastViewed;
  return <div className={`question-index${compact ? ' compact' : ''}`}>
    {resume && <button className="resume-question" onClick={() => onSelect(resume.id)}><span>{latest ? '최근 공부 이어보기' : '마지막으로 열어본 문항'}</span><strong>{questionLabel(resume)} →</strong></button>}
    <details className="status-help"><summary aria-label="문항 표시 안내" title="문항 표시 안내">ⓘ</summary><div><ul className="study-legend" aria-label="문항 상태 안내">{Object.entries(statusNames).map(([key, label]) => <li className={`status-${key}`} key={key}><span className="status-dot" aria-hidden="true"/>{label}</li>)}<li className="explanation-legend">밑줄 · 설명 있음</li></ul><p className="progress-caption">열어봄은 이 브라우저 기준 · 풀이 완료는 직접 완료를 알린 기록 기준</p></div></details>
    <div className="question-groups">{[...groups].map(([label, items]) => <section className="question-group" key={label} aria-label={label}><h3>{label}</h3><div className="question-cells">{items.map(q => {
      const entry = study[q.id];
      const status = entry?.status && entry.status !== 'unrecorded' ? entry.status : visited[q.id] ? 'visited' : 'unrecorded';
      const isLatest = latest?.id === q.id;
      const description = `${questionLabel(q)} · ${statusNames[status]}${entry?.hasExplanation ? ' · 설명 있음' : ''}${isLatest ? ' · 최근 공부' : ''}`;
      return <HintButton key={q.id} hint={description} className={`question-cell status-${status}${entry?.hasExplanation ? ' has-explanation' : ''}${isLatest ? ' latest-study' : ''}`} onClick={() => onSelect(q.id)} aria-label={description} aria-current={currentId === q.id ? 'page' : undefined}>
        <span className="question-cell-number"><span className="status-dot" aria-hidden="true"/>{q.question_number}번</span>
        {isLatest && <span className="latest-pin" aria-hidden="true"/>}
      </HintButton>;
    })}</div></section>)}</div>
    {questions.length === 0 && <p className="muted">일치하는 문항이 없습니다.</p>}
  </div>;
}
