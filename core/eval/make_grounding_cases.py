"""Runs the backend's grounding check (backend/grounding.py) on many texts and
saves the answers. The phone's copy (app/src/grounding.ts) is tested against
this file, so the agent on the phone rejects exactly the dates the backend does.

Run it again whenever backend/grounding.py changes:
    .venv/bin/python core/eval/make_grounding_cases.py
"""

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.grounding import invented_dates  # noqa: E402

OUT = ROOT / "app" / "src" / "fixtures" / "grounding_cases.json"
MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def one_date(rng, y, m, d):
    """One date written one of many ways, some with no year."""
    en = MONTHS_EN[m - 1]
    return rng.choice([
        f"{y}-{m:02d}-{d:02d}", f"{m:02d}/{d:02d}/{y}", f"{m}/{d}/{y % 100:02d}",
        f"{en} {d}, {y}", f"{en} {d}", f"{en[:3]}. {d}, {y}", f"{en.lower()} {d}th",
        f"{d} {en} {y}", f"{d} de {MONTHS_ES[m - 1]} de {y}", f"{d} de {MONTHS_ES[m - 1]}",
        f"{d}º de {MONTHS_ES[m - 1]} del {y}", f"{en.upper()} {d}",
    ])


def main():
    rng = random.Random(16)
    cases = []
    for _ in range(600):
        facts = {}
        for field in ["notice_date", "effective_date", "due_date", "date_0", "date_1"]:
            if rng.random() < 0.7:
                facts[field] = f"2026-{rng.randrange(1, 13):02d}-{rng.randrange(1, 29):02d}"
        facts["worker_name"] = "Ana Ruiz"
        known = [v for k, v in facts.items() if k != "worker_name"]
        pieces = ["I sent my papers", "The county stopped my Medi-Cal", "Mandé mis papeles"]
        for _ in range(rng.randrange(0, 4)):
            if known and rng.random() < 0.6:
                y, m, d = map(int, rng.choice(known).split("-"))  # a date we know
            else:
                y, m, d = rng.choice([2025, 2026, 2027]), rng.randrange(1, 13), rng.randrange(1, 32)
            pieces.append(f"on {one_date(rng, y, m, d)}.")
        rng.shuffle(pieces)
        text = " ".join(pieces)
        cases.append({"text": text, "facts": facts, "answer": invented_dates(text, facts)})
    OUT.write_text(json.dumps(cases, ensure_ascii=False) + "\n")
    print(f"Saved {len(cases)} cases to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
