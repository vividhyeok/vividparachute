import { z } from "zod";

export const QuestionSchema = z
  .object({
    id: z.string().regex(/^info-computer-\d{4}-[AB]-\d{1,2}$/),
    exam: z.object({
      academic_year: z.number().int(),
      subject: z.literal("정보·컴퓨터"),
      section: z.enum(["A", "B"]),
    }),
    question_number: z.number().int().min(1).max(12),
    score: z.number().nullable(),
    source: z.object({
      original_pdf: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      source_page_url: z.string(),
      pdf_pages: z.array(z.number()),
    }),
    raw_text: z.string(),
    verified_text: z.string().optional(),
    assets: z.array(
      z.object({
        path: z.string(),
        page: z.number(),
        region: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        kind: z.enum(["question_crop", "page_fallback"]),
      }),
    ),
    analysis: z.object({
      status: z.enum(["pending", "needs_review", "verified"]),
      visuals: z.array(z.unknown()),
      sections: z.array(z.unknown()),
      concept_tags: z.array(z.string()),
    }),
    review: z.object({
      required: z.boolean(),
      reasons: z.array(z.string()),
      crop_status: z.enum(["verified", "needs_review"]).optional(),
      text_status: z.enum(["verified", "needs_review"]).optional(),
      note: z.string().optional(),
    }),
  })
  .passthrough();
export type Question = z.infer<typeof QuestionSchema>;
export type Concept = {
  id: string;
  title: string;
  slug: string;
  body: string;
  aliases: string[];
  updated_at: string;
  version: number;
};
export type Reflection = {
  id: string;
  question_id: string | null;
  concept_id: string | null;
  type: "question" | "thought" | "confusion" | "mistake" | "review" | "memo";
  content: string;
  created_at: string;
  message_id: string | null;
};
export type Message = {
  id: string;
  question_id: string | null;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};
export type Link = { question_id: string; concept_id: string; context: string };
export type Revision = {
  id: number;
  concept_id: string;
  before_body: string;
  after_body: string;
  source_message_id: string | null;
  action: string;
  created_at: string;
};
export type QuestionSummary = Pick<
  Question,
  "id" | "exam" | "question_number" | "score" | "analysis" | "review"
> & { preview: string; search_text: string; asset_count: number };
export type Library = {
  questions: QuestionSummary[];
  concepts: Concept[];
  links: Link[];
  version: string;
  questionStudy: Record<string, QuestionStudy>;
};
export type QuestionProgress = { question_id: string; status: 'in_progress' | 'completed'; updated_at: string };
export type QuestionStudy = {
  status: 'unrecorded' | 'in_progress' | 'completed';
  hasExplanation: boolean;
  lastStudiedAt: string | null;
};

export const LearningSchema = z.object({
  answer: z.string().min(1).max(12000),
  concepts: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        title: z.string().min(1).max(120),
        aliases: z.array(z.string().max(120)).max(12),
        body: z.string().min(1).max(16000),
        context: z.string().max(500),
      }),
    )
    .max(5),
});
export type Learning = z.infer<typeof LearningSchema>;

export const StudyEntrySchema = z.object({
  entryId: z.string().min(8).max(150),
  questionId: z.string().regex(/^info-computer-\d{4}-[AB]-\d{1,2}$/).optional(),
  progress: z.enum(['in_progress','completed']).optional(),
  question: z.string().trim().min(1).max(30000), answer: z.string().trim().min(1).max(30000),
  source: z.string().trim().min(1).max(500).default('Codex'),
  concepts: z.array(z.object({
    title: z.string().trim().min(1).max(120), slug: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().max(120)).max(15).default([]),
    body: z.string().trim().min(1).max(40000), context: z.string().max(1000), expectedVersion: z.number().int().min(0),
  })).max(8),
  reflections: z.array(z.object({type:z.enum(['thought','confusion','mistake','review','memo']),content:z.string().trim().min(1).max(10000)})).max(12).default([]),
}).refine(e=>!!e.questionId || e.concepts.length>0,{message:'문항이나 개념이 필요합니다.'})
  .refine(e=>!e.progress || !!e.questionId,{message:'풀이 상태에는 문항이 필요합니다.'});
export type StudyEntry = z.infer<typeof StudyEntrySchema>;
