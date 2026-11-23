import {get,put} from '@vercel/blob';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Store,safeAssetPath} from './store';
import {questionSourcePdf} from './source-pdf';
import {publicationVersion,type PublishedLibrary,type RemoteFile} from './reader-store';
export async function publishLibrary(db:Store){
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('비공개 Blob 자격증명이 없습니다. 로컬 기록은 보존됩니다.');
 const existing=await get('vividparachute/current.json',{access:'private',useCache:false});
 const previous=existing?.statusCode===200?await new Response(existing.stream).json() as PublishedLibrary:undefined;
 const etag=existing?.statusCode===200?existing.blob.etag:undefined;
 const assets:Record<string,RemoteFile>={},questionPdfs:Record<string,RemoteFile>={};
 for(const q of db.questions()){
  for(const a of q.assets){const bytes=await readFile(safeAssetPath(a.path)),sha256=createHash('sha256').update(bytes).digest('hex');let file=previous?.assets[a.path];
   if(file?.sha256!==sha256){const pathname=`vividparachute/assets/${sha256}.png`;await put(pathname,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'image/png'});file={pathname,sha256};}assets[a.path]=file;
  }
  const source=await questionSourcePdf(q),sha256=createHash('sha256').update(source.bytes).digest('hex');let file=previous?.questionPdfs[q.id];
  if(file?.sha256!==sha256){const pathname=`vividparachute/original-pdfs/${sha256}.pdf`;await put(pathname,source.bytes,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/pdf'});file={pathname,sha256};}questionPdfs[q.id]=file;
 }
 const data=db.export();const version=publicationVersion(data,assets,questionPdfs);
 if(previous?.version===version)return {version,changed:false};
 const snapshot:PublishedLibrary={format:'vividparachute-reader-v2',version,publishedAt:new Date().toISOString(),data,assets,questionPdfs};
 await put('vividparachute/current.json',JSON.stringify(snapshot),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:0,...(etag?{ifMatch:etag}:{})});
 return {version,changed:true};
}
