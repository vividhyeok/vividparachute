"""Conservative two-column PDF cutter for information-computer teacher exams.

It makes *draft* question assets and OCR/text transcriptions, never claims the
separation or transcription is verified. Human/vision review is required.
"""
import argparse
import csv
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import sys
import os
import subprocess

import fitz

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get('TESSDATA_PREFIX') and (ROOT / '.venv/tessdata/kor.traineddata').exists():
    os.environ['TESSDATA_PREFIX'] = str(ROOT / '.venv/tessdata')
SOURCES = json.loads((ROOT / "data" / "sources.json").read_text(encoding="utf-8"))
QUESTION_RE = re.compile(r"^\s*(\d{1,2})\s*[.．]\s*(?=\S)")
SCORE_RE = re.compile(r"\[\s*(\d+)\s*점\s*\]")


def lines_on_page(page):
    txt = page.get_text("dict")
    lines = []
    for block in txt["blocks"]:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            s = "".join(span["text"] for span in line["spans"]).strip()
            if s:
                lines.append({"text": s, "rect": tuple(line["bbox"])})
    # OCR fallback only if PDF has no embedded page text; explicitly mark fallback
    ocr_used = False
    if not lines:
        try:
            # Cache expensive OCR per immutable page raster, not per filename.
            cache_dir = ROOT / 'tmp' / 'ocr'
            cache_dir.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256(page.get_pixmap(matrix=fitz.Matrix(.5,.5)).samples).hexdigest()
            cache = cache_dir / (digest + '.json')
            if cache.exists():
                return json.loads(cache.read_text(encoding='utf-8')), True
            tp = page.get_textpage_ocr(language="kor+eng", dpi=300, full=True)
            txt = page.get_text("dict", textpage=tp)
            for block in txt["blocks"]:
                for line in block.get("lines", []):
                    s = "".join(span["text"] for span in line["spans"]).strip()
                    if s:
                        lines.append({"text": s, "rect": tuple(line["bbox"])})
            ocr_used = True
            cache.write_text(json.dumps(lines, ensure_ascii=False), encoding='utf-8')
        except Exception:
            pass
    return lines, ocr_used


def column_of(rect, width):
    # page is typically laid out in two side-by-side columns.
    x0 = rect[0]
    return 0 if x0 < width / 2 else 1


def detect_headings(lines, width, page_height):
    found = []
    for line in lines:
        x0, y0, x1, y1 = line["rect"]
        if y0 < page_height * .10 or y0 > page_height * .90:
            continue
        m = QUESTION_RE.match(line["text"])
        if not m:
            continue
        n = int(m.group(1))
        if n < 1 or n > 12:
            continue
        col = column_of(line["rect"], width)
        # A question number is a body-left column anchor, not a number within code/table.
        # These exam PDFs use asymmetric column margins. Right headings are
        # only ~1.3% beyond the middle; nested numbered lists are indented.
        anchor = width * (.1044 if col == 0 else .5134)
        if abs(x0 - anchor) > width * .009:
            continue
        found.append({"n": n, "y": y0, "col": col, "line": line["text"]})
    found.sort(key=lambda h: (h["col"], h["y"]))
    return found


def lines_in_area(lines, rect, col, width):
    a, b, c, d = rect
    chosen = []
    for line in lines:
        x0, y0, x1, y1 = line["rect"]
        if column_of(line["rect"], width) != col:
            continue
        midy = (y0 + y1) / 2
        if b <= midy < d and y0 < d:
            chosen.append(line)
    chosen.sort(key=lambda line: (round(line["rect"][1] / 2), line["rect"][0]))
    return [l["text"] for l in chosen]


