import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,readdirSync,renameSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadEnvConfig} from '@next/env';
import {Store,safeAssetPath} from '../lib/store';
import {SourceTranscriptionSchema,type SourceTranscription} from '../lib/types';
import {validateSourceFigures} from '../lib/transcription';
import {publishLibrary} from '../lib/publish';

process.chdir(fileURLToPath(new URL('..',import.meta.url)));loadEnvConfig(process.cwd());
function atomic(file:string,text:string){mkdirSync(path.dirname(file),{recursive:true});const temporary=`${file}.tmp`;writeFileSync(temporary,text,'utf8');renameSync(temporary,file);}
async function main(){
 const folder=process.argv[2];if(!folder)throw new Error('검수 JSON 폴더를 지정하세요.');
 const db=new Store();try{
  const sources:Record<string,SourceTranscription>={};
  for(const name of readdirSync(folder).filter(n=>n.endsWith('.json')).sort()){
   const entries=JSON.parse(readFileSync(path.join(folder,name),'utf8').replace(/^\uFEFF/,''));
   for(const[id,input]of Object.entries(entries)){if(sources[id])throw new Error(`중복 문항: ${id}`);const source=SourceTranscriptionSchema.parse(input);validateSourceFigures(source);sources[id]=source;}
  }
  const questions=db.questions();
  if(Object.keys(sources).length!==questions.length||questions.some(q=>!sources[q.id]))throw new Error('현재 문항 전체를 검수한 입력이 필요합니다.');
  const originalHashes=new Map<string,string>();
  for(const q of questions){
   const source=sources[q.id];
   const original=path.resolve(q.source.original_pdf),rawRoot=path.resolve('data/raw')+path.sep;
   if(!original.startsWith(rawRoot))throw new Error(`${q.id}: 원본 PDF 경로 불일치`);
   if(!originalHashes.has(original))originalHashes.set(original,createHash('sha256').update(readFileSync(original)).digest('hex'));
   if(originalHashes.get(original)!==source.sourceSha256)throw new Error(`${q.id}: 원본 PDF 파일이 변경됨`);
   if(source.sourceSha256!==q.source.sha256||source.reviewedAssets.length!==q.assets.length)throw new Error(`${q.id}: 원본 불일치`);
   for(const[index,asset]of q.assets.entries()){
    const bytes=readFileSync(safeAssetPath(asset.path)),evidence=source.reviewedAssets[index];
    if(asset.path!==evidence.path||createHash('sha256').update(bytes).digest('hex')!==evidence.sha256)throw new Error(`${q.id}: 검수 이미지가 변경됨`);
    for(const f of source.figures.filter(f=>f.assetIndex===index))if(bytes.readUInt32BE(16)!==f.assetWidth||bytes.readUInt32BE(20)!==f.assetHeight)throw new Error(`${q.id}: 도해 좌표 기준 불일치`);
   }
  }
  const changed=db.reviewQuestions(sources),current=db.questions();
  const correctionFile='overrides/content_corrections.json';let corrections:Record<string,unknown>={};try{corrections=JSON.parse(readFileSync(correctionFile,'utf8'));}catch{/* A first reviewed corpus has no previous corrections. */}
  for(const q of current){
   const exam=`${q.exam.academic_year}_${q.exam.section}`,filename=`data/processed/${exam}/q${String(q.question_number).padStart(2,'0')}/question.json`;
   atomic(filename,JSON.stringify(q,null,2));
   corrections[q.id]={verified_text:q.verified_text,transcription:q.transcription,visuals:q.analysis.visuals,concept_tags:q.analysis.concept_tags,review_note:q.review.note};
  }
  atomic('data/processed/corpus.jsonl',current.map(q=>JSON.stringify(q)).join('\n')+'\n');
  atomic(correctionFile,JSON.stringify(corrections,null,2));
  console.log(JSON.stringify({saved:true,questions:current.length,assets:current.reduce((n,q)=>n+q.assets.length,0),changed:changed.length,unresolved:current.filter(q=>q.review.required).map(q=>q.id)}));
  if(!process.argv.includes('--local-only'))console.log(JSON.stringify({published:true,...await publishLibrary(db)}));
 }finally{db.db.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
