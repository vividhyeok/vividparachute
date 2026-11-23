import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {visit} from 'unist-util-visit';
import type {Root} from 'hast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import puppeteer from 'puppeteer-core';
import {get} from '@vercel/blob';
import {SnapshotReader,type ReaderStore} from './reader-store';
import {questionLabel} from './search';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function inertLinks(){return (tree:Root)=>{visit(tree,'element',node=>{if(node.tagName==='img'){node.tagName='span';node.children=[{type:'text',value:String(node.properties.alt||'')}];node.properties={};}else if(node.tagName==='a'){node.tagName='span';node.properties={};}});};}
function md(s:string){return String(unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype).use(rehypeKatex).use(inertLinks).use(rehypeStringify).processSync(s));}
function prose(s:string){return `<div class="prose">${md(s)}</div>`;}
const noteNames:Record<string,string>={question:'질문',thought:'나의 생각',confusion:'궁금했던 부분',mistake:'오답 기록',review:'복습',memo:'메모'};
function records(db:ReaderStore,qid?:string,cid?:string){

 const extra=cid?db.links().filter(l=>l.concept_id===cid).flatMap(l=>db.reflections(l.question_id).filter(r=>r.type!=='question')):[];
 const notes=[...db.reflections(qid,cid),...extra].filter(n=>n.type!=='question');
 return `${notes.length?'<h2>남겨 둔 기록</h2>':''}${notes.map(n=>`<section class="entry"><h3>${noteNames[n.type]}</h3><p class="verbatim">${escape(n.content)}</p></section>`).join('')}`;
}
export function pdfBody(db:ReaderStore,view:'book'|'question',id:string){
 if(view==='question'){
  const q=db.question(id);if(!q)throw new Error('문항을 찾을 수 없습니다.');
  const linked=db.links().filter(l=>l.question_id===q.id);
  const hasStudy=!!(db.messages(q.id).length||db.reflections(q.id).length||linked.length);
  const body=`<h1>${questionLabel(q)} 복습 노트</h1><p class="meta">원문 ${q.source.pdf_pages.join(', ')}쪽 · ${q.review.required?'전사 추가 검수 필요':'원문 대조 교정본'} · 현재 저장 내용을 반영했습니다.</p>${records(db,q.id)}${!db.messages(q.id).length&&!db.reflections(q.id).length?'<p class="muted">이 문항에 저장된 학습 기록이 아직 없습니다.</p>':''}${linked.map(l=>{const c=db.concept(l.concept_id);return c?`<section class="concept"><h2>${escape(c.title)}</h2><p class="meta">${escape(l.context)}</p>${prose(c.body)}</section>`:''}).join('')}<section class="transcript ${hasStudy?'with-study':'single'}"><h2>원문 텍스트 참고</h2><p class="meta">이미지가 기준입니다. OCR에는 오독이 있을 수 있습니다. 미지원 원문 기호는 [원문 기호]로 표시합니다.</p><p class="verbatim transcription">${escape((q.verified_text??q.raw_text).replace(/[\uE000-\uF8FF]/g,'[원문 기호]'))}</p></section>`;
  return {title:`${questionLabel(q)} 복습 노트`,body,question:q};
 }
 const concepts=id?[db.concept(id)].filter(x=>!!x):db.concepts();if(!concepts.length)throw new Error('저장된 개념이 없습니다.');
 return {title:id?concepts[0]!.title:'vividparachute 개념 전과',body:concepts.map(c=>`<article class="chapter"><h1>${escape(c!.title)}</h1><p class="meta">${escape(c!.updated_at.slice(0,10))} 정리</p>${prose(c!.body)}${db.links().filter(l=>l.concept_id===c!.id).length?'<h2>관련 기출</h2>':''}${db.links().filter(l=>l.concept_id===c!.id).map(l=>{const q=db.question(l.question_id);return `<p><strong>${q?questionLabel(q):escape(l.question_id)}</strong><br/>${escape(l.context)}</p>`}).join('')}${records(db,undefined,c!.id)}</article>`).join('')};
}
function fontCss(){
 const korean=readFileSync(path.join(process.cwd(),'assets/fonts/NotoSansKR.ttf')).toString('base64');
 let katex=readFileSync(path.join(process.cwd(),'node_modules/katex/dist/katex.min.css'),'utf8');
 katex=katex.replace(/url\(([^)]+)\)/g,(_,name:string)=>{const filename=name.replace(/["']/g,'');if(!/^fonts\/KaTeX_[a-zA-Z0-9-]+\.(woff2?|ttf)$/.test(filename))return 'url()';const bytes=readFileSync(path.join(process.cwd(),'node_modules/katex/dist',filename));const ext=path.extname(filename).slice(1);return `url(data:font/${ext};base64,${bytes.toString('base64')})`;});
 return `@font-face{font-family:Notebook;src:url(data:font/ttf;base64,${korean}) format('truetype');font-weight:100 900}${katex}`;
}
export function pdfHtml(title:string,body:string){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${fontCss()}
 @page{size:A4;margin:18mm 18mm 20mm}*{box-sizing:border-box}body{font:11pt/1.85 Notebook,sans-serif;color:#29313b;margin:0;word-break:keep-all;overflow-wrap:anywhere}h1{font-size:23pt;font-weight:500;line-height:1.5;margin:0 0 12mm;color:#403950}h2{font-size:14pt;font-weight:600;margin:9mm 0 4mm;break-after:avoid}h3{font-size:10pt;color:#74618f;font-weight:500;break-after:avoid;margin:0 0 3mm}p{margin:0 0 4mm}.meta{font-size:9pt;color:#767781;margin-bottom:7mm}.muted{color:#888}.entry{border-top:.3pt solid #ddd;padding-top:5mm;margin-bottom:6mm}.verbatim{white-space:pre-wrap}.transcription{font-size:10pt;line-height:1.8}.chapter+.chapter,.transcript.with-study{break-before:page}.concept{margin-top:8mm;break-before:page}pre{font:9pt/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f8;padding:4mm}code{font-family:monospace;font-size:.9em}table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:5mm 0}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:.4pt solid #d8d8df;padding:2mm 3mm}th{background:#f3f2f7}blockquote{border-left:2pt solid #b4a7cd;margin:5mm 0;padding-left:5mm;color:#685e76}li{margin:1mm 0}.katex-display{margin:5mm 0}.katex{font-size:1.1em}.book-brand{font-size:9pt;letter-spacing:1pt;color:#88759e;margin-bottom:7mm}
 </style></head><body><div class="book-brand">vividparachute</div>${body}</body></html>`;}
async function print(html:string){
 let options:Parameters<typeof puppeteer.launch>[0];
 if(process.env.VERCEL==='1'){
  const chromium=(await import('@sparticuz/chromium')).default;
  options={args:chromium.args,executablePath:await chromium.executablePath(),headless:true};
 }else{
  const executablePath=process.env.VP_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(p=>existsSync(p));
  if(!executablePath)throw new Error('PDF 생성에 사용할 Chrome 또는 Edge가 없습니다.');options={executablePath,headless:true};
 }
 const browser=await puppeteer.launch(options);
 try{const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')||r.url()==='about:blank'?r.continue():r.abort());await page.setContent(html,{waitUntil:'load',timeout:60000});const out=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;padding:0 50px;color:#999;display:flex;justify-content:space-between"><span>vividparachute</span><span class="pageNumber"></span></div>',margin:{top:'18mm',right:'18mm',bottom:'20mm',left:'18mm'},timeout:60000});return out;}finally{await browser.close();}
}
export async function exportPdf(db:ReaderStore,view:'book'|'question',id:string){
 const document=pdfBody(db,view,id);const notes=await print(pdfHtml(document.title,document.body));
 const result=await PDFDocument.create();
 if(document.question){let source:Uint8Array;
  if(db instanceof SnapshotReader){const file=db.snapshot.questionPdfs[document.question.id];if(!file)throw new Error('검색 가능한 원문 PDF를 아직 동기화하지 않았습니다.');const blob=await get(file.pathname,{access:'private'});if(!blob||blob.statusCode!==200)throw new Error('원문 PDF를 읽지 못했습니다.');source=new Uint8Array(await new Response(blob.stream).arrayBuffer());}
  else{const {questionSourcePdf}=await import('./source-pdf');source=(await questionSourcePdf(document.question)).bytes;}
  const original=await PDFDocument.load(source);for(const p of await result.copyPages(original,original.getPageIndices()))result.addPage(p);
 }
 const n=await PDFDocument.load(notes);for(const p of await result.copyPages(n,n.getPageIndices()))result.addPage(p);
 result.setTitle(document.title);result.setAuthor('vividparachute');result.setSubject(`Current library ${db.version()}`);return Buffer.from(await result.save());
}
