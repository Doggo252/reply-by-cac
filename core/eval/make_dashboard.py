"""Gathers the saved test results into one file for the app's "How well it
works" screen (app/src/Dashboard.tsx).

It only reads results that are already saved, so it costs no AI credit:
  core/eval/reader_a.md         Reader A (the AI), from reader_a_accuracy.py
  core/eval/reader_b_ocr.md     Reader B (Neil's classifier), from ocr_accuracy.py
  app/src/fixtures/*.json       the cases the phone copies were matched on
  Neil's test files             how many tests each has

Run it again after any of those change:
    .venv/bin/python core/eval/make_dashboard.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "app" / "src" / "fixtures" / "dashboard.json"


def fraction(text, label):
    """Finds "label ... 619/640" in the text and returns [619, 640]."""
    match = re.search(re.escape(label) + r"[^\n]*?(\d+)/(\d+)", text)
    return [int(match.group(1)), int(match.group(2))] if match else None


def table_rows(text, heading):
    """The rows of the markdown table under a heading, as lists of cells."""
    section = text.split(heading, 1)[1].split("\n## ", 1)[0]
    rows = []
    for line in section.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.startswith("|") and not set(line) <= set("|- ") and cells[0] not in ("", "date", "true \\ guessed"):
            rows.append(cells)
    return rows


def count_tests(path):
    return len(re.findall(r"^def test_", (ROOT / path).read_text(), re.M))


def main():
    a = (ROOT / "core" / "eval" / "reader_a.md").read_text()
    b = (ROOT / "core" / "eval" / "reader_b_ocr.md").read_text()
    checker = json.loads((ROOT / "app" / "src" / "fixtures" / "checker_cases.json").read_text())
    mistakes = json.loads((ROOT / "app" / "src" / "fixtures" / "contradiction_cases.json").read_text())

    b_overall = float(re.search(r"Overall accuracy: ([\d.]+)%", b).group(1))
    letters = sum(int(row[1]) for row in table_rows(b, "## By letter type"))

    data = {
        "letters_tested": letters,
        "reader_a": {
            "type_right": fraction(a, "Letter type right"),
            "by_type": [[row[0], fraction(row[2], "")] for row in table_rows(a, "## By letter type")],
            # date, right, wrong, missed, made up
            "dates": [[row[0], fraction(row[1], ""), int(row[2]), int(row[3]), int(row[4])]
                      for row in table_rows(a, "## Dates")],
            "case_numbers_seen": int(re.search(r"should be 0, they are blanked first\): (\d+)", a).group(1)),
        },
        "reader_b": {
            "type_right": [round(b_overall * letters / 100), letters],
            "by_type": [[row[0], round(float(row[2].rstrip("%")) * int(row[1]) / 100), int(row[1])]
                        for row in table_rows(b, "## By letter type")],
        },
        "together": {
            "agree": fraction(a, "They agree"),
            "agree_and_right": fraction(a, "Agree and both right"),
            "agree_but_wrong": int(re.search(r"Agree but both wrong[^:]*: (\d+)", a).group(1)),
            "disagree": fraction(a, "Disagree, so the app asks the user"),
        },
        "matched_on_phone": {
            "checker_dates": len(checker["dates"]),
            "checker_forms": len(checker["forms"]),
            "county_mistake_cases": len(mistakes),
        },
        "neils_tests": {
            "deadline_rules": count_tests("core/rules/test_deadlines.py"),
            "checker": count_tests("core/test_checker.py"),
            "county_mistakes": count_tests("core/test_contradictions.py"),
        },
    }
    OUT.write_text(json.dumps(data, indent=1))
    print(f"Saved {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