def page_segments(page, lines):
    width, height = page.rect.width, page.rect.height
    heads = detect_headings(lines, width, height)
    result = []
    for col in (0, 1):
        h = [it for it in heads if it["col"] == col]
        x0 = 30 if col == 0 else width / 2 + 4
        x1 = width / 2 - 4 if col == 0 else width - 25
        for i, head in enumerate(h):
            y0 = max(40, head["y"] - 5)
            y1 = h[i+1]["y"] - 7 if i+1 < len(h) else height * .904
            if y1 <= y0 + 8:
                continue
            area = [x0, y0, x1, y1]
            result.append({"n": head["n"], "col": col, "rect": area,
                           "text": "\n".join(lines_in_area(lines, area, col, width))})
    return result, heads


def make_asset(page, rect, output):
    clip = fitz.Rect(*rect) & page.rect
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False)
    pix.save(output)


def crop_ocr(page, rect, fallback):
    """OCR each question crop independently to retain reading order in scans."""
    executable = shutil.which('tesseract') or ('C:/Program Files/Tesseract-OCR/tesseract.exe' if Path('C:/Program Files/Tesseract-OCR/tesseract.exe').exists() else None)
    tessdata = os.environ.get('TESSDATA_PREFIX')
    if not executable or not tessdata:
        return fallback
    pixels = page.get_pixmap(matrix=fitz.Matrix(4,4), clip=fitz.Rect(rect)).tobytes('png')
    cache_dir = ROOT/'tmp/crop-ocr'; cache_dir.mkdir(parents=True,exist_ok=True)
    cache = cache_dir/(hashlib.sha256(pixels).hexdigest()+'.txt')
    if cache.exists(): return cache.read_text(encoding='utf-8')
    result = subprocess.run([executable,'stdin','stdout','-l','kor+eng','--psm','3','--tessdata-dir',tessdata], input=pixels,capture_output=True,timeout=90)
    text = result.stdout.decode('utf-8').replace('\r','').strip() if result.returncode == 0 else ''
    if text: cache.write_text(text,encoding='utf-8')
    return text or fallback


