"""Runs Neil's checker on many date spellings and forms, and saves the
answers. The phone's copy (app/src/checker.ts) is tested against this file.

Run it again whenever core/checker.py changes:
    .venv/bin/python core/eval/make_checker_cases.py
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from core.checker import check, normalize_date  # noqa: E402

OUT = ROOT / "app" / "src" / "fixtures" / "checker_cases.json"
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def spellings(rng):
    """Dates written many ways, including broken and impossible ones."""
    y, m, d = rng.randrange(1990, 2031), rng.randrange(1, 13), rng.randrange(1, 32)
    suffix = rng.choice(["st", "nd", "rd", "th"])
    month = rng.choice([MONTHS[m - 1], MONTHS[m - 1].lower(), MONTHS[m - 1].upper(), MONTHS[m - 1][:3]])
    return [
        f"{y}-{m:02d}-{d:02d}", f"{y}-{m}-{d}", f"{m:02d}/{d:02d}/{y}", f"{m}/{d}/{y}",
        f"{m}-{d}-{y}", f"{month} {d}, {y}", f"{month} {d}{suffix}, {y}", f"  {month}  {d},  {y} ",
        f"{month} {d} {y}", f"{m}/{d}/{y % 100:02d}", f"{d:02d}/{m:02d}/{y}", f"{y}/{m}/{d}",
        f"{month} 0{d}, {y}", "sometime soon", "", "2/29/2028", "2/29/2027", "2026-02-30", "13/01/2026",
    ]


def main(seed=11):
    rng = random.Random(seed)
    dates = []
    for _ in range(200):
        for text in spellings(rng):
            dates.append({"text": text, "answer": normalize_date(text)})
    forms = []
    fields = ["notice_date", "due_date", "worker_phone", "worker_name", "case_number"]
    values = {
        "notice_date": ["2026-10-01", "10/01/2026", "October 1st, 2026", "10/03/2026", "junk", "", "  "],
        "due_date": ["2026-03-04", "2026-04-03", "March 4, 2026", "3-4-2026", None],
        "worker_phone": ["(408) 555-0123", "4085550123", "408.555.0124", "", "no digits"],
        "worker_name": ["John Smith", "  JOHN   smith ", "Jon Smith", ""],
        "case_number": ["1C6T512", "1c6t512", "1C6T5I2", None],
    }
    for _ in range(600):
        facts = {f: rng.choice(values[f]) for f in fields if rng.random() < 0.8}
        form = {f: rng.choice(values[f]) for f in fields if rng.random() < 0.85}
        form = {k: v for k, v in form.items() if v is not None}
        forms.append({"form": form, "facts": facts, "answer": check(form, facts)})
    OUT.write_text(json.dumps({"dates": dates, "forms": forms}))
    print(f"Saved {len(dates)} dates and {len(forms)} forms to {OUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
