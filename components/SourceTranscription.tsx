import type {Question} from '@/lib/types';
import {sourceFigurePattern} from '@/lib/transcription';
import Markdown from './Markdown';

export default function SourceTranscription({question}:{question:Question}){
 const source=question.transcription;
 if(!source)return <pre>{question.verified_text??question.raw_text}</pre>;
 const parts:React.ReactNode[]=[];let cursor=0;
 for(const match of source.body.matchAll(sourceFigurePattern())){
  parts.push(<Markdown key={`text-${cursor}`}>{source.body.slice(cursor,match.index)}</Markdown>);
  const figure=source.figures.find(f=>f.id===match[2]);
  if(figure&&question.assets[figure.assetIndex])parts.push(<figure key={figure.id} className="source-figure"><svg viewBox={figure.rect.join(' ')} role="img" aria-label={match[1]}><title>{match[1]}</title><image href={`/api/assets/${question.id}/${figure.assetIndex}`} width={figure.assetWidth} height={figure.assetHeight}/></svg><figcaption><span>그림 설명</span> {figure.description}</figcaption></figure>);
  cursor=match.index!+match[0].length;
 }
 parts.push(<Markdown key={`text-${cursor}`}>{source.body.slice(cursor)}</Markdown>);
 return <div className="source-transcription">{parts}</div>;
}