def build_exam(source, dest, overrides):
    year, section = source["academic_year"], source["section"]
    pdf_path = ROOT / "data" / "raw" / source["filename"]
    if not pdf_path.is_file():
        print(f"MISSING {pdf_path.name}")
        return [], {"exam": f"{year}_{section}", "status": "missing_pdf"}
    raw = pdf_path.read_bytes()
    if not raw.startswith(b"%PDF"):
        print(f"INVALID PDF {pdf_path.name}")
        return [], {"exam": f"{year}_{section}", "status": "invalid_pdf"}
    pdf_hash = hashlib.sha256(raw).hexdigest()
    doc = fitz.open(str(pdf_path))
    exam_dir = dest / f"{year}_{section}"
    exam_dir.mkdir(parents=True, exist_ok=True)
    all_segments = []
    unusual_pages = []
    active_question = None
    for page_no, page in enumerate(doc, 1):
        lines, ocr_used = lines_on_page(page)
        pieces, heads = page_segments(page, lines)
        if ocr_used:
            unusual_pages.append(f"page {page_no}: OCR fallback used")
        if not heads:
            unusual_pages.append(f"page {page_no}: no question headings detected; possible continuation or cover")
        # Visit page columns in reading order. An unnamed column may contain a
        # continuation from a previous question; retain it as an unverified crop.
        for col in (0, 1):
            in_col = [s for s in pieces if s["col"] == col]
            if in_col:
                # A new question can start halfway down a column after the
                # previous question's task. Preserve that leading continuation.
                first_y = min(s['rect'][1] for s in in_col)
                prefix = [line for line in lines
                          if column_of(line['rect'], page.rect.width) == col
                          and page.rect.height*.105 < line['rect'][1] < first_y-3]
                if page_no > 1 and active_question is not None and prefix:
                    x0 = 30 if col == 0 else page.rect.width/2+4
                    x1 = page.rect.width/2-4 if col == 0 else page.rect.width-25
                    area = [x0, page.rect.height*.105, x1, first_y-3]
                    all_segments.append({'n':active_question,'page':page_no,'col':col,
                                         'rect':area,'text':'\n'.join(lines_in_area(lines,area,col,page.rect.width)),
                                         'continuation_inferred':True})
                    unusual_pages.append(f'page {page_no}: leading continuation of question {active_question}')
                for piece in sorted(in_col, key=lambda x: x["rect"][1]):
                    piece["page"] = page_no
                    all_segments.append(piece)
                    active_question = piece["n"]
                continue
            body = [line for line in lines
                    if column_of(line["rect"], page.rect.width) == col
                    and page.rect.height*.11 < line["rect"][1] < page.rect.height*.89]
            # Continuations can also be pure diagrams. These need manual visual
            # review; we only attach the area automatically when there is text.
            if active_question is not None and body:
                x0 = 30 if col == 0 else page.rect.width/2 + 4
                x1 = page.rect.width/2-4 if col == 0 else page.rect.width-25
                y0 = max(page.rect.height*.11, min(line["rect"][1] for line in body)-8)
                y1 = min(page.rect.height*.91, max(line["rect"][3] for line in body)+8)
                area=[x0,y0,x1,y1]
                all_segments.append({"n": active_question,"page":page_no,"col":col,
                                     "rect":area,"text":"\n".join(lines_in_area(lines,area,col,page.rect.width)),
                                     "continuation_inferred":True})
                unusual_pages.append(f"page {page_no} {['left','right'][col]}: inferred continuation of question {active_question}; verify visually")
    output = []
    exam_override = overrides.get("questions", {})
    corrections_path = ROOT / 'overrides/content_corrections.json'
    corrections = json.loads(corrections_path.read_text(encoding='utf-8')) if corrections_path.exists() else {}
    for number in range(1, source["expected_questions"] + 1):
        qid = f"info-computer-{year}-{section}-{number}"
        qdir = exam_dir / f"q{number:02d}"
        qdir.mkdir(exist_ok=True)
        if qid in exam_override:
            if exam_override[qid].get('source_sha256', pdf_hash) != pdf_hash:
                raise ValueError(f'{qid}: reviewed regions belong to a different source SHA-256')
            selected = []
            for region in exam_override[qid].get("segments", []):
                p = int(region["page"])
                bounds = list(region["rect"])
                page = doc[p-1]
                lines, _ = lines_on_page(page)
                col = column_of(bounds, page.rect.width)
                selected.append({"n": number, "page": p, "rect": bounds,
                                 "text": "\n".join(lines_in_area(lines, bounds, col, page.rect.width))})
            reasons = ["크롭 경계 원본 대조 완료. OCR·수식·코드·표 텍스트의 추가 검수가 필요합니다."]
        else:
            selected = [s for s in all_segments if s["n"] == number]
            reasons = ["automatic column segmentation: not yet visually verified"]
            if any(s.get("continuation_inferred") for s in selected):
                reasons.append("one or more column continuations were inferred, not verified")
        if not selected:
            reasons.append("question heading or area not detected")
        if len(selected) > 2:
            reasons.append("more than two fragments detected; check for false heading matches")
        assets = []
        text_parts = []
        for idx, s in enumerate(selected, 1):
            p = s["page"]
            pic = f"part{idx:02d}_p{p:02d}.png"
            make_asset(doc[p-1], s["rect"], qdir / pic)
            assets.append({"path": f"{year}_{section}/q{number:02d}/{pic}",
                           "page": p, "region": [round(n, 2) for n in s["rect"]],
                           "kind": "question_crop"})
            text_parts.append(crop_ocr(doc[p-1],s['rect'],s['text']) if not doc[p-1].get_text().strip() else s['text'])
        raw_text = "\n\n".join(text_parts)
        score_match = SCORE_RE.search(raw_text[:800])
        score = int(score_match.group(1)) if score_match else None
        score = exam_override.get(qid,{}).get('score',score)
        if score is None:
            reasons.append("point value could not be verified")
        if not raw_text.strip():
            reasons.append("no text extracted; OCR/manual transcription needed")
        # IMPORTANT: separate (a) verified source-image segmentation, (b) hypothesized semantics.
        item = {
            "id": qid,
            "exam": {"academic_year": year, "subject": "정보·컴퓨터", "section": section},
            "question_number": number,
            "score": score,
            "source": {"original_pdf": f"data/raw/{source['filename']}", "sha256": pdf_hash,
                       "source_page_url": source["source_page_url"],
                       "pdf_pages": sorted({s["page"] for s in selected})},
            "raw_text": raw_text,
            "assets": assets,
            "analysis": {"status": "needs_review", "visuals": [], "sections": [], "concept_tags": []},
            "review": {"required": True, "reasons": reasons}
        }
        correction = corrections.get(qid)
        if correction:
            item['verified_text'] = correction['verified_text']
            item['analysis'] = {'status':'verified','visuals':[
                dict(v, asset_path=assets[0]['path']) for v in correction['visuals']
            ], 'sections':[{'type':'stem','text':correction['verified_text'],'source_asset':assets[0]['path']}], 'concept_tags':correction['concept_tags']}
            item['review'] = {'required':False,'reasons':[], 'crop_status':'verified','text_status':'verified','note':correction['review_note']}
        else:
            item['review']['crop_status'] = 'verified' if qid in exam_override else 'needs_review'
            item['review']['text_status'] = 'needs_review'
        (qdir / "question.json").write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
        output.append(item)
    doc.close()
    observed = sorted({s["n"] for s in all_segments})
    missing = [n for n in range(1, source["expected_questions"]+1) if n not in observed]
    report = {"exam": f"{year}_{section}", "status": "extracted_review_required",
              "expected": source["expected_questions"], "detected_unique_numbers": observed,
              "automatic_missing_headings": missing,
              "missing_headings": [n for n in missing if f'info-computer-{year}-{section}-{n}' not in exam_override],
              "unusual_pages": unusual_pages,
              "original_sha256": pdf_hash,
              "notes": "Question crops and text are DRAFT until human/vision validation."}
    report['questions_with_images'] = sum(bool(q['assets']) for q in output)
    report['missing_questions'] = [q['question_number'] for q in output if not q['assets']]
    report['crop_verified'] = sum(q['review'].get('crop_status') == 'verified' for q in output)
    report['text_verified'] = sum(not q['review']['required'] for q in output)
    return output, report


