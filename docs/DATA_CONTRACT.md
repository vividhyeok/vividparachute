# 데이터 계약 — 기출 원문과 개인 동적 전과

> vividparachute 로컬 구현은 `docs/IMPLEMENTATION.md`를 따른다. 원본 문항 계약은 유지하고, 초기 개발에서는 소유자가 한 명인 SQLite를 두 화면이 공유한다. 클라우드 인증은 아직 연결하지 않았다. `review.crop_status`(이미지 경계 대조), `review.text_status`(전사 검수), `analysis.status`(그림·의미 구조)를 분리한다. `verified_text`가 있어도 원 추출 `raw_text`를 보존한다.

## 핵심 원칙: 원본 / 추출 / 해석 / 개인 학습 이력을 분리

| 레이어 | 무엇을 보관하나 | 교정/갱신 원칙 |
|---|---|---|
| 원본 증거 | PDF, 문항 크롭, 페이지·bbox, SHA-256 | 불변, source provenance 필수 |
| 추출 결과 | raw_text, 수식·표·코드 텍스트, 블록 및 시각 요소 설명 | 가변, 교정 이력 남김 |
| 객관적 개념 설명 | 개념 정의·작동 원리·예시·오개념 | 기존 노트 검색 후 병합·수정, 근거 표시 |
| 개인 학습 이력 | 사용자 질문, 고민, 오답, 이해 수준, 나만의 메모 | 사건으로 저장, 사용자 말과 AI 추론 구분 |
| 동적 전과 본문 | 개념별로 읽기 좋게 통합된 요약 | canonical concepts를 바탕으로 파생·갱신, 과잉 중복 금지 |

## 문항 ID

`info-computer-{academic_year}-{section}-{number}`

예: `info-computer-2026-A-3`. 시험에 따라 이름·학년도·형식은 반드시 명시하고, 번호만으로 검색했을 때 모호하면 A/B를 좁히도록 안내한다.

## 최소 문항 JSON

`schemas/question.schema.json` 참고. `data/processed/YYYY_A/qNN/question.json`에 생성되는 JSON은 **기계 추출 초안**이다. AI가 별도 이미지 의미 분석을 수행하면 `analysis.sections`, `analysis.visuals`, `analysis.concept_tags`를 채운다. 단, 원문 이미지를 통해 확인되지 않은 해석은 `inferred`로 표기하며 실체나 계산값을 만들어내지 않는다.

### 이미지·표·코드 semantic annotation 예시(스키마 형태 예시, 실제 기출 아님)

```json
{
  "type": "diagram",
  "asset_path": "2026_A/q03/part01_p02.png",
  "description": "도식의 노드, 화살표, 입력·출력 라벨을 원본대로 전사",
  "semantic_role": "문항 풀이에서 참조해야 하는 제공 조건",
  "confidence": "inferred"
}
```

위 텍스트는 **입력할 필드 설명**이지 실제 기출 분석 결과가 아니다.

## 데이터베이스 최소 엔터티

```text
exam_documents(id, year, subject, section, source_url, pdf_path, sha256)
questions(id, exam_id, number, score, raw_text, verified_text, ingestion_status)
question_assets(id, question_id, page, bbox, image_path, asset_type)
question_blocks(id, question_id, type, content, asset_id, confidence, provenance)
concepts(id, slug, title, canonical_body, last_revised_at)
concept_relations(from_id, to_id, relation_type)
question_concepts(question_id, concept_id, relation_note)
study_sessions(id, user_id, question_id?, opened_at)
messages(id, session_id, role, text, created_at)
question_reflections(id, question_id, user_id, note_type, content, message_id?, created_at)
concept_learning(id, concept_id, user_id, status, last_reviewed_at)
knowledge_revisions(id, concept_id, source_message_id?, before, after, action, created_at)
```

모든 개인 데이터는 사용자별 권한을 검사한다. DB RLS를 쓰면 `auth.uid()=user_id` 등 **소유자 조건**을 반드시 사용한다. `service_role`은 웹 클라이언트에 노출하지 않는다.

## AI에게 문항 전달하기

1. 사용자의 입력 `2026 A 3번` → 정확한 질문 ID를 조회한다.
2. 최신 verified_text/raw_text와 문항에 연결된 이미지들(다중 페이지일 수 있음)을 로드한다.
3. 멀티모달 모델의 서버 API에 사용자 질문과 **이미지 바이트/모델이 접근 가능한 서명 URL**을 함께 넣는다.
4. 그림이 들어 있는데 모델로 이미지가 전달되지 않았다면 사용자에게 *이미지를 보지 못했다*고 표시한다. OCR 텍스트만으로 도형을 아는 척하지 않는다.
5. 정답 공개 모드가 아닐 때는 힌트 중심으로 대답한다.
6. 설명 후 대화의 **재학습 가치가 있는 핵심 지식만** 추출한다.
7. canonical concept를 검색하고 중복 제거·차이 병합 후 개념 수정 이력을 남긴다.
8. 이 질문이 발생한 문제에 사고·오답·궁금증을 연결한다.

## 동적 전과의 두 개 UI

### 전과 화면 (개념 중심)
- 책처럼 읽는 본문(개념의 핵심 → 메커니즘 → 혼동 포인트 → 짧은 예시).
- 가독성 좋은 본문, 긴 글 과다 생성 금지, 사용자의 이해 수준에 맞는 요약.
- 우측에 `관련 기출`, `나의 메모`, `헷갈렸던 부분` 패널.
- 원문 전체는 읽기 화면에 상시 넣지 않고 링크로 문제 뷰 이동.
- 사용자의 학습 질문이 생기면 기존 본문을 더 정확하고 간결하게 갱신.

### 문제 화면 (문항 중심)
- 본문: 원문 PDF 문항 크롭 (텍스트/이미지를 분리 제공 가능).
- 우측: 해당 문제로부터 나온 질문, 사고 과정, 틀린 이유, 개념 링크.
- 문제 풀이 중 답을 자동 노출하지 않는다.
- 문제에 대한 대화는 선택된 question_id에 정확히 연결.

## Import 단계 품질 통과 기준

- 2025 A 12건, B 11건 / 2026 A 12건, B 11건; 46건 모두 실제 원본 대응.
- 원본 PDF의 페이지 및 문항 crop에 누락이 없어야 함.
- 특히 같은 페이지 좌/우 2단 편집으로 다른 문항이 섞이지 않아야 함.
- 수식·코드·표·그림은 가능하면 원문 이미지 함께 저장.
- 모든 문제가 나누어졌다는 *개수*뿐 아니라 원본 대조 검수가 통과해야 함.
- 불확실한 항목은 review_required=true, status=needs_review를 유지.

## 원본 파일 유통

기출 PDF는 개인 사용용으로 비공개 보관하고 공개 GitHub 저장소에서 배제한다.
