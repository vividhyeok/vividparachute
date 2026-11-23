export function localOnly(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
    throw new Error("현재 버전은 이 컴퓨터에서만 사용할 수 있습니다.");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host)
    throw new Error("외부 사이트의 접근을 허용하지 않습니다.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("외부 사이트의 접근을 허용하지 않습니다.");
}

export function requireReader(request:Request) {
  if(process.env.VERCEL==='1') {
    if(process.env.VP_PUBLIC_READER!=='true')throw new Error('서재의 공개 읽기 설정을 확인해 주세요.');
    const origin=request.headers.get('origin');
    if(origin&&new URL(origin).host!==new URL(request.url).host)throw new Error('외부 사이트의 접근을 허용하지 않습니다.');
    if(request.headers.get('sec-fetch-site')==='cross-site')throw new Error('외부 사이트의 접근을 허용하지 않습니다.');
    return;
  }
  localOnly(request);
}
