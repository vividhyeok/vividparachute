import type { Concept } from './types';

// Classify the published concepts at read time; private study content stays in Blob.
const paths = [
  { id: 'reading', label: '문제 읽기', prompt: '어디서부터 읽고, 무엇을 구하지?', hint: '요구 → 조건 → 자료 → 필요한 개념', match: /기출 독해|조건 해석|작성 방법|문제 풀이/ },
  { id: 'meaning', label: '의미와 구분', prompt: '무슨 뜻이고, 어떤 용어를 써야 하지?', hint: '전체 구조 → 정의 → 비슷한 개념의 차이', match: /윤리|교육과정|저작권|정의|용어|구분/ },
  { id: 'calculation', label: '계산과 적용', prompt: '무엇을 넣어, 어떻게 계산하지?', hint: '입력값 → 계산 관계 → 결과의 의미', match: /주소지정|주소 지정|유효 주소|변위|계산|수식|확률|행렬/ },
  { id: 'process', label: '동작과 순서', prompt: '무엇이 먼저이고, 왜 그렇게 움직이지?', hint: '상태 → 값의 보존·변화 → 다음 동작', match: /호출|복귀|스택|실행|순서|동작|프로그램 카운터/ },
  { id: 'other', label: '개념의 구조', prompt: '이 개념은 전체에서 어디에 놓이지?', hint: '큰 개념 → 핵심 원리 → 필요한 세부 사항', match: /./ },
] as const;

export function conceptPaths(concepts: Concept[]) {
  const groups = paths.map(path => ({ ...path, concepts: [] as Concept[] }));
  for (const concept of concepts) {
    const text = `${concept.title} ${concept.aliases.join(' ')}`;
    const group = groups.find(path => path.match.test(text)) ?? groups[groups.length - 1];
    group.concepts.push(concept);
  }
  return groups.filter(group => group.concepts.length > 0);
}

function plain(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`_]/g, '').trim();
}

export function conceptOutline(concept: Concept) {
  const lines = concept.body.split('\n');
  const headings = lines.filter(line => /^#{1,3}\s/.test(line)).map(line => plain(line.replace(/^#+\s*/, '')));
  // Use the author's opening note, not a generated claim or a chat excerpt.
  const first = lines.find(line => line.trim() && !/^(\s*#|\s*\||\s*>|\s*[-*+]\s|\s*출처:|\s*```)/.test(line));
  return { headings, summary: first ? plain(first) : headings[0] ?? concept.title };
}
