"""Non-exam synthetic test, no private/test data is included."""
import importlib.util
from pathlib import Path
import sys
import unittest

import fitz

SCRIPT=Path(__file__).resolve().parents[1]/"scripts"/"ingest_pdfs.py"
spec=importlib.util.spec_from_file_location('ingest',SCRIPT)
ingest=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)


class PageLayoutTest(unittest.TestCase):
    def test_two_column_questions(self):
        d=fitz.open()
        p=d.new_page(width=595,height=842)
        p.insert_text((62,130),"1. First question",fontsize=11)
        p.insert_text((70,165),"Given x = 1",fontsize=10)
        p.insert_text((306,130),"2. Second question",fontsize=11)
        p.insert_text((314,165),"Given y = 2",fontsize=10)
        lines,ocr=ingest.lines_on_page(p)
        self.assertFalse(ocr)
        parts,heads=ingest.page_segments(p,lines)
        self.assertEqual([x['n'] for x in parts],[1,2])
        self.assertIn('First question',parts[0]['text'])
        self.assertNotIn('Second question',parts[0]['text'])
        self.assertIn('Second question',parts[1]['text'])
        d.close()

    def test_nested_numbered_list_is_not_a_question(self):
        d=fitz.open(); p=d.new_page(width=842,height=1191)
        p.insert_text((88,150),'12. Real heading',fontsize=13)
        p.insert_text((106,220),'1. Nested item',fontsize=11)
        p.insert_text((432,150),'11. Right heading',fontsize=13)
        heads=ingest.detect_headings(ingest.lines_on_page(p)[0],842,1191)
        self.assertEqual([h['n'] for h in heads],[12,11]); d.close()

    def test_continuation_before_next_heading_is_retained(self):
        import tempfile
        import unittest.mock
        d=fitz.open(); p=d.new_page(width=842,height=1191)
        p.insert_text((88,150),'4. Real heading',fontsize=13)
        p=d.new_page(width=842,height=1191)
        p.insert_text((88,150),'4. Real heading',fontsize=13)
        p.insert_text((450,170),'Previous question task',fontsize=11)
        p.insert_text((432,320),'5. Next question',fontsize=13)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'data/raw').mkdir(parents=True)
            d.save(root/'data/raw/test.pdf'); d.close()
            with unittest.mock.patch.object(ingest,'ROOT',root):
                questions,_=ingest.build_exam({'academic_year':2026,'section':'B','filename':'test.pdf','source_page_url':'test','expected_questions':5},root/'out',{})
            q4=questions[3]; self.assertIn('Previous question task',q4['raw_text']); self.assertNotIn('Next question',q4['raw_text'])


if __name__=='__main__':
    unittest.main()
