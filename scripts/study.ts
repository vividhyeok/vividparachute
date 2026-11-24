import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {loadEnvConfig} from '@next/env';
import {Store,readCorpus,safeAssetPath} from '../lib/store';
import {StudyEntrySchema} from '../lib/types';
import {resolveQuestion} from '../lib/search';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);loadEnvConfig(root);
async function main(){
 const db=new Store();try{
  if(!db.questions().length)db.importQuestions(readCorpus());
  const command=process.argv[2];
  if(command==='context'){
   const text=process.argv[3]||'';let q;try{q=resolveQuestion(text,db.questions());}catch(e){if(/20\d{2}/.test(text))throw e;}
   const concepts=q?db.concepts():db.concepts().filter(c=>`${c.title} ${c.aliases.join(' ')} ${c.body}`.toLowerCase().includes(text.toLowerCase()));
   console.log(JSON.stringify({question:q?{...q,assets:q.assets.map(a=>({...a,absolutePath:safeAssetPath(a.path)}))}:null,progress:q?db.export().question_progress.find(p=>p.question_id===q.id)??null:undefined,concepts,links:db.links(),messages:q?db.messages(q.id):[],reflections:q?db.reflections(q.id):[],instruction:'Read the actual original images before answering a question. Preserve the user wording. Rewrite canonical concepts, do not append chat. expectedVersion must match these versions. Set optional progress only when the user explicitly reports completion or asks to reopen a completed question.'},null,2));return;
  }
  if(command==='record'){
   if(!process.argv[3])throw new Error('record <entry.json>을 지정하세요.');
   const entry=StudyEntrySchema.parse(JSON.parse(readFileSync(path.resolve(process.argv[3]),'utf8').replace(/^\uFEFF/,'')));
   const result=db.recordStudy(entry);console.log(JSON.stringify({saved:true,...result}));
   if(!process.argv.includes('--local-only')){try{const {publishLibrary}=await import('../lib/publish');console.log(JSON.stringify({published:true,...await publishLibrary(db)}));}catch(e){console.error('로컬 저장 완료. 웹 동기화 대기:',e instanceof Error?e.message:String(e));process.exitCode=2;}}return;
  }
  if(command==='sync'){const {publishLibrary}=await import('../lib/publish');console.log(JSON.stringify(await publishLibrary(db)));return;}
  if(command==='pdf'){
   const ref=process.argv[3]||'';const q=/20\d{2}/.test(ref)?resolveQuestion(ref,db.questions()):undefined;
   const c=!q&&ref?db.concepts().find(c=>c.id===ref||c.title===ref):undefined;
   if(ref&&ref!=='all'&&!q&&!c)throw new Error('문항 또는 개념을 찾지 못했습니다.');
   const {exportPdf}=await import('../lib/pdf');const bytes=await exportPdf(db,ref==='all'?'all':q?'question':'book',q?.id||c?.id||'');
   const output=path.resolve(process.argv[4]||`output/pdf/${q?.id||c?.slug||(ref==='all'?'study-notes':'vividparachute')}.pdf`);mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,bytes);console.log(output);return;
  }
  if(command==='undo'){const n=Number(process.argv[3]);if(!Number.isInteger(n))throw new Error('revision ID가 필요합니다.');db.undo(n);if(!process.argv.includes('--local-only')){const {publishLibrary}=await import('../lib/publish');await publishLibrary(db);}console.log('Restored the previous concept body.');return;}
  console.log('study context "2026 A 3번" | context "개념" | record entry.json [--local-only] | sync | pdf "2026 A 3번" [output.pdf] | undo revisionId');
 }finally{db.db.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
