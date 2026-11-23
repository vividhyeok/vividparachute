"""Render private contact sheets and validate source provenance (never auto-approve OCR)."""
import json
from pathlib import Path
import fitz
from PIL import Image, ImageDraw
from jsonschema import validate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp' / 'pdfs'
OUT.mkdir(parents=True, exist_ok=True)
schema = json.loads((ROOT/'schemas/question.schema.json').read_text(encoding='utf-8'))
for pdf in (ROOT/'data/raw').glob('*.pdf'):
    doc = fitz.open(pdf)
    sheet = Image.new('RGB', (1684, 1191 * 4), 'white')
    for n, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(842/page.rect.width, 842/page.rect.width))
        image = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        sheet.paste(image, ((n%2)*842, (n//2)*1191))
    sheet.save(OUT/f'{pdf.stem}_pages.png')
    qs = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT/'data/processed'/pdf.stem).glob('q*/question.json'))]
    thumbs = Image.new('RGB', (1600, 1000*((len(qs)+3)//4)), '#e5e7eb')
    draw = ImageDraw.Draw(thumbs)
    for n,q in enumerate(qs):
        validate(q, schema)
        x,y=(n%4)*400,(n//4)*1000
        draw.text((x+12,y+8),f"{pdf.stem} Q{q['question_number']} pages={q['source']['pdf_pages']}",fill='black')
        cursor=y+30
        for a in q['assets']:
            im=Image.open(ROOT/'data/processed'/a['path']); im.thumbnail((390,940//max(1,len(q['assets']))))
            thumbs.paste(im,(x,cursor)); cursor+=im.height+8
    thumbs.save(OUT/f'{pdf.stem}_questions.png')
    print(pdf.stem, len(qs), 'schema-valid records', sum(bool(q['assets']) for q in qs), 'with images')
