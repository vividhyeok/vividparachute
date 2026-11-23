import { get } from '@vercel/blob';
import { createHash } from 'node:crypto';
import type { Store } from './store';
import type { Question,Concept,Message,Reflection,Link } from './types';
export type ExportData=ReturnType<Store['export']>;
export type RemoteFile={pathname:string;sha256:string};
export type PublishedLibrary={format:'vividparachute-reader-v2';version:string;publishedAt:string;data:ExportData;assets:Record<string,RemoteFile>;questionPdfs:Record<string,RemoteFile>};
export interface ReaderStore {
 questions():Question[];question(id:string):Question|undefined;concepts():Concept[];concept(id:string):Concept|undefined;links():Link[];messages(id:string):Message[];conceptMessages(id:string):Message[];reflections(questionId?:string,conceptId?:string):Reflection[];export():ExportData;version():string;
}
export class SnapshotReader implements ReaderStore {
 constructor(public snapshot:PublishedLibrary){}
 questions(){return this.snapshot.data.questions;} question(id:string){return this.questions().find(q=>q.id===id);}
 concepts(){return this.snapshot.data.concepts;} concept(id:string){return this.concepts().find(c=>c.id===id);}
 links(){return this.snapshot.data.links;}
 messages(id:string){return (this.snapshot.data.messages as unknown as Message[]).filter(m=>m.question_id===id);}
 reflections(questionId?:string,conceptId?:string){return this.snapshot.data.reflections.filter(r=>(!questionId||r.question_id===questionId)&&(!conceptId||r.concept_id===conceptId));}
 conceptMessages(id:string){const entries=this.snapshot.data.study_entries as unknown as {concept_ids:string;user_message_id:string;answer_message_id:string}[];const ids=new Set(entries.filter(e=>(JSON.parse(e.concept_ids) as string[]).includes(id)).flatMap(e=>[e.user_message_id,e.answer_message_id]));return (this.snapshot.data.messages as unknown as Message[]).filter(m=>ids.has(m.id));}
 export(){return this.snapshot.data;} version(){return this.snapshot.version;}
}
let cached:{etag:string;snapshot:PublishedLibrary}|undefined;
export async function getReaderStore():Promise<ReaderStore>{
 if(process.env.VERCEL==='1'||process.env.VP_CLOUD_READER==='true'){
  const blob=await get('vividparachute/current.json',{access:'private',useCache:false,...(cached?{ifNoneMatch:cached.etag}:{})});
  if(blob?.statusCode===304&&cached)return new SnapshotReader(cached.snapshot);
  if(!blob||blob.statusCode!==200)throw new Error('아직 서재를 동기화하지 않았습니다. PC에서 npm run sync를 실행해 주세요.');
  const data=await new Response(blob.stream).json() as PublishedLibrary;
  if(data.format!=='vividparachute-reader-v2')throw new Error('지원하지 않는 서재 형식입니다.');
  cached={etag:blob.blob.etag,snapshot:data};
  return new SnapshotReader(data);
 }
 const {getStore}=await import('./store');return getStore();
}
export function publicationVersion(data:ExportData,assets:Record<string,RemoteFile>,questionPdfs:Record<string,RemoteFile>){const {exported_at:_,...content}=data;return createHash('sha256').update(JSON.stringify({content,assets,questionPdfs})).digest('hex');}
