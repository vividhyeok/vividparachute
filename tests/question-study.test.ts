import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionStudy } from '../lib/question-study';
import { Store } from '../lib/store';
import { StudyEntrySchema, type Message, type Question, type QuestionProgress } from '../lib/types';

const question: Question = { id:'info-computer-2026-A-1', exam:{academic_year:2026,subject:'정보·컴퓨터',section:'A'},question_number:1,score:2,source:{original_pdf:'test.pdf',sha256:'a'.repeat(64),source_page_url:'https://example.com',pdf_pages:[1]},raw_text:'test',assets:[],analysis:{status:'pending',visuals:[],sections:[],concept_tags:[]},review:{required:true,reasons:[]} };
test('question study distinguishes explanation, activity and explicit completion', () => {
  const data = { concepts:[{id:'c',title:'test',slug:'test',body:'A published explanation',aliases:[],updated_at:'2099-01-01',version:1}],links:[{question_id:question.id,concept_id:'c',context:'test'}],messages:[] as Message[],reflections:[],question_progress:[] as QuestionProgress[] };
  assert.deepEqual(questionStudy(data)[question.id], {status:'unrecorded',hasExplanation:true,lastStudiedAt:null});
  data.messages.push({id:'m',question_id:question.id,role:'assistant',text:'정답입니다. 완료!',created_at:'2026-11-23T01:00:00Z'});
  assert.equal(questionStudy(data)[question.id].status,'in_progress');
  assert.equal(questionStudy(data)[question.id].lastStudiedAt,'2026-11-23T01:00:00Z');
  data.question_progress.push({question_id:question.id,status:'completed',updated_at:'2026-11-23T01:01:00Z'});
  assert.equal(questionStudy(data)[question.id].status,'completed');
  // Old snapshots have no progress table; their study history must still appear.
  const {question_progress:_,...legacy}=data;
  assert.equal(questionStudy(legacy)[question.id].status,'in_progress');
});
test('explicit completion is atomic, idempotent and preserved across later hints', () => {
  const db=new Store(':memory:');
  try {
    db.importQuestions([question]);
    const entry=StudyEntrySchema.parse({entryId:'completion-test-001',questionId:question.id,progress:'completed',question:'다 풀었어',answer:'풀이 완료로 기록했습니다.',concepts:[]});
    db.recordStudy(entry);
    const progress=db.export().question_progress;
    assert.equal(progress[0].status,'completed');
    assert.equal(db.recordStudy(entry).duplicate,true);
    assert.deepEqual(db.export().question_progress,progress);
    db.recordStudy({...entry,entryId:'completion-test-002',progress:undefined,question:'힌트 다시 볼게'});
    assert.equal(db.export().question_progress[0].status,'completed');
    assert.throws(()=>db.recordStudy({...entry,entryId:'completion-test-003',concepts:[{slug:'missing',title:'missing',aliases:[],body:'test',context:'test',expectedVersion:99}]}));
    assert.deepEqual(db.export().question_progress,progress);
    assert.throws(()=>StudyEntrySchema.parse({...entry,questionId:undefined,concepts:[{slug:'x',title:'x',aliases:[],body:'x',context:'x',expectedVersion:0}]}));
  } finally { db.db.close(); }
});
