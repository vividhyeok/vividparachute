import { getReaderStore } from '@/lib/reader-store';
import { requireReader } from '@/lib/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  requireReader(req);const db=await getReaderStore(),p=new URL(req.url).searchParams,version=db.version();
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if(p.has('version'))return json({version});
  if(p.get('question')){const q=db.question(p.get('question')!);if(!q)return json({error:'문항이 없습니다.'},404);return json({version,question:q,messages:db.messages(q.id),reflections:db.reflections(q.id)});}
  if(p.get('concept')){const c=db.concept(p.get('concept')!);if(!c)return json({error:'개념이 없습니다.'},404);const linked=db.links().filter(l=>l.concept_id===c.id).map(l=>l.question_id);return json({version,concept:c,messages:db.conceptMessages(c.id),reflections:[...db.reflections(undefined,c.id),...linked.flatMap(q=>db.reflections(q).filter(r=>r.type!=='question'))]});}
  if(p.get('export')==='json')return new Response(JSON.stringify(db.export(),null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="vividparachute-backup.json"','Cache-Control':'no-store'}});
  return json({version,questions:db.questions().map(q=>({id:q.id,exam:q.exam,question_number:q.question_number,score:q.score,analysis:q.analysis,review:q.review,preview:(q.verified_text??q.raw_text).slice(0,180),search_text:q.verified_text??q.raw_text,asset_count:q.assets.length})),concepts:db.concepts(),links:db.links()});
 }catch(e){console.error('Reader load failed:',e instanceof Error?e.message:'unknown');return Response.json({error:e instanceof Error?e.message:'조회 실패'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
