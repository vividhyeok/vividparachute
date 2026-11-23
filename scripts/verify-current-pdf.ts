import {Store,readCorpus} from '../lib/store';
import {StudyEntrySchema} from '../lib/types';
import {exportPdf} from '../lib/pdf';
import {writeFileSync,mkdirSync} from 'node:fs';
async function main(){
 const db=new Store(':memory:');db.importQuestions(readCorpus());
 const input=StudyEntrySchema.parse({entryId:'pdf-isolated-entry-1',questionId:'info-computer-2026-A-3',question:'[검증용] 합산과 활성화는 어떻게 다른가?',answer:'[검증용] 합산 결과에 문제에서 지정한 활성화 함수를 적용합니다.',source:'isolated PDF verification',concepts:[{slug:'activation',title:'활성화 함수',aliases:[],body:'## 핵심\n퍼셉트론은 먼저 가중치 합을 구하고 활성화 함수를 적용한다.\n\n$$z=w_1x_1+w_2x_2+b,\\qquad y=f(z)$$\n\n| 구분 | 역할 |\n|---|---|\n| 합산 | 입력에 가중치를 곱해 더함 |\n| 활성화 | 합산 결과를 출력으로 변환 |\n\n```python\nz = w1*x1 + w2*x2 + b\ny = f(z)\n```',context:'퍼셉트론 원문을 보고 합산과 활성화를 구분한다.',expectedVersion:0}],reflections:[{type:'memo',content:'[검증용] 이 파일은 격리된 DB의 확인용 자료입니다.'}]});
 db.recordStudy(input);const c=db.concepts()[0];db.recordStudy({...input,entryId:'pdf-isolated-entry-2',question:'[검증용] 정리를 보강해 줘.',concepts:[{...input.concepts[0],expectedVersion:c.version,body:input.concepts[0].body+'\n\n## 새로 반영된 내용\n최신 본문 반영을 확인했습니다.'}],reflections:[]});
 mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/verification-current.pdf',await exportPdf(db,'question',input.questionId!));writeFileSync('output/pdf/verification-concept.pdf',await exportPdf(db,'book',c.id));db.db.close();console.log('Created isolated PDF verification artifacts. Actual library unchanged.');
}main().catch(e=>{console.error(e);process.exitCode=1;});
