import {getReaderStore} from '@/lib/reader-store';
import {requireReader} from '@/lib/security';
import {exportPdf} from '@/lib/pdf';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
export async function GET(req:Request){try{requireReader(req);const p=new URL(req.url).searchParams,view=p.get('view');if(view!=='book'&&view!=='question'&&view!=='all')return Response.json({error:'올바른 페이지를 선택해 주세요.'},{status:400});const bytes=await exportPdf(await getReaderStore(),view,p.get('id')||'');return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="vividparachute-${view}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){console.error('PDF export failed:',e instanceof Error?e.message:'unknown');return Response.json({error:e instanceof Error?e.message:'PDF 생성 실패'},{status:503});}}
