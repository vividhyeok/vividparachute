'use client';
import { useEffect, useRef, useState } from 'react';

export default function PdfExport({currentAvailable,allAvailable,busy,onExport}:{currentAvailable:boolean;allAvailable:boolean;busy:boolean;onExport:(scope:'page'|'all')=>void}) {
  const [open,setOpen]=useState(false), ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
  return <div className="pdf-controls" ref={ref}>
    <button className="pdf-button" disabled={!currentAvailable||busy} onClick={()=>onExport('page')} aria-busy={busy}>{busy?'PDF 만드는 중…':'PDF 다운로드'}</button>
    <button className="pdf-options-toggle" aria-label="PDF 내보내기 옵션" aria-expanded={open} disabled={busy} onClick={()=>setOpen(!open)}><svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
    {open&&<div className="pdf-options"><button disabled={!allAvailable} onClick={()=>{setOpen(false);onExport('all');}}>전체 학습 노트 PDF</button></div>}
  </div>;
}
