"""Searchable original question PDF. Input: question JSON on stdin; output: PDF bytes.

Only local Codex preparation runs OCR. Cloud readers use the already OCR'd PDF.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import fitz

ROOT=Path(__file__).resolve().parents[1]
if not os.environ.get('TESSDATA_PREFIX') and (ROOT/'.venv/tessdata/kor.traineddata').exists():
    os.environ['TESSDATA_PREFIX']=str(ROOT/'.venv/tessdata')

def build(q):
    result=fitz.open()
    for i,a in enumerate(q['assets']):
        image=(ROOT/'data/processed'/a['path']).resolve()
        base=(ROOT/'data/processed').resolve()
        if not image.is_relative_to(base): raise ValueError('Invalid image path')
        raw=image.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
        cache=ROOT/'data/private/pdf-ocr'/f'{digest}.pdf'
        cache.parent.mkdir(parents=True,exist_ok=True)
        if not cache.exists():
            pix=fitz.Pixmap(raw)
            if pix.alpha: pix=fitz.Pixmap(pix,0)
            if pix.colorspace.n!=3:pix=fitz.Pixmap(fitz.csRGB,pix)
            data=pix.pdfocr_tobytes(language='kor+eng',tessdata=os.environ.get('TESSDATA_PREFIX'))
            check=fitz.open(stream=data,filetype='pdf')
            if not check[0].get_text().strip():raise ValueError('OCR text layer is missing')
            cache.write_bytes(data)
        source=fitz.open(cache)
        p=result.new_page(width=595.276,height=841.89)
        title=f"{q['exam']['academic_year']}  {q['exam']['section']}  |  Question {q['question_number']:02d}"
        p.insert_text((40,34),title,fontsize=12,color=(.28,.25,.4))
        p.show_pdf_page(fitz.Rect(35,54,560,792),source,0,keep_proportion=True)
        p.insert_text((40,817),f"vividparachute  |  Source PDF page {a['page']}  |  Original {i+1}/{len(q['assets'])}",fontsize=8,color=(.48,.48,.5))
        source.close()
    result.set_metadata({'title':f"{q['exam']['academic_year']} {q['exam']['section']} {q['question_number']} - original OCR",'author':'vividparachute'})
    return result.tobytes(garbage=4,deflate=True)

if __name__=='__main__':
    q=json.load(sys.stdin)
    sys.stdout.buffer.write(build(q))
