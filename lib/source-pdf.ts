import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import type {Question} from './types';
import {safeAssetPath} from './store';
export async function questionSourcePdf(q:Question){
 const hashes=await Promise.all(q.assets.map(async a=>createHash('sha256').update(await readFile(safeAssetPath(a.path))).digest('hex')));
 const key=createHash('sha256').update(JSON.stringify(['ocr-source-v2',q.id,hashes])).digest('hex');
 const file=path.join(process.cwd(),'data/private/pdf-sources',`${key}.pdf`);
 if(existsSync(/*turbopackIgnore: true*/file))return {bytes:await readFile(/*turbopackIgnore: true*/file),key};
 const python=process.env.VP_PYTHON_PATH||path.join(process.cwd(),process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
 const bytes=await new Promise<Buffer>((resolve,reject)=>{
  const child=spawn(/*turbopackIgnore: true*/python,[path.join(process.cwd(),'scripts/source_pdf.py')],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'},timeout:180000});
  const chunks:Buffer[]=[];let error='';child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>{error+=b.toString()});child.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(`원문 PDF OCR 실패: ${error.slice(-1200)}`)));child.stdin.end(JSON.stringify(q));
 });
 if(bytes.subarray(0,4).toString()!=='%PDF')throw new Error('원문 OCR PDF가 올바르지 않습니다.');
 await mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}`;await writeFile(temporary,bytes);await rename(temporary,file);return {bytes,key};
}
