'use client';
import { useEffect,useRef,useState,useCallback } from 'react';
import type {Library,Question,Concept,Message,Reflection} from '@/lib/types';
import {questionLabel} from '@/lib/search';
import Markdown from './Markdown';
import ConceptMap from './ConceptMap';
import QuestionIndex from './QuestionIndex';
import PdfExport from './PdfExport';
import HintButton from './HintButton';
import SourceTranscription from './SourceTranscription';
type View={mode:'book'|'question';id:string};
type Detail={version:string;question?:Question;concept?:Concept;messages:Message[];reflections:Reflection[]};
const labels:Record<Reflection['type'],string>={question:'질문',thought:'나의 생각',confusion:'궁금했던 부분',mistake:'오답 기록',review:'복습',memo:'메모'};
async function read<T>(url:string){const r=await fetch(url,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'서재를 불러오지 못했습니다.');return d as T;}
function locationView():View{const p=new URLSearchParams(location.hash.slice(1));return {mode:p.get('view')==='question'?'question':'book',id:p.get('id')||''};}
function Mark(){return <svg width="27" height="29" viewBox="0 0 36 36" aria-hidden="true"><path d="M4 17a14 14 0 0 1 28 0c-3-3-6-3-9 0-3-3-7-3-10 0-3-3-6-3-9 0Zm1 1 12 12m14-12L19 30M13 18l4 12m6-12-4 12m-2 0h2" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;}
export default function Reader(){
 const [library,setLibrary]=useState<Library>(),[view,setView]=useState<View>({mode:'book',id:''}),[detail,setDetail]=useState<Detail>();
 const [query,setQuery]=useState(''),[listOpen,setListOpen]=useState(false),[error,setError]=useState(''),[pdfBusy,setPdfBusy]=useState(false),[synced,setSynced]=useState(false);
 const [visited,setVisited]=useState<Record<string,string>>({});
 const visitCache=useRef<Record<string,string>>({});
 const current=useRef(view),version=useRef(''),request=useRef(0),search=useRef<HTMLInputElement>(null),main=useRef<HTMLElement>(null);current.current=view;
 const refresh=useCallback(async(v:View)=>{const n=++request.current;const [lib,d]=await Promise.all([read<Library>('/api/study'),v.id?read<Detail>(`/api/study?${v.mode==='question'?'question':'concept'}=${encodeURIComponent(v.id)}`):Promise.resolve(undefined)]);if(n!==request.current)return;if(d&&d.version!==lib.version)return;setLibrary(lib);setDetail(d);version.current=lib.version;setError('');},[]);
 useEffect(()=>{const change=()=>{const v=locationView();setView(v);setDetail(undefined);main.current?.scrollTo({top:0});};change();addEventListener('hashchange',change);const key=(e:KeyboardEvent)=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)){e.preventDefault();setListOpen(true);search.current?.focus();}if(e.key==='Escape')setListOpen(false);};addEventListener('keydown',key);return()=>{removeEventListener('hashchange',change);removeEventListener('keydown',key);};},[]);
 useEffect(()=>{refresh(view).catch(e=>setError(e.message));},[view,refresh]);
 useEffect(()=>{let working=false,cancelled=false;const poll=async()=>{if(document.hidden||working)return;working=true;try{const r=await read<{version:string}>('/api/study?version=1');if(!cancelled&&r.version!==version.current){await refresh(current.current);if(!cancelled)setSynced(true);}}catch{/* Keep the readable page during temporary offline periods. */}finally{working=false;}};const timer=setInterval(poll,3000);addEventListener('focus',poll);return()=>{cancelled=true;clearInterval(timer);removeEventListener('focus',poll);};},[refresh]);
 useEffect(()=>{if(!synced)return;const t=setTimeout(()=>setSynced(false),3000);return()=>clearTimeout(t);},[synced]);
 function go(mode:View['mode'],id=''){location.hash=new URLSearchParams({view:mode,...(id?{id}:{})}).toString();setListOpen(false);setQuery('');}
 async function download(scope:'page'|'all'='page'){setPdfBusy(true);setError('');try{const r=await fetch(scope==='all'?'/api/pdf?view=all':`/api/pdf?view=${view.mode}&id=${encodeURIComponent(view.id)}`,{cache:'no-store'});if(!r.ok){const d=await r.json();throw new Error(d.error||'PDF를 만들지 못했습니다.');}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=scope==='all'?'vividparachute-study-notes.pdf':view.mode==='question'?`${view.id}.pdf`:`vividparachute-${detail?.concept?.title||'전과'}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setError(e instanceof Error?e.message:'PDF 생성 실패');}finally{setPdfBusy(false);}}
 const q=detail?.question,c=detail?.concept;
 useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem('vividparachute:visited:v1')||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored)){const valid=Object.fromEntries(Object.entries(stored).filter(([id,date])=>/^info-computer-\d{4}-[AB]-\d{1,2}$/.test(id)&&typeof date==='string')) as Record<string,string>;visitCache.current=valid;setVisited(valid);}}catch{/* Reading works when browser storage is unavailable. */}},[]);
 useEffect(()=>{if(!q?.id)return;const next={...visitCache.current,[q.id]:new Date().toISOString()};visitCache.current=next;setVisited(next);try{localStorage.setItem('vividparachute:visited:v1',JSON.stringify(next));}catch{/* Keep the visit in memory. */}},[q?.id]);
 const exact=query.match(/^\s*(20\d{2})\s*(?:학년도|년)?\s*(?:전공\s*)?([ab])\s*(?:형)?\s*(\d{1,2})\s*번?\s*$/i);
 const qs=library?.questions.filter(q=>exact?q.id===`info-computer-${exact[1]}-${exact[2].toUpperCase()}-${Number(exact[3])}`:`${questionLabel(q)} ${q.search_text}`.toLowerCase().includes(query.toLowerCase()))||[];
 const cs=library?.concepts.filter(c=>`${c.title} ${c.aliases.join(' ')} ${c.body}`.toLowerCase().includes(query.toLowerCase()))||[];
 const links=library?.links.filter(l=>view.mode==='question'?l.question_id===view.id:l.concept_id===view.id)||[];
 const explanations=links.flatMap(l=>{const concept=library?.concepts.find(c=>c.id===l.concept_id);return concept?[concept]:[];});
 const notes=(detail?.reflections||[]).filter(n=>n.type!=='question');
 const canPdf=view.mode==='question'?!!q:!!c||!!library?.concepts.length;
 return <div className="reader-app">
  <header className="header"><button className="brand" onClick={()=>go('book')}><Mark/><span>vivid<span>parachute</span></span></button><nav aria-label="읽기 화면"><button className={view.mode==='book'?'active':''} onClick={()=>go('book')}>개념 전과</button><button className={view.mode==='question'?'active':''} onClick={()=>go('question')}>기출·복습</button></nav><div className="header-actions"><button className="index-toggle" aria-expanded={listOpen} onClick={()=>setListOpen(!listOpen)}>한눈에·검색</button><PdfExport currentAvailable={!!canPdf} allAvailable={!!library&&(!!library.concepts.length||Object.keys(library.questionStudy||{}).length>0)} busy={pdfBusy} onExport={download}/></div></header>
  {listOpen&&<section className="index-panel" aria-label="개념 한눈에와 검색"><div className="index-search"><input ref={search} aria-label="문항·개념 검색" autoFocus placeholder="2026 A 3번, 퍼셉트론…" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="목차 닫기" onClick={()=>setListOpen(false)}>닫기</button></div><div className="index-columns"><section><h2>개념 한눈에</h2><ConceptMap concepts={cs} compact currentId={c?.id} onSelect={id=>go('book',id)}/>{!cs.length&&<p>{query?'일치하는 개념이 없습니다.':'아직 정리된 개념이 없습니다.'}</p>}</section><section><h2>기출·복습</h2><QuestionIndex questions={qs} study={library?.questionStudy||{}} visited={visited} compact currentId={q?.id} onSelect={id=>go('question',id)}/></section></div></section>}
  {error&&<div role="alert" className="error-bar">{error}<button onClick={()=>setError('')}>닫기</button></div>}
  <div className="page-line"><span>{q?`${q.exam.academic_year}학년도 / 전공 ${q.exam.section} / ${q.question_number}번`:c?`개념 전과 / ${c.title}`:view.mode==='question'?'기출·복습 / 전체 문항':'나의 전과'}</span><span className="sync-status" aria-live="polite">{synced?'새 정리를 반영했습니다.':''}</span></div>
  <div className={`reading-layout${!view.id?' overview-layout':''}`}><main ref={main} className="main-page">
   {!view.id&&view.mode==='book'&&<article className="library-page overview-page"><span className="eyebrow">나의 개념 지도</span><h1>막힌 곳에서, 다시 한눈에</h1>{!library?<p className="loading">불러오는 중…</p>:library.concepts.length?<ConceptMap concepts={library.concepts} onSelect={id=>go('book',id)}/>:<p className="muted">공부하며 정리한 개념이 여기에 연결됩니다.</p>}</article>}

   {!view.id&&view.mode==='question'&&<article className="library-page question-overview"><span className="eyebrow">기출 목차</span><h1>기출·복습</h1>{library?<QuestionIndex questions={library.questions} study={library.questionStudy||{}} visited={visited} onSelect={id=>go('question',id)}/>:<p className="loading">불러오는 중…</p>}</article>}
   {view.id&&!detail&&!error&&<p className="loading">불러오는 중…</p>}
   {c&&<article className="concept-page"><span className="eyebrow">개념 전과</span><h1>{c.title}</h1><p className="revision-date">{new Date(c.updated_at).toLocaleDateString('ko-KR')} 정리</p><Markdown>{c.body||'아직 본문이 없습니다.'}</Markdown></article>}
   {q&&<article className="question-page"><button className="back-to-questions" onClick={()=>go('question')}>← 기출 전체 보기</button><div className="question-heading"><h1>{questionLabel(q)}</h1><span>{q.score?`${q.score}점`:''}</span></div><p className="source-line">기출 원본 · PDF {q.source.pdf_pages.join(', ')}쪽{q.review.required&&<> · <HintButton className="source-info" hint="원본 이미지가 기준입니다. OCR·수식·코드 전사는 추가 검수가 필요합니다." aria-label="원문 전사 검수 안내">ⓘ</HintButton></>}</p>{q.assets.map((a,i)=><figure key={a.path}><a href={`/api/assets/${q.id}/${i}`} target="_blank" rel="noopener noreferrer" title="원본 크기로 열기"><img src={`/api/assets/${q.id}/${i}`} alt={`${questionLabel(q)} 원본 ${i+1} · PDF ${a.page}쪽`}/></a>{q.assets.length>1&&<figcaption>이어지는 원문 {i+1}</figcaption>}</figure>)}<details className="transcription"><summary>{q.transcription?'검수 전사 보기':'원문 텍스트 보기 · 미검수'}</summary><SourceTranscription question={q}/></details></article>}
  </main>{view.id&&<aside className="margin-page" aria-label="학습 기록과 관련 개념"><h2>{view.mode==='question'?'복습 노트':'개념 길잡이'}</h2>
   {view.mode==='book'&&library&&<ConceptMap concepts={library.concepts} compact currentId={c?.id} onSelect={id=>go('book',id)}/>}
   {view.mode==='book'&&!!links.length&&<section className="related"><h3>관련 기출</h3>{links.map(l=>{const q=library?.questions.find(q=>q.id===l.question_id);return q&&<HintButton hint={l.context} key={q.id} onClick={()=>go('question',q.id)}><strong>{questionLabel(q)}</strong></HintButton>;})}</section>}
   {view.mode==='question'&&explanations.map(concept=><article className="study-entry assistant" key={concept.id}><Markdown>{concept.body}</Markdown></article>)}
   {view.mode==='question'&&!!links.length&&<section className="related"><h3>관련 개념</h3>{links.map(l=>{const c=library?.concepts.find(c=>c.id===l.concept_id);return c&&<HintButton hint={l.context} key={c.id} onClick={()=>go('book',c.id)}><strong>{c.title}</strong></HintButton>;})}</section>}
   {!!notes.length&&<section className="personal-notes"><h3>남겨 둔 기록</h3>{notes.map(n=><article className="personal-note" key={n.id}><span className="entry-label">{labels[n.type]}</span><p>{n.content}</p></article>)}</section>}
   {view.mode==='question'&&!explanations.length&&!notes.length&&<p className="margin-empty">{view.mode==='question'?'아직 작성된 설명이 없습니다.':'관련 기출을 함께 읽으며 복습할 수 있습니다.'}</p>}
  </aside>}</div>
 </div>;
}
