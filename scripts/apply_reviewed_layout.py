"""Source-specific scanned-page regions checked against the 2025 page renders.

Keep OCR text unverified: region review is not proof of correct transcription.
"""
import json
import hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
target = ROOT/'overrides/layout_overrides.json'
data = json.loads(target.read_text(encoding='utf-8'))
def left(page, top=95, bottom=761): return {'page':page,'rect':[58,top,295,bottom]}
def right(page, top=95, bottom=761): return {'page':page,'rect':[301,top,536,bottom]}
regions = {
 'A': {1:[left(1,231)],2:[right(1,198)],3:[left(2)],4:[right(2,95,389)],5:[right(2,392)],6:[left(3),right(3,95,235)],7:[right(3,250)],8:[left(4),right(4)],9:[left(5)],10:[right(5)],11:[left(6),right(6)],12:[left(7),right(7,95,500)]},
 'B': {1:[left(1,231),right(1,198,290)],2:[right(1,355)],3:[left(2)],4:[right(2)],5:[left(3),right(3)],6:[left(4),right(4)],7:[left(5)],8:[right(5)],9:[left(6),right(6)],10:[left(7),right(7,95,220)],11:[right(7,273)]}
}
for section, questions in regions.items():
 for n, parts in questions.items():
  data['questions'][f'info-computer-2025-{section}-{n}']={'segments':parts, 'score':2 if n <= (4 if section=='A' else 2) else 4, 'review_note':'2026-11-23: source page render inspected; OCR transcription still needs review', 'source_sha256':hashlib.sha256((ROOT/f'data/raw/2025_{section}.pdf').read_bytes()).hexdigest()}
target.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
