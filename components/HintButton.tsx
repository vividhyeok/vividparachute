'use client';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { hint: string };
export default function HintButton({ hint, children, ...props }: Props) {
  const ref = useRef<HTMLButtonElement>(null), id = useId();
  const [position, setPosition] = useState<{left:number;top:number;above:boolean} | null>(null);
  function show() {
    const box = ref.current?.getBoundingClientRect();
    if (box) setPosition({left:Math.max(12,Math.min(box.left+box.width/2-130,window.innerWidth-272)),top:box.top>90?box.top-8:box.bottom+8,above:box.top>90});
  }
  useEffect(() => {
    if (!position) return;
    const hide=()=>setPosition(null), key=(e:KeyboardEvent)=>{if(e.key==='Escape')hide();};
    window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('keydown',key);
    return ()=>{window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);window.removeEventListener('keydown',key);};
  },[position]);

  return <><button {...props} ref={ref} aria-describedby={position?id:undefined} onPointerEnter={e=>{if(e.pointerType==='mouse')show();}} onPointerLeave={()=>setPosition(null)} onFocus={show} onBlur={()=>setPosition(null)}>{children}</button>{position&&createPortal(<span id={id} role="tooltip" className="hover-note" style={{left:position.left,top:position.top,transform:position.above?'translateY(-100%)':undefined}}>{hint}</span>,document.body)}</>;
}
