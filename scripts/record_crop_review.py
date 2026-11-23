"""Record the source/crop boundary review done on the 4 page and crop sheets.

Does not approve OCR or infer conceptual meanings for unreviewed questions.
"""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'overrides/layout_overrides.json'
data=json.loads(target.read_text(encoding='utf-8'))
for line in (ROOT/'data/processed/corpus.jsonl').read_text(encoding='utf-8').splitlines():
 q=json.loads(line)
 if q['exam']['academic_year'] != 2026: continue
 segments=[{'page':a['page'],'rect':a['region']} for a in q['assets']]
 if q['id']=='info-computer-2026-A-12': segments[-1]['rect'][3]=765
 if q['id']=='info-computer-2026-B-11': segments[-1]['rect'][3]=855
 data['questions'][q['id']]={'segments':segments,'review_note':'2026-11-23: source page / crop contact sheets compared; includes leading and full-column continuations. Text verification is separate.', 'source_sha256':q['source']['sha256']}
target.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
