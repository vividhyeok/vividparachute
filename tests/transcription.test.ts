import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Store} from '../lib/store';
import {QuestionSchema,SourceTranscriptionSchema} from '../lib/types';
import {transcriptionText,validateSourceFigures} from '../lib/transcription';

const q=QuestionSchema.parse({id:'info-computer-2026-A-1',exam:{academic_year:2026,subject:'정보·컴퓨터',section:'A'},question_number:1,score:2,source:{original_pdf:'fixture.pdf',sha256:'a'.repeat(64),source_page_url:'https://example.com',pdf_pages:[1]},raw_text:'Unmodified raw OCR',assets:[{path:'2026_A/q01/part01_p01.png',page:1,region:[0,0,100,200],kind:'question_crop'}],analysis:{status:'needs_review',visuals:[],sections:[],concept_tags:[]},review:{required:true,reasons:['fixture'],crop_status:'verified'}});
const source=SourceTranscriptionSchema.parse({format:'reviewed-markdown-v1',body:'## 자료\n```c\nint n = ㉠;\n```\n![제공된 그림](source:diagram)\n## 조건\n원문 조건',figures:[{id:'diagram',assetIndex:0,rect:[10,20,80,100],assetWidth:100,assetHeight:200,description:'원본에 표시된 연결과 값'}],reviewedAssets:[{path:q.assets[0].path,sha256:'b'.repeat(64)}],sourceSha256:q.source.sha256,checkedAt:'2026-11-24T00:00:00Z',unresolved:[],reviewNote:'Synthetic review evidence'});
test('source reconstruction preserves code, searches diagram descriptions and rejects broken evidence',()=>{
 validateSourceFigures(source);assert.match(transcriptionText(source),/int n = ㉠;/);assert.match(transcriptionText(source),/그림 설명.*연결과 값/);
 assert.throws(()=>validateSourceFigures({...source,body:source.body.replace('source:diagram','source:missing')}));
 assert.throws(()=>validateSourceFigures({...source,figures:[{...source.figures[0],rect:[10,20,200,100]}]}));
 assert.throws(()=>validateSourceFigures({...source,body:source.body+'\n```c'}));
 assert.throws(()=>validateSourceFigures({...source,body:source.body+'\uE001'}));
});
test('review batch is atomic and idempotent without fabricating study activity',()=>{
 const db=new Store(':memory:');try{db.importQuestions([q]);const version=db.version();
 assert.throws(()=>db.reviewQuestions({[q.id]:source,'info-computer-2026-A-2':source}));assert.equal(db.version(),version);
 assert.deepEqual(db.reviewQuestions({[q.id]:source}),[q.id]);assert.equal(db.question(q.id)?.raw_text,q.raw_text);assert.equal(db.question(q.id)?.review.required,false);
 assert.equal(db.messages(q.id).length,0);assert.equal(db.links().length,0);assert.equal(db.export().question_progress.length,0);
 const updated=db.version();assert.deepEqual(db.reviewQuestions({[q.id]:source}),[]);assert.equal(db.version(),updated);
 db.importQuestions([q]);assert.deepEqual(db.question(q.id)?.transcription,source);assert.equal(db.question(q.id)?.analysis.status,'verified');
 }finally{db.db.close();}
});
test('available private corpus has complete reviewed image coverage',{skip:!existsSync('data/private/transcription-review/2026_A.json')},()=>{
 const db=new Store();try{assert.equal(db.questions().length,46);let assets=0;
 for(const question of db.questions()){const document=question.transcription;assert.ok(document,question.id);validateSourceFigures(document);assert.equal(document.reviewedAssets.length,question.assets.length);assert.equal(document.sourceSha256,question.source.sha256);assert.equal(question.review.required,false);assets+=question.assets.length;}
 assert.equal(assets,61);
 }finally{db.db.close();}
});
