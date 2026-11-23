import type { Concept, Link, Message, QuestionProgress, QuestionStudy, Reflection } from './types';

type StudyData = {
  concepts: Concept[];
  links: Link[];
  messages: Message[];
  reflections: Reflection[];
  question_progress?: QuestionProgress[];
};

export function questionStudy(data: StudyData): Record<string, QuestionStudy> {
  const result: Record<string, QuestionStudy> = {};
  const get = (id: string) => result[id] ??= { status: 'unrecorded', hasExplanation: false, lastStudiedAt: null };
  const touch = (id: string, date: string) => {
    const item = get(id);
    if (!item.lastStudiedAt || date > item.lastStudiedAt) item.lastStudiedAt = date;
    item.status = 'in_progress';
  };
  // Publication/concept-edit timestamps are not evidence of a new study session.
  for (const message of data.messages) {
    if (message.question_id) touch(message.question_id, message.created_at);
  }
  for (const note of data.reflections) {
    if (note.question_id) touch(note.question_id, note.created_at);
  }
  const explained = new Set(data.concepts.filter(c => c.body.trim()).map(c => c.id));
  for (const link of data.links) {
    if (explained.has(link.concept_id)) get(link.question_id).hasExplanation = true;
  }
  // A linked explanation is not proof the user attempted or completed a question.
  for (const progress of data.question_progress ?? []) {
    touch(progress.question_id, progress.updated_at);
    get(progress.question_id).status = progress.status;
  }
  return result;
}
