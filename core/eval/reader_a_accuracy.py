"""How accurate is Reader A (the AI) on the held-back test letters?

Runs the same steps as the app: OCR text from the photo, scrubbed of private
details, then Neil's prompt (prompts/extract.md) through the AI. Scores the
letter type and each date against labels.csv, counts dates the AI made up,
and measures how often Reader A and Reader B (Neil's classifier) disagree.

Run from the repository root (uses the Gemini key in backend/.env, about
$0.25 for all 640 letters):
    .venv/bin/python core/eval/reader_a_accuracy.py

Answers are saved in data/synthetic/reader_a_answers.json, filed under the
prompt that produced them. Running it again with the same prompt asks nothing
new; changing prompts/extract.md asks again, so the score is always for the
current prompt. Writes core/eval/reader_a.md.
"""

import calendar
import csv
import hashlib
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / "backend" / ".env")
from backend import llm  # noqa: E402
from backend.redact import redact  # noqa: E402
from core.classifier import load, predict  # noqa: E402

SYNTHETIC = ROOT / "data" / "synthetic"
CACHE = SYNTHETIC / "reader_a_answers.json"
DATE_FIELDS = ["notice_date", "due_date", "effective_date"]


def truth_for(label):
    """The right answers for one letter, in the same shape the AI returns."""
    effective = None
    if label["discontinuance_month"]:
        year, month = map(int, label["discontinuance_month"].split("-"))
        effective = f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    return {
        "letter_type": label["letter_type"],
        "notice_date": label["notice_date"] or None,
        "due_date": label["due_date"] or None,
        "effective_date": effective,
        "worker_phone": re.sub(r"\D", "", label["worker_phone"]) or None,
    }


def ask(text):
    prompt = (ROOT / "prompts" / "extract.md").read_text(encoding="utf-8").replace("{text}", redact(text)[0])
    try:
        answer = llm.ask_for_json(prompt)
        return answer if isinstance(answer, dict) else {"error": "not an object"}
    except llm.LLMError as error:
        return {"error": str(error)}


def main():
    labels = {r["filename"]: r for r in csv.DictReader(open(SYNTHETIC / "labels.csv"))}
    texts = {r["filename"]: r["text"] for r in csv.DictReader(open(SYNTHETIC / "ocr_texts.csv"))}
    prompt_id = hashlib.sha256((ROOT / "prompts" / "extract.md").read_bytes()).hexdigest()[:12]
    saved = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    if saved and "answers_by_prompt" not in saved:
        saved = {}  # an older file layout
    saved.setdefault("answers_by_prompt", {})
    answers = saved["answers_by_prompt"].setdefault(prompt_id, {})
    todo = [f for f in texts if f not in answers or "error" in answers[f]]
    if todo:
        print(f"Asking Reader A about {len(todo)} letters...")
        with ThreadPoolExecutor(max_workers=8) as pool:
            for name, answer in zip(todo, pool.map(lambda f: ask(texts[f]), todo)):
                answers[name] = answer
        CACHE.write_text(json.dumps(saved, indent=1))

    model = load(ROOT / "app" / "public" / "model.json")
    rows = []
    for name, text in texts.items():
        answer, truth = answers[name], truth_for(labels[name])
        rows.append({"name": name, "label": labels[name], "answer": answer, "truth": truth,
                     "reader_b": predict(model, text)})
    errors = [r for r in rows if "error" in r["answer"]]
    ok_rows = [r for r in rows if "error" not in r["answer"]]

    def pct(part, whole):
        return f"{part}/{whole} ({part / whole:.1%})" if whole else "n/a"

    type_right = [r for r in ok_rows if r["answer"].get("letter_type") == r["truth"]["letter_type"]]
    lines = ["# Reader A (the AI) on OCR text", "",
             f"Prompt version `{prompt_id}`. Tested on the {len(rows)} held-back fake letters, read from their photos, scrubbed of",
             "private details, then sent through `prompts/extract.md`.", "",
             f"**Letter type right: {pct(len(type_right), len(ok_rows))}**", ""]
    if errors:
        lines += [f"Letters where the AI gave no answer: {len(errors)}", ""]

    lines += ["## By letter type", "", "| | letters | type right |", "|---|---|---|"]
    for t in sorted({r["truth"]["letter_type"] for r in ok_rows}):
        group = [r for r in ok_rows if r["truth"]["letter_type"] == t]
        lines.append(f"| {t} | {len(group)} | {pct(sum(r in type_right for r in group), len(group))} |")
    lines.append("")

    lines += ["## Dates", "",
              "Scored only on letters of the three types the app handles, where the true date exists.",
              "A date \"made up\" is one the AI gave where the letter has none.", "",
              "| date | right | wrong | missed (gave null) | made up |", "|---|---|---|---|---|"]
    handled = [r for r in ok_rows if r["truth"]["letter_type"] != "OTHER"]
    for field in DATE_FIELDS:
        have = [r for r in handled if r["truth"][field]]
        right = sum(r["answer"].get(field) == r["truth"][field] for r in have)
        missed = sum(r["answer"].get(field) in (None, "") for r in have)
        wrong = len(have) - right - missed
        made_up = sum(1 for r in handled if not r["truth"][field] and r["answer"].get(field) not in (None, ""))
        lines.append(f"| {field} | {pct(right, len(have))} | {wrong} | {missed} | {made_up} |")
    lines.append("")

    phones = [r for r in handled if r["truth"]["worker_phone"]]
    phone_right = sum(re.sub(r"\D", "", str(r["answer"].get("worker_phone") or "")) == r["truth"]["worker_phone"] for r in phones)
    lines += [f"Worker phone right: {pct(phone_right, len(phones))}", ""]

    # The privacy check: the case number is blanked before the AI sees the
    # text, so the AI should never be able to return it.
    leaked = sum(1 for r in ok_rows if r["label"]["case_number"] and r["label"]["case_number"] in json.dumps(r["answer"]))
    lines += [f"Case numbers the AI returned (should be 0, they are blanked first): {leaked}", ""]

    agree = [r for r in ok_rows if r["answer"].get("letter_type") == r["reader_b"]]
    both_right = [r for r in agree if r["reader_b"] == r["truth"]["letter_type"]]
    both_wrong = [r for r in agree if r["reader_b"] != r["truth"]["letter_type"]]
    lines += ["## The two readers together", "",
              f"- They agree: {pct(len(agree), len(ok_rows))}",
              f"- Agree and both right: {pct(len(both_right), len(ok_rows))}",
              f"- Agree but both wrong (the only case the must-agree rule cannot catch): {len(both_wrong)}",
              f"- Disagree, so the app asks the user: {pct(len(ok_rows) - len(agree), len(ok_rows))}", ""]

    wrong_types = [r for r in ok_rows if r not in type_right]
    if wrong_types:
        lines += ["## Letter type mistakes", "", "| true | Reader A said | Reader B said | photo | layout |", "|---|---|---|---|---|"]
        for r in wrong_types[:25]:
            lines.append(f"| {r['truth']['letter_type']} | {r['answer'].get('letter_type')} | {r['reader_b']} | "
                         f"{r['label']['photo_effect']} | {r['label']['layout']} |")
        lines.append("")

    out = ROOT / "core" / "eval" / "reader_a.md"
    out.write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
