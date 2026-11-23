import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  QuestionSchema,
  type Question,
  type Concept,
  type Reflection,
  type Message,
  type Link,
  type Revision,
  type Learning,
  type StudyEntry,
} from "./types";

const OWNER = "local-owner";
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-·ㆍ]/g, "");
export class Store {
  db: DatabaseSync;
  constructor(
    filename = process.env.VP_DB_PATH || "data/private/vividparachute.sqlite",
  ) {
    if (filename !== ":memory:")
      mkdirSync(
        path.dirname(path.resolve(/* turbopackIgnore: true */ filename)),
        { recursive: true },
      );
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS concepts(id TEXT PRIMARY KEY, owner TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, aliases TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(owner,slug));
      CREATE TABLE IF NOT EXISTS question_concepts(question_id TEXT REFERENCES questions(id), concept_id TEXT REFERENCES concepts(id), context TEXT NOT NULL, PRIMARY KEY(question_id,concept_id));
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, owner TEXT NOT NULL, question_id TEXT REFERENCES questions(id), role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reflections(id TEXT PRIMARY KEY, owner TEXT NOT NULL, question_id TEXT REFERENCES questions(id), concept_id TEXT REFERENCES concepts(id), type TEXT NOT NULL, content TEXT NOT NULL, message_id TEXT REFERENCES messages(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, concept_id TEXT REFERENCES concepts(id), before_body TEXT NOT NULL, after_body TEXT NOT NULL, source_message_id TEXT REFERENCES messages(id), action TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS extraction_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, question_id TEXT REFERENCES questions(id), before_data TEXT NOT NULL, after_data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_audits(id TEXT PRIMARY KEY, owner TEXT NOT NULL, question_id TEXT REFERENCES questions(id), data TEXT NOT NULL, created_at TEXT NOT NULL);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS study_entries(id TEXT PRIMARY KEY, owner TEXT NOT NULL, question_id TEXT REFERENCES questions(id), user_message_id TEXT REFERENCES messages(id), answer_message_id TEXT REFERENCES messages(id), concept_ids TEXT NOT NULL, source TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  importQuestions(input: unknown[]) {
    const items = input.map((x) => QuestionSchema.parse(x));
    const ids = new Set<string>();
    for (const q of items) {
      if (ids.has(q.id)) throw new Error(`중복 문항 ID: ${q.id}`);
      ids.add(q.id);
      if (
        q.id !==
          `info-computer-${q.exam.academic_year}-${q.exam.section}-${q.question_number}` ||
        (q.exam.section === "B" && q.question_number > 11)
      )
        throw new Error("문항 ID와 시험 정보가 다릅니다.");
      for (const a of q.assets) safeAssetPath(a.path);
      const old = this.question(q.id);
      if (old && old.source.sha256 !== q.source.sha256)
        throw new Error(
          `${q.id}: 원본 SHA가 다릅니다. 기존 자료를 보존합니다.`,
        );
    }
    return this.transaction(() => {
      let count = 0;
      for (const q of items) {
        const old = this.question(q.id);
        // Corrections made in the reader survive repeated imports.
        if (old?.verified_text !== undefined) {
          q.verified_text = old.verified_text;
          q.review = old.review;
        }
        this.db
          .prepare(
            "INSERT INTO questions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
          )
          .run(q.id, JSON.stringify(q));
        count++;
      }
      return count;
    });
  }
  question(id: string): Question | undefined {
    const row = this.db
      .prepare("SELECT data FROM questions WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  questions(): Question[] {
    return (
      this.db.prepare("SELECT data FROM questions").all() as { data: string }[]
    )
      .map((r) => JSON.parse(r.data) as Question)
      .sort(
        (a, b) =>
          b.exam.academic_year - a.exam.academic_year ||
          a.exam.section.localeCompare(b.exam.section) ||
          a.question_number - b.question_number,
      );
  }
  concepts(): Concept[] {
    return (
      this.db
        .prepare("SELECT * FROM concepts WHERE owner=? ORDER BY title")
        .all(OWNER) as unknown as (Concept & { aliases: string })[]
    ).map((c) => ({ ...c, aliases: JSON.parse(c.aliases) }));
  }
  concept(id: string) {
    return this.concepts().find((c) => c.id === id);
  }
  links(): Link[] {
    return this.db
      .prepare(
        "SELECT question_id,concept_id,context FROM question_concepts WHERE concept_id IN (SELECT id FROM concepts WHERE owner=?)",
      )
      .all(OWNER) as unknown as Link[];
  }
  messages(id: string): Message[] {
    return this.db
      .prepare(
        "SELECT id,question_id,role,text,created_at FROM messages WHERE owner=? AND question_id=? ORDER BY rowid",
      )
      .all(OWNER, id) as unknown as Message[];
  }
  reflections(questionId?: string, conceptId?: string): Reflection[] {
    return this.db
      .prepare(
        `SELECT id,question_id,concept_id,type,content,message_id,created_at FROM reflections WHERE owner=? ${questionId ? "AND question_id=?" : ""} ${conceptId ? "AND concept_id=?" : ""} ORDER BY rowid DESC`,
      )
      .all(
        ...[
          OWNER,
          ...(questionId ? [questionId] : []),
          ...(conceptId ? [conceptId] : []),
        ],
      ) as unknown as Reflection[];
  }
  revisions(id: string): Revision[] {
    return this.db
      .prepare(
        "SELECT id,concept_id,before_body,after_body,source_message_id,action,created_at FROM revisions WHERE owner=? AND concept_id=? ORDER BY id DESC",
      )
      .all(OWNER, id) as unknown as Revision[];
  }
  addMessage(
    questionId: string | undefined,
    role: "user" | "assistant",
    text: string,
    id = randomUUID(),
  ) {
    if (questionId && !this.question(questionId)) throw new Error("문항이 없습니다.");
    this.db
      .prepare("INSERT INTO messages VALUES (?,?,?,?,?,?)")
      .run(id, OWNER, questionId ?? null, role, text, new Date().toISOString());
    return id;
  }
  addReflection(input: {
    questionId?: string;
    conceptId?: string;
    type: Reflection["type"];
    content: string;
    messageId?: string;
  }) {
    if (
      (!input.questionId && !input.conceptId) ||
      (input.questionId && !this.question(input.questionId)) ||
      (input.conceptId && !this.concept(input.conceptId))
    )
      throw new Error("노트를 연결할 대상이 없습니다.");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO reflections (id,owner,question_id,concept_id,type,content,message_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        OWNER,
        input.questionId ?? null,
        input.conceptId ?? null,
        input.type,
        input.content,
        input.messageId ?? null,
        new Date().toISOString(),
      );
    return id;
  }
  editConcept(
    id: string,
    body: string,
    version: number,
    source: string | null = null,
    action = "manual",
  ) {
    const c = this.concept(id);
    if (!c) throw new Error("개념이 없습니다.");
    if (c.version !== version)
      throw new Error(
        "본문이 다른 요청에서 갱신되었습니다. 새로고침 후 다시 수정하세요.",
      );
    this.db
      .prepare(
        "INSERT INTO revisions(owner,concept_id,before_body,after_body,source_message_id,action,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(OWNER, id, c.body, body, source, action, new Date().toISOString());
    this.db
      .prepare(
        "UPDATE concepts SET body=?,version=version+1,updated_at=? WHERE id=? AND owner=?",
      )
      .run(body, new Date().toISOString(), id, OWNER);
  }
  saveConcept(input: {
    title: string;
    body: string;
    questionId?: string;
    context?: string;
  }) {
    return this.transaction(() => {
      let c = this.concepts().find(
        (c) => normalize(c.title) === normalize(input.title),
      );
      if (!c) {
        const id = randomUUID();
        this.db
          .prepare("INSERT INTO concepts VALUES (?,?,?,?,?,?,?,?)")
          .run(
            id,
            OWNER,
            normalize(input.title),
            input.title,
            "",
            "[]",
            new Date().toISOString(),
            1,
          );
        c = this.concept(id)!;
      }
      this.editConcept(c.id, input.body, c.version);
      if (input.questionId)
        this.link(
          input.questionId,
          c.id,
          input.context || "직접 연결한 학습 개념",
        );
      return c.id;
    });
  }
  link(q: string, c: string, context: string) {
    if (!this.question(q) || !this.concept(c))
      throw new Error("연결 대상이 없습니다.");
    this.db
      .prepare(
        "INSERT INTO question_concepts VALUES (?,?,?) ON CONFLICT(question_id,concept_id) DO UPDATE SET context=excluded.context",
      )
      .run(q, c, context);
  }
  applyLearning(
    qid: string,
    learning: Learning,
    source: string,
    snapshot: Concept[],
  ) {
    return this.transaction(() => {
      const current = this.concepts();
      if (
        JSON.stringify(current.map((c) => [c.id, c.version])) !==
        JSON.stringify(snapshot.map((c) => [c.id, c.version]))
      )
        throw new Error(
          "대화 중 전과가 변경되었습니다. 자동 편집을 적용하지 않았습니다.",
        );
      const answerId = this.addMessage(qid, "assistant", learning.answer);
      const changed: string[] = [];
      for (const candidate of learning.concepts) {
        const names = [
          candidate.slug,
          candidate.title,
          ...candidate.aliases,
        ].map(normalize);
        let c = this.concepts().find((c) =>
          [c.slug, c.title, ...c.aliases].some((n) =>
            names.includes(normalize(n)),
          ),
        );
        if (!c) {
          const id = randomUUID();
          this.db
            .prepare("INSERT INTO concepts VALUES (?,?,?,?,?,?,?,?)")
            .run(
              id,
              OWNER,
              normalize(candidate.slug),
              candidate.title,
              "",
              JSON.stringify(candidate.aliases),
              new Date().toISOString(),
              1,
            );
          c = this.concept(id)!;
        } else {
          this.db
            .prepare("UPDATE concepts SET aliases=? WHERE id=?")
            .run(
              JSON.stringify([
                ...new Set([...c.aliases, ...candidate.aliases]),
              ]),
              c.id,
            );
        }
        if (c.body !== candidate.body)
          this.editConcept(c.id, candidate.body, c.version, source, "ai-merge");
        this.link(qid, c.id, candidate.context);
        changed.push(c.id);
      }
      return { answerId, changed };
    });
  }
  undo(id: number) {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM revisions WHERE id=? AND owner=?")
        .get(id, OWNER) as unknown as Revision | undefined;
      if (!row) throw new Error("변경 이력이 없습니다.");
      const c = this.concept(row.concept_id)!;
      const latest = this.revisions(c.id)[0];
      if (latest.id !== id || latest.action === "undo")
        throw new Error("최신 변경만 되돌릴 수 있습니다.");
      this.editConcept(
        c.id,
        row.before_body,
        c.version,
        row.source_message_id,
        "undo",
      );
    });
  }
  correctQuestion(id: string, text: string, verified: boolean) {
    const q = this.question(id);
    if (!q) throw new Error("문항이 없습니다.");
    const before = JSON.stringify(q);
    q.verified_text = text;
    // Crop review and semantic analysis have separate statuses.
    q.review = {
      required: !verified,
      reasons: verified ? [] : ["사용자 교정 · 추가 검수 필요"],
      crop_status: verified ? "verified" : q.review.crop_status,
      text_status: verified ? "verified" : "needs_review",
    };
    return this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO extraction_revisions(question_id,before_data,after_data,created_at) VALUES (?,?,?,?)",
        )
        .run(id, before, JSON.stringify(q), new Date().toISOString());
      this.db
        .prepare("UPDATE questions SET data=? WHERE id=?")
        .run(JSON.stringify(q), id);
    });
  }
  audit(qid: string, data: unknown) {
    this.db
      .prepare("INSERT INTO ai_audits VALUES (?,?,?,?,?)")
      .run(
        randomUUID(),
        OWNER,
        qid,
        JSON.stringify(data),
        new Date().toISOString(),
      );
  }
  recordStudy(entry: StudyEntry) {
    const fingerprint=createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    return this.transaction(()=>{
      const previous=this.db.prepare('SELECT fingerprint,concept_ids FROM study_entries WHERE id=? AND owner=?').get(entry.entryId,OWNER) as {fingerprint:string;concept_ids:string}|undefined;
      if(previous){if(previous.fingerprint!==fingerprint)throw new Error('같은 entryId에 다른 내용이 있습니다.');return {duplicate:true,conceptIds:JSON.parse(previous.concept_ids) as string[]};}
      if(entry.questionId&&!this.question(entry.questionId))throw new Error('실제 문항을 찾지 못했습니다.');
      const candidates=entry.concepts.map(candidate=>{
        const names=[candidate.slug,candidate.title,...candidate.aliases].map(normalize);
        const existing=this.concepts().find(c=>[c.slug,c.title,...c.aliases].some(n=>names.includes(normalize(n))));
        if((existing?.version??0)!==candidate.expectedVersion)throw new Error(`${candidate.title}: 전과가 변경되었습니다. context를 다시 조회해 통합하세요.`);
        return {candidate,existing};
      });
      if(new Set(candidates.map(({candidate,existing})=>existing?.id||normalize(candidate.slug))).size!==candidates.length)throw new Error('같은 개념이 한 기록에 중복되었습니다.');
      const userId=this.addMessage(entry.questionId,'user',entry.question),answerId=this.addMessage(entry.questionId,'assistant',entry.answer),conceptIds:string[]=[];
      for(const {candidate,existing} of candidates){
        const conceptId=existing?.id||randomUUID();
        if(!existing)this.db.prepare('INSERT INTO concepts VALUES (?,?,?,?,?,?,?,?)').run(conceptId,OWNER,normalize(candidate.slug),candidate.title,'',JSON.stringify(candidate.aliases),new Date().toISOString(),1);
        else this.db.prepare('UPDATE concepts SET aliases=? WHERE id=? AND owner=?').run(JSON.stringify([...new Set([...existing.aliases,...candidate.aliases])]),conceptId,OWNER);
        const c=this.concept(conceptId)!;
        if(c.body!==candidate.body)this.editConcept(conceptId,candidate.body,c.version,userId,'codex-merge');
        if(entry.questionId)this.link(entry.questionId,conceptId,candidate.context);
        conceptIds.push(conceptId);
      }
      const targets=entry.questionId?[{questionId:entry.questionId}]:conceptIds.map(conceptId=>({conceptId}));
      for(const target of targets){this.addReflection({...target,type:'question',content:entry.question,messageId:userId});for(const r of entry.reflections)this.addReflection({...target,...r,messageId:userId});}
      this.db.prepare('INSERT INTO study_entries VALUES (?,?,?,?,?,?,?,?,?)').run(entry.entryId,OWNER,entry.questionId??null,userId,answerId,JSON.stringify(conceptIds),entry.source,fingerprint,new Date().toISOString());
      return {duplicate:false,conceptIds};
    });
  }
  conceptMessages(id:string):Message[]{
    const entries=this.db.prepare('SELECT user_message_id,answer_message_id,concept_ids FROM study_entries WHERE owner=? ORDER BY rowid').all(OWNER) as {user_message_id:string;answer_message_id:string;concept_ids:string}[];
    return entries.filter(e=>(JSON.parse(e.concept_ids) as string[]).includes(id)).flatMap(e=>[e.user_message_id,e.answer_message_id]).flatMap(id=>{const m=this.db.prepare('SELECT id,question_id,role,text,created_at FROM messages WHERE id=? AND owner=?').get(id,OWNER);return m?[m as unknown as Message]:[];});
  }
  version(){const {exported_at:_,...data}=this.export();return createHash('sha256').update(JSON.stringify(data)).digest('hex');}
  export() {
    return {
      format: "vividparachute-backup-v1",
      exported_at: new Date().toISOString(),
      questions: this.questions(),
      concepts: this.concepts(),
      links: this.links(),
      reflections: this.reflections(),
      messages: this.db
        .prepare("SELECT * FROM messages WHERE owner=?")
        .all(OWNER),
      revisions: this.db
        .prepare("SELECT * FROM revisions WHERE owner=?")
        .all(OWNER),
      extraction_revisions: this.db
        .prepare("SELECT * FROM extraction_revisions")
        .all(),
      study_entries:this.db.prepare('SELECT * FROM study_entries WHERE owner=?').all(OWNER),
    };
  }
}

export function safeAssetPath(relative: string) {
  if (!/^\d{4}_[AB]\/q\d{2}\/part\d+_p\d+\.png$/.test(relative))
    throw new Error("허용하지 않은 이미지 경로입니다.");
  return path.join(process.cwd(), "data", "processed", relative);
}
export function readCorpus(
  filename = path.join(process.cwd(), "data/processed/corpus.jsonl"),
): unknown[] {
  if (!existsSync(/* turbopackIgnore: true */ filename)) {
    if (path.resolve(/* turbopackIgnore: true */ filename) !== path.join(process.cwd(), "data/processed/corpus.jsonl")) {
      throw new Error("가져올 문항 파일이 없습니다.");
    }
    const root = path.join(process.cwd(), "data/processed");
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((n) => /^\d{4}_[AB]$/.test(n))
      .flatMap((exam) =>
        readdirSync(path.join(root, exam))
          .filter((n) => /^q\d{2}$/.test(n))
          .map((q) =>
            JSON.parse(
              readFileSync(path.join(root, exam, q, "question.json"), "utf8"),
            ),
          ),
      );
  }
  const raw = readFileSync(/* turbopackIgnore: true */ filename, "utf8").replace(/^\uFEFF/, "");
  if (filename.toLowerCase().endsWith(".json")) {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const singleton = globalThis as unknown as { vpStore?: Store };
export function getStore() {
  if (!singleton.vpStore) {
    singleton.vpStore = new Store();
    if (!singleton.vpStore.questions().length)
      singleton.vpStore.importQuestions(readCorpus());
  }
  return singleton.vpStore;
}
