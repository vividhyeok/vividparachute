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
import {questionStudy} from './question-study';
import type {Message,Question} from './types';
export type PdfView='book'|'question'|'all';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function inertLinks(){return (tree:Root)=>{visit(tree,'element',node=>{if(node.tagName==='img'){node.tagName='span';node.children=[{type:'text',value:String(node.properties.alt||'')}];node.properties={};}else if(node.tagName==='a'){node.tagName='span';node.properties={};}});};}
function md(s:string){return String(unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype).use(rehypeKatex).use(inertLinks).use(rehypeStringify).processSync(s));}
function prose(s:string){return `<div class="prose">${md(s)}</div>`;}
const noteNames:Record<string,string>={question:'질문',thought:'나의 생각',confusion:'궁금했던 부분',mistake:'오답 기록',review:'복습',memo:'메모'};
function records(db:ReaderStore,qid?:string,cid?:string,includeLinked=true){

 const extra=cid&&includeLinked?db.links().filter(l=>l.concept_id===cid).flatMap(l=>db.reflections(l.question_id).filter(r=>r.type!=='question')):[];
 const notes=[...db.reflections(qid,cid),...extra].filter(n=>n.type!=='question');
 return `${notes.length?'<h2>남겨 둔 기록</h2>':''}${notes.map(n=>`<section class="entry"><h3>${noteNames[n.type]}</h3><p class="verbatim">${escape(n.content)}</p></section>`).join('')}`;
}
export function pdfBody(db:ReaderStore,view:PdfView,id:string):{title:string;body:string;question?:Question;questions?:Question[]}{
 if(view==='all'){
  const data=db.export(),study=questionStudy({...data,messages:data.messages as unknown as Message[]});
  const questions=db.questions().filter(q=>study[q.id]?.lastStudiedAt||study[q.id]?.hasExplanation);
  const concepts=db.concepts();
  if(!concepts.length&&!questions.length)throw new Error('저장된 학습 노트가 없습니다.');
  const contents=`<article class="chapter collection-cover"><h1>전체 학습 노트</h1><p class="meta">${new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</p><h2>개념 전과</h2><ul>${concepts.map(c=>`<li>${escape(c.title)}</li>`).join('')}</ul>${questions.length?`<h2>기출 복습</h2><p>${questions.map(q=>questionLabel(q)).join(' · ')}</p><p class="meta">검색 가능한 기출 원문은 책 뒤에 수록했습니다.</p>`:''}</article>`;
  const chapters=concepts.map(c=>`<article class="chapter"><h1>${escape(c.title)}</h1>${prose(c.body)}${records(db,undefined,c.id,false)}</article>`).join('');
  const review=questions.length?`<article class="chapter"><h1>기출 복습</h1>${questions.map(q=>`<section class="question-review"><h2>${questionLabel(q)}</h2>${db.links().filter(l=>l.question_id===q.id).map(l=>{const c=db.concept(l.concept_id);return c?`<p class="concept-reference">↗ ${escape(c.title)}</p>`:''}).join('')}${records(db,q.id)}</section>`).join('')}</article>`:'';
  const unattached=db.reflections().filter(n=>!n.question_id&&!n.concept_id&&n.type!=='question');
  const memo=unattached.length?`<article class="chapter"><h1>메모</h1>${unattached.map(n=>`<p class="verbatim">${escape(n.content)}</p>`).join('')}</article>`:'';
  return {title:'vividparachute 전체 학습 노트',body:contents+chapters+review+memo,questions};
 }
 if(view==='question'){
  const q=db.question(id);if(!q)throw new Error('문항을 찾을 수 없습니다.');
  const linked=db.links().filter(l=>l.question_id===q.id);

  const body=`<h1>${questionLabel(q)} 복습 노트</h1><p class="meta">원문 ${q.source.pdf_pages.join(', ')}쪽 · ${q.review.required?'전사 추가 검수 필요':'원문 대조 교정본'} · 현재 저장 내용을 반영했습니다.</p>${records(db,q.id)}${!db.messages(q.id).length&&!db.reflections(q.id).length?'<p class="muted">이 문항에 저장된 학습 기록이 아직 없습니다.</p>':''}${linked.map(l=>{const c=db.concept(l.concept_id);return c?`<section class="concept"><h2>${escape(c.title)}</h2>${prose(c.body)}</section>`:''}).join('')}`;
  return {title:`${questionLabel(q)} 복습 노트`,body,question:q};
 }
 const concepts=id?[db.concept(id)].filter(x=>!!x):db.concepts();if(!concepts.length)throw new Error('저장된 개념이 없습니다.');
 return {title:id?concepts[0]!.title:'vividparachute 개념 전과',body:concepts.map(c=>`<article class="chapter"><h1>${escape(c!.title)}</h1><p class="meta">${escape(c!.updated_at.slice(0,10))} 정리</p>${prose(c!.body)}${db.links().filter(l=>l.concept_id===c!.id).length?'<h2>관련 기출</h2>':''}${db.links().filter(l=>l.concept_id===c!.id).map(l=>{const q=db.question(l.question_id);return `<p><strong>${q?questionLabel(q):escape(l.question_id)}</strong><br/>${escape(l.context)}</p>`}).join('')}${records(db,undefined,c!.id)}</article>`).join('')};
}
let handFont:Promise<string|undefined>|undefined;
async function handwritingFont(){
 return handFont??=fetch('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/GangwonEduSaeeum_OTFMediumA.woff',{signal:AbortSignal.timeout(12000)}).then(async response=>{if(!response.ok)throw new Error('손글씨 폰트 로드 실패');return Buffer.from(await response.arrayBuffer()).toString('base64');}).catch(()=>{console.warn('PDF handwriting font unavailable; using embedded Noto Sans KR.');handFont=undefined;return undefined;});
}
function fontCss(handwriting?:string){
 const korean=readFileSync(path.join(process.cwd(),'assets/fonts/NotoSansKR.ttf')).toString('base64');
 let katex=readFileSync(path.join(process.cwd(),'node_modules/katex/dist/katex.min.css'),'utf8');
 katex=katex.replace(/url\(([^)]+)\)/g,(_,name:string)=>{const filename=name.replace(/["']/g,'');if(!/^fonts\/KaTeX_[a-zA-Z0-9-]+\.(woff2?|ttf)$/.test(filename))return 'url()';const bytes=readFileSync(path.join(process.cwd(),'node_modules/katex/dist',filename));const ext=path.extname(filename).slice(1);return `url(data:font/${ext};base64,${bytes.toString('base64')})`;});
 return `${handwriting?`@font-face{font-family:StudyHand;src:url(data:font/woff;base64,${handwriting}) format('woff');font-weight:400}`:''}@font-face{font-family:Notebook;src:url(data:font/ttf;base64,${korean}) format('truetype');font-weight:100 900}${katex}`;
}
export function pdfHtml(title:string,body:string,handwriting?:string){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${fontCss(handwriting)}
 @page{size:A4;margin:18mm 18mm 20mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:15.5pt/1.5 StudyHand,Notebook,sans-serif;color:#293d50;margin:0;padding-left:4mm;word-break:keep-all;overflow-wrap:anywhere}.paper{position:fixed;inset:0;z-index:-1;background-color:#fffdf6;background-image:linear-gradient(90deg,transparent .3mm,#c97f7b55 .3mm,#c97f7b55 .55mm,transparent .55mm),repeating-linear-gradient(transparent 0,transparent calc(8.5mm - .2mm),#6b92a51a calc(8.5mm - .2mm),#6b92a51a 8.5mm)}h1{font-size:27pt;font-weight:400;line-height:1.3;margin:0 0 6mm;color:#355d80}h2{font-size:21pt;font-weight:400;color:#355d80;margin:4mm 0 2mm;padding-bottom:1.5mm;border-bottom:.3pt solid #8aa0ad80;break-after:avoid}h3{font-size:18pt;color:#607586;font-weight:400;break-after:avoid;margin:0 0 3mm}p{margin:0 0 3mm;orphans:3;widows:3}.meta{font-size:12pt;color:#747b80;margin-bottom:6mm}.muted{color:#747b80}.entry{margin:5mm 0}.verbatim{white-space:pre-wrap}.transcription{font:10pt/1.8 Notebook,sans-serif}.chapter+.chapter,.transcript.with-study{break-before:page}.concept{margin-top:6mm}.question-review{break-inside:avoid}.concept-reference{color:#607586}pre{font:10pt/1.6 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#e8eceb80;padding:4mm}code{font-family:monospace;font-size:.8em}table{border-collapse:collapse;width:100%;font-size:15pt;margin:4mm 0 6mm}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:0;border-bottom:.4pt solid #8ca0ac66;padding:1mm 3mm;text-align:left;vertical-align:top}th{background:#dde8e94d;font-weight:400;color:#355d80}strong{font-weight:700;color:#253f57;background:linear-gradient(transparent 57%,#f0d97466 57%,#f0d97466 89%,transparent 89%);padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone}blockquote{border-left:1.5pt solid #b96e67;margin:5mm 0;padding-left:5mm;color:#6e4947}li{margin:.7mm 0;orphans:3;widows:3}ul,ol{padding-left:6mm;margin:2mm 0 3mm}h2+ul,h2+ol{break-inside:avoid}.katex-display{margin:5mm 0}.katex{font-size:1em}.book-brand{font-size:12pt;letter-spacing:.5pt;color:#668296;margin-bottom:6mm}

 </style></head><body><div class="paper" aria-hidden="true"></div><div class="book-brand">vividparachute</div>${body}</body></html>`;}
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
 try{const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')||r.url()==='about:blank'?r.continue():r.abort());await page.setContent(html,{waitUntil:'load',timeout:60000});await page.evaluate(()=>document.fonts.ready);const out=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;padding:0 50px;color:#999;display:flex;justify-content:space-between"><span>vividparachute</span><span class="pageNumber"></span></div>',margin:{top:'18mm',right:'18mm',bottom:'20mm',left:'18mm'},timeout:60000});return out;}finally{await browser.close();}
}
async function originalPdf(db:ReaderStore,question:Question){
 if(db instanceof SnapshotReader){const file=db.snapshot.questionPdfs[question.id];if(!file)throw new Error('검색 가능한 원문 PDF를 아직 동기화하지 않았습니다.');const blob=await get(file.pathname,{access:'private'});if(!blob||blob.statusCode!==200)throw new Error('원문 PDF를 읽지 못했습니다.');return new Uint8Array(await new Response(blob.stream).arrayBuffer());}
 const {questionSourcePdf}=await import('./source-pdf');return (await questionSourcePdf(question)).bytes;
}
export async function exportPdf(db:ReaderStore,view:PdfView,id:string){
 const document=pdfBody(db,view,id),font=await handwritingFont();
 const notes=await print(pdfHtml(document.title,document.body,font));
 const result=await PDFDocument.create();
 const append=async(bytes:Uint8Array)=>{const source=await PDFDocument.load(bytes);for(const p of await result.copyPages(source,source.getPageIndices()))result.addPage(p);};
 if(document.question)await append(await originalPdf(db,document.question));
 await append(notes);
 for(const q of document.questions??[])await append(await originalPdf(db,q));
 result.setTitle(document.title);result.setAuthor('vividparachute');result.setSubject(`Current library ${db.version()}`);return Buffer.from(await result.save());
}