def generate_html(items, reports, dest):
    payload = json.dumps(items, ensure_ascii=False).replace("</", "<\\/")
    reports_txt = html.escape(json.dumps(reports, ensure_ascii=False, indent=2))
    page = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>임용 기출 문항 검수</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;color-scheme:light;background:#f5f5f2;color:#1b211f}
body{margin:0}.top{position:sticky;top:0;background:#fff;box-shadow:0 2px 8px #0001;padding:14px 24px;display:flex;align-items:center;gap:16px;z-index:2}h1{font-size:19px;margin:0}input{padding:10px 12px;border:1px solid #bbb;border-radius:7px;min-width:180px}main{display:grid;grid-template-columns:250px 1fr 1fr;gap:16px;margin:16px}.nav{height:calc(100vh - 110px);overflow:auto}.nav button{background:#fff;border:1px solid #ddd;width:100%;text-align:left;margin-bottom:5px;padding:11px;border-radius:8px;cursor:pointer}.nav button:hover,.nav button.active{border-color:#265f57;background:#eef7f4}.card{padding:18px;background:#fff;border:1px solid #ddd;border-radius:11px;min-height:500px;overflow:auto}img{width:100%;border:1px solid #ddd;margin:10px 0}pre{white-space:pre-wrap;word-break:break-word;font-family:'Malgun Gothic',sans-serif;line-height:1.6;font-size:13px}.warn{color:#9d4d16;font-weight:600}.meta{font-size:13px;color:#606c64}.empty{color:#9d4d16;background:#fff3e3;padding:10px;border-radius:7px}
@media(max-width:1000px){main{grid-template-columns:190px 1fr}.textcard{grid-column:2}}@media(max-width:680px){main{display:block}.nav{height:180px}.card{margin-top:10px}}
</style></head><body><header class="top"><h1>임용 기출 검수 · 문항 원본 확인</h1><input id="filter" placeholder="예: 2026 A 3 / 퍼셉트론"></header>
<main><aside class="nav" id="nav"></aside><section class="card" id="images"></section><section class="card textcard" id="text"></section></main>
<script>const ITEMS=__DATA__;const nav=document.querySelector('#nav');const images=document.querySelector('#images');const text=document.querySelector('#text');let active='';
function show(id){active=id;const q=ITEMS.find(q=>q.id===id);if(!q)return;document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));images.innerHTML='<h2>'+q.exam.academic_year+' '+q.exam.section+' '+q.question_number+'번</h2><p class="meta">원본 이미지 · 자동 크롭(검수 필수)</p>'+ (q.assets.length?q.assets.map(a=>'<img src="'+a.path+'" alt="문항 이미지"><p class="meta">PDF '+a.page+'페이지 / 영역 '+a.region.join(', ')+'</p>').join(''):'<p class="empty">이미지 미탐지 · PDF 확인 필요</p>');
text.innerHTML='<h2>추출 텍스트</h2><p class="warn">AI가 추정한 의미 해설이 아닌 PDF 문자 추출 초안입니다.</p><pre>'+esc(q.raw_text||'(텍스트 미탐지)')+'</pre><h3>검수 사유</h3><ul>'+q.review.reasons.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function render(){const s=document.querySelector('#filter').value.trim().toLowerCase();const found=ITEMS.filter(q=>(q.exam.academic_year+' '+q.exam.section+' '+q.question_number+' '+q.raw_text).toLowerCase().includes(s));nav.innerHTML=found.map(q=>'<button data-id="'+q.id+'">'+q.exam.academic_year+' '+q.exam.section+' · '+q.question_number+'번 <small>'+(q.assets.length?'이미지 '+q.assets.length:'미탐지')+'</small></button>').join('');nav.querySelectorAll('button').forEach(b=>b.onclick=()=>show(b.dataset.id));if(found.length)show(found.some(q=>q.id===active)?active:found[0].id);else {images.innerHTML='<p>결과 없음</p>';text.innerHTML='';}}
document.querySelector('#filter').addEventListener('input',render);render();</script></body></html>'''
    (dest / "index.html").write_text(page.replace('__DATA__', payload), encoding="utf-8")
    (dest / "processing_report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, default=ROOT / "data" / "processed")
    p.add_argument("--overrides", type=Path, default=ROOT / "overrides" / "layout_overrides.json")
    args=p.parse_args()
    dest=args.output; dest.mkdir(parents=True, exist_ok=True)
    overrides=json.loads(args.overrides.read_text(encoding="utf-8")) if args.overrides.exists() else {}
    all_items=[]; reports=[]
    for s in SOURCES:
        items, report = build_exam(s, dest, overrides)
        all_items.extend(items)
        reports.append(report)
        print(f"{s['academic_year']} {s['section']}: {len(items)} records; {report['status']}")
    with (dest / "corpus.jsonl").open("w", encoding="utf-8") as f:
        for item in all_items:
            f.write(json.dumps(item,ensure_ascii=False)+"\n")
    with (dest / "catalog.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.writer(f); w.writerow(["id","year","section","number","score","images","pages","review_required"])
        for q in all_items:
            w.writerow([q['id'],q['exam']['academic_year'],q['exam']['section'],q['question_number'],q['score'],len(q['assets']),",".join(map(str,q['source']['pdf_pages'])),q['review']['required']])
    generate_html(all_items,reports,dest)
    print("\nOutput:",dest.resolve())
    print("Total records:",len(all_items),"(these are draft records, not verified questions)")
    print("Check:", (dest / "index.html").resolve())
    if len(all_items)!=46:
        print("WARNING: expected 46 for complete 2025/2026 A/B corpus; see report.")


if __name__=='__main__':
    main()
