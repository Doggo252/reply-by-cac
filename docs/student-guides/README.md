# Student guides

These are the lessons I used before writing my own parts of the app: the classifier, the deadline rules, the county-mistake rules, the checker, the prompts, and the AI helper's rules. Claude Code wrote them for me at the start of the project. The deal was that it would teach me how each part works but not write those files for me. Each guide explains the idea, lists the decisions I had to make myself, and works an example on a different topic (library books, text messages, pizza orders), so I still had to figure out the Medi-Cal version on my own.

Below is the guides' own intro, written by Claude.

---

Neil writes the files in the table below. Claude does not write them, and
does not paste finished code into them. These guides exist so that "you write it"
does not mean "you are on your own."

**How every guide is built:**

1. **What this file is for**, in one paragraph.
2. **The concepts**, in plain language, with terms defined the first time.
3. **The decisions you have to make.** These are genuinely yours. A guide will
   raise a question and refuse to answer it, on purpose.
4. **A worked example in a different domain.** Library books, text messages,
   pizza orders. Never Medi-Cal. You do the translation, which is the part that
   teaches you.
5. **A checklist** for when the file is done.
6. **The whiteboard test.** The question a judge could ask. If you cannot answer
   it out loud in two minutes, the file is not finished no matter what the tests
   say.

**How to use Claude on these files:** ask it to explain, review, find bugs,
suggest test cases, or explain why something is slow or wrong. Do not ask it to
write them. If you ask, it will decline and offer to explain instead, which is
the deal that keeps the competition disclosure honest.

Reviewing is not cheating and it is not a loophole. Working programmers get code
reviewed constantly. The line is authorship: your fingers, your decisions, your
ability to explain it.

| Guide | File you write | Week |
|---|---|---|
| [01-generator-design.md](01-generator-design.md) | `data/generator_design.md` | 1 (tonight) |
| [02-classifier.md](02-classifier.md) | `core/classifier.py`, `core/train_classifier.py` | 2 |
| [03-extraction-prompt.md](03-extraction-prompt.md) | `prompts/extract.md` | 2 |
| [04-deadline-rules.md](04-deadline-rules.md) | `core/rules/deadlines.json`, `core/rules/test_deadlines.py` | 3 |
| [05-contradictions.md](05-contradictions.md) | `core/contradictions.py`, `core/test_contradictions.py` | 4 |
| [06-checker.md](06-checker.md) | `core/checker.py`, `core/test_checker.py` | 4 |
| [07-agent-tools.md](07-agent-tools.md) | `agent/TOOLS.md` | 5 |
