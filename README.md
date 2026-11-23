# vividparachute

정보·컴퓨터 임용을 위한 개인 전과·복습 노트. 공부는 Codex에서 하고, 웹과 PDF로 다시 읽는다.

## 공부하는 방법

이 프로젝트의 새 Codex 채팅에서 `2026 A 3번 풀고 있는데 ReLU가 어디에 적용되는지 힌트만 줘`처럼 질문한다. Codex가 원문 이미지와 교정 텍스트를 확인하고 답한 뒤, 질문 원문과 개념 정리를 나누어 저장한다. 기존 전과는 중복 없이 재편집한다.

웹에는 AI 질문, 필기, 대시보드가 없다. 좌측 원문·개념 본문과 우측 학습 기록을 읽고 관련 기출·개념을 오간다. 목차·검색과 PDF 다운로드만 남겼다.

`PDF 다운로드`는 현재 저장 내용으로 만든다. 원본 문항에는 검색 가능한 OCR 텍스트층이 있고, 복습 노트와 개념 본문에는 한글·수식·표·코드를 읽기 좋게 배치한다. 내려받은 PDF에 평소 필기 앱으로 필기하면 된다.

## 실행

Node.js 24 이상.

```powershell
npm install
npm run import
npm run dev
```

로컬 주소: http://127.0.0.1:3000

클라우드 읽기 주소: https://vividparachute.vercel.app (로그인 없이 바로 읽는 서재)

## Codex 연결과 동기화

```powershell
npm run study -- context "2026 A 3번"
npm run study -- record "data/private/inbox/entry.json"
npm run sync
npm run study -- pdf "2026 A 3번" "output/pdf/2026-A-3.pdf"
```

프로젝트의 `AGENTS.md`와 사용자 스킬 `vividparachute-study`가 학습 절차를 지정한다. 입력 계약·버전 충돌·되돌리기·다른 프로젝트에서 쓰는 법은 [Codex 학습 안내](docs/CODEX_STUDY.md)를 참고한다.

로컬 SQLite가 학습 원본이다. 별도의 DB 서버는 없다. 저장 명령은 원문 발화와 개념 변경을 트랜잭션으로 보존하고 Blob 파일 저장소에 최신 스냅샷을 게시한다. 웹은 약 3초마다 버전을 확인한다. PC가 꺼져 있어도 마지막 게시본을 읽고 PDF를 내려받을 수 있다. 웹 서버가 로컬 디스크에 개인 데이터를 쓰지 않는다.

## 코드 배포

소스 저장소: https://github.com/vividhyeok/vividparachute

```powershell
npm run ship -- "변경 요약"
```

확인한 코드 변경을 main에 커밋·푸시하며 연결된 Vercel 프로젝트가 자동 배포한다. 개인 학습 기록 변경은 GitHub 커밋이나 재배포 없이 비공개 저장소로 동기화한다.

## 원문과 개인정보

실제 기출 46문항, 연결 이미지 61개. 크롭 경계는 원본 대조했고 `2026 A 3번`은 상세 교정했다. 나머지 45문항의 OCR·수식·코드·표 전사는 추가 검수가 필요하다. 검색 가능함이 전사의 완전한 정확성을 뜻하지 않는다.

- 공개 Git에는 앱 코드와 공개 라이선스 폰트만 보관한다.
- PDF·크롭·교정 전문·학습 DB·생성 PDF·`.env.local`은 Git에서 제외한다.
- 사용자가 선택한 공개 읽기 방식이다. 주소를 열면 기출과 학습 기록·개념을 로그인 없이 볼 수 있고 PDF로 내려받을 수 있다. 웹에서 내용을 수정하는 기능은 없다.
- 파일 저장소 자체는 PRIVATE Blob이며 앱 서버가 읽어 제공한다. 이는 별도의 비공개 DB 서버가 아니다. 업로드 키는 브라우저에 전달하지 않는다.
- `.env.example`은 이름 안내다. 실제 Blob 자격증명은 `.env.local`과 Vercel 서버 환경에만 둔다. 웹 AI 키는 필요 없다.
- 원본 백업: `data/raw`, `data/processed`, `data/private`, `overrides`의 개인 교정 파일. GitHub 커밋만으로 이 자료들이 백업되는 것은 아니다.

## 검증

```powershell
npm run typecheck
npm test
npm run build
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py' -v
```

[구현 기록](docs/IMPLEMENTATION.md) · [자료 검토](docs/REVIEW_LOG.md)
