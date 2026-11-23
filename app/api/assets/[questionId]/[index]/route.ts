import { safeAssetPath } from "@/lib/store";
import { getReaderStore,SnapshotReader } from '@/lib/reader-store';
import {get} from '@vercel/blob';
import { requireReader } from "@/lib/security";
import { readFileSync } from "node:fs";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  context: { params: Promise<{ questionId: string; index: string }> },
) {
  try {
    requireReader(req);
    const { questionId, index } = await context.params;
    if (!/^\d+$/.test(index)) throw new Error("잘못된 이미지 번호");
    const db=await getReaderStore();
    const q = db.question(questionId);
    const asset = q?.assets[Number(index)];
    if (!asset) return new Response("이미지가 없습니다.", { status: 404 });
    if(db instanceof SnapshotReader){const file=db.snapshot.assets[asset.path];if(!file)return new Response('이미지가 없습니다.',{status:404});const result=await get(file.pathname,{access:'private'});if(!result||result.statusCode!==200)return new Response('이미지를 읽지 못했습니다.',{status:404});return new Response(result.stream,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});}
    return new Response(readFileSync(safeAssetPath(asset.path)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response("이미지에 접근할 수 없습니다.", { status: 403 });
  }
}
