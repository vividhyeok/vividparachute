"""Download known verified PDFs; leaves unavailable items for manual download.

Usage: python scripts/download_verified.py
Never fabricates missing PDFs, and does not silently accept HTML error pages.
"""
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "raw"
SOURCES = json.loads((ROOT / "data" / "sources.json").read_text(encoding="utf-8"))


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for item in SOURCES:
        target = DEST / item["filename"]
        if target.exists() and target.read_bytes().startswith(b"%PDF"):
            print(f"OK already: {target.name}")
            continue
        url = item.get("verified_attachment_url")
        if not url:
            print(f"MANUAL {target.name}: {item['source_page_url']}")
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read()
            if not data.startswith(b"%PDF"):
                raise ValueError("Server did not return a PDF")
            target.write_bytes(data)
            print(f"OK downloaded {target.name}: {len(data)} bytes sha256={hashlib.sha256(data).hexdigest()[:16]}")
        except Exception as ex:
            print(f"MANUAL {target.name}: automatic download failed: {str(ex)[:160]}")
            print(f"         Open {item['source_page_url']} and save attachment as {item['filename']}")
    missing = [s['filename'] for s in SOURCES if not (DEST / s['filename']).exists()]
    if missing:
        print("Still missing:", ", ".join(missing))
    else:
        print("All four PDFs are present. Next: python scripts/ingest_pdfs.py")


if __name__ == "__main__":
    main()
