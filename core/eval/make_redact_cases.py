"""Saves the server's privacy filter answers (backend/redact.py) on 200 test
letters, so the phone's copy (app/src/redact.ts) can be checked against them:
app/src/redact.test.ts reads app/src/fixtures/redact_cases.json.

Run it again after changing either filter:
    .venv/bin/python core/eval/make_redact_cases.py
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from backend.redact import redact  # noqa: E402

OUT = ROOT / "app" / "src" / "fixtures" / "redact_cases.json"


def main():
    csv.field_size_limit(10**9)
    with open(ROOT / "data" / "synthetic" / "ocr_texts.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))[:200]
    cases = [{"text": r["text"], "clean": redact(r["text"])[0]} for r in rows]
    OUT.write_text(json.dumps(cases), encoding="utf-8")
    print(f"Saved {len(cases)} cases to {OUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
