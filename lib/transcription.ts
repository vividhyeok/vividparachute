import type {SourceTranscription} from './types';

export const sourceFigurePattern=()=>/!\[([^\]]*)\]\(source:([\w-]+)\)/g;
export function transcriptionText(source:SourceTranscription){
 return source.body.replace(sourceFigurePattern(),(_,caption:string,id:string)=>{
  const figure=source.figures.find(f=>f.id===id);
  return `[원본 도해: ${caption}]\n[그림 설명] ${figure?.description??'원본 이미지 참조'}`;
 });
}
export function validateSourceFigures(source:SourceTranscription){
 const ids=source.figures.map(f=>f.id),references=[...source.body.matchAll(sourceFigurePattern())].map(m=>m[2]);
 if(new Set(ids).size!==ids.length||references.some(id=>!ids.includes(id))||ids.some(id=>!references.includes(id)))throw new Error('도해 참조와 원본 영역이 일치하지 않습니다.');
 for(const f of source.figures){const[x,y,w,h]=f.rect;if(x+w>f.assetWidth||y+h>f.assetHeight||f.assetIndex>=source.reviewedAssets.length)throw new Error('원본 도해 영역이 이미지 범위를 벗어납니다.');}
 if(/[\uE000-\uF8FF]/.test(source.body))throw new Error('검수 전사에 미복원 사설영역 문자가 있습니다.');
 if((source.body.match(/^```/gm)?.length??0)%2!==0)throw new Error('코드 블록이 닫히지 않았습니다.');
}
