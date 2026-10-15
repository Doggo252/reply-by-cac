"""Makes three fake letters to print for a test run on the phone: one of
each type the app handles, dated a few days ago so the countdowns are live.

    .venv/bin/python data/make_test_letters.py

Writes data/synthetic/test-letters.pdf (print it) and test-letters-answers.txt
(what the app should find on each one). Everything in them is made up.
"""

import argparse
import random
from datetime import date, timedelta

import pymupdf

import generate as g


def letter(letter_type, notice, seed):
    rng = random.Random(f"test-{seed}-{letter_type}")
    facts = g.make_facts(letter_type, rng)
    facts["hard_case"] = ""
    facts["notice_date"] = notice
    # Printed, not handwritten, so the first test is about the app, not the pen.
    facts["pen"] = {"writing": "printed", "font": g.PRINT_FONTS[0] if g.PRINT_FONTS else None,
                    "color": (0, 0, 0), "scale": 1.0}
    if letter_type == "MC_239A":
        facts["layout"] = "calsaws"
        facts["discontinuance_date"] = g.first_allowed_discontinuance(notice)
    elif letter_type == "MC355":
        facts["due_date"] = notice + timedelta(days=30)
    else:
        facts["due_date"] = notice + timedelta(days=g.RENEWAL_DAYS_TO_RESPOND)
    return facts


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--notice-date", type=date.fromisoformat,
                        default=date.today() - timedelta(days=4), help="YYYY-MM-DD (default: 4 days ago)")
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    out = pymupdf.open()
    answers = []
    for letter_type in ["MC_239A", "MC355", "MC210_RV"]:
        facts = letter(letter_type, args.notice_date, args.seed)
        # Only the first page: that is the page a person photographs.
        out.insert_pdf(g.build_letter(facts), from_page=0, to_page=0)
        answers.append("\n".join([
            f"Page {len(answers) + 1}: {letter_type}",
            f"  notice date:    {facts['notice_date']}",
            f"  coverage stops: {facts['discontinuance_date'] or '-'}",
            f"  due date:       {facts['due_date'] or '-'}",
            f"  case number:    {facts['case_number']}",
            f"  worker:         {facts['worker_name']}, {facts['worker_phone']}",
        ]))
    g.OUT_DIR.mkdir(exist_ok=True)
    out.save(g.OUT_DIR / "test-letters.pdf")
    (g.OUT_DIR / "test-letters-answers.txt").write_text("\n\n".join(answers) + "\n")
    print("\n\n".join(answers))
    print(f"\nPrint {g.OUT_DIR / 'test-letters.pdf'}")


if __name__ == "__main__":
    main()
