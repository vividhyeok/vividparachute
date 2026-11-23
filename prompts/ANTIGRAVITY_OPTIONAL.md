# Antigravity 선택 작업 — Codex에 맡겨도 되는 작업

Codex에서 PDF 처리까지 모두 해결된다면 Antigravity를 따로 사용할 필요는 없다.

만약 PDF 다운로드·Tesseract 설치·PDF 크롭/코드·표 OCR 등으로 Codex 작업이 막히는 경우, **같은 폴더**에서만 이 프롬프트를 실행하라.

`README.md`, `docs/DATA_CONTRACT.md`, `data/sources.json`, `scripts/ingest_pdfs.py`를 읽고 현재 사용자의 Windows 환경에서 PDF 4개를 확보·입력하도록 도와라. 링크가 직접 다운로드되지 않으면 브라우저에서 실제 첨부파일을 확인하고, 허용된 권한 범위 안에서 다운로드하라. 없는 자료를 있는 척하지 마라.

환경설정 반복작업, OCR엔진·kor/eng 데이터 설치, 스캔 PDF 보완 처리, PDF 2단 문항 크롭 정리, 46문항 검수까지 담당한다.

원본 PDF와 개인 학습 DB를 변경하거나 삭제하지 않는다. 실기출 검수 결과와 실패 이유를 `data/processed/processing_report.json`에 보고한다.

문제 재생성·해설·변형문항 자동 생성은 하지 않는다.
