<p align="center">
  <img src="app/public/logo.svg" alt="ReplyBy logo" width="120">
</p>

<h1 align="center">ReplyBy</h1>

<p align="center">
  Helps seniors on Medi-Cal read and understand their Medi-Cal county paperwork, so they don't lose their health coverage.
</p>

<p align="center">
  <a href="https://replyby.onrender.com"><b>Open the app: replyby.onrender.com</b></a>
</p>

> Heads up! The server runs on a free platform that sleeps when not in use, so the first visit can take up to a minute to load.
> The website works best on a phone. If using a computer, it may be hard to take pictures of a letter.

Made by Neil Patil for the 2026 Congressional App Challenge, California's 16th District.

## Why I made the app

Roughly 69% of the people who lost Medicaid during the 2023 to 2024 renewals lost it over paperwork, not because they stopped qualifying ([KFF](https://www.kff.org/medicaid/medicaid-enrollment-and-unwinding-tracker/)). Starting in 2026, seniors on Medi-Cal have to report their savings again (DHCS ACWDL 25-14), which can make the number go even higher.

My grandparents were also on Medi-Cal. Their letters were long, full of legal words, and had deadlines. Even with a social worker, they couldn't tell what to send or when. Without our family helping, they would have lost their coverage.

## What the app does

You start by taking a picture of the letter. ReplyBy works out which letter it is, what it means, and every deadline, then helps you get your reply ready to send.

- **Reads the letter on your phone.** Two readers check which letter it is: Google's Gemini, and a Naive Bayes classifier trained on 2,560 fake letters. If they disagree, the app asks you. You check every fact before the app uses it.
- **Shows what to do.** What happened, what to send, and the deadline, worked out from rules based on California law, each with its source. It can read the screen out loud, and the whole app works in Spanish.
- **Fills in the real forms.** For a renewal, it reads the pages the county already printed, so you just tap "Still right" or "It changed". It reads amounts off your papers (Social Security letter, bank statement, Medicare card) and fills in the official 17-page renewal form (MC 210 RV).
- **Catches county mistakes.** If you sent your papers before your coverage was stopped and the county stopped it anyway, the app spots it, cites the rule (DHCS MEDIL I15-22), and drafts a letter asking the county to fix it.
- **AI helper.** Uses Gemini function calling with 14 tools to put your reply together, and stops for your OK at each step.
- **Checks before you sign.** You see every page first. If a date doesn't match your letter, the checker flags it, and you can't sign until it's fixed. The signed packet is saved on your phone with a code that shows it was never changed. The app never sends anything for you; you mail it yourself.

It handles three letters: the stop notice (MC 239 A), the request for information (MC 355) and the renewal (MC 210 RV), for Santa Clara and San Mateo counties. Other letters get a general explanation.

## Privacy

- Photos of letters never leave the phone. Text recognition (Tesseract) runs on the phone.
- With AI on, the phone removes your name, address and case number before any text is sent.
- Phone-only mode sends nothing and works offline.
- The Gemini API key stays on the server, never in the app.

## Try it with a test letter

Every letter in this repo is made up. To try the app without a real letter, print one of these and take a picture of it:

- [`data/synthetic/test-letters.pdf`](data/synthetic/test-letters.pdf): one of each letter type (3 pages)
- [`data/synthetic/denial-kit.pdf`](data/synthetic/denial-kit.pdf): a stop letter with the renewal packet and the person's own papers
- [`data/synthetic/test-kit.pdf`](data/synthetic/test-kit.pdf): a full renewal packet with the person's papers

The `-answers.txt` file next to each one lists what the app should find.

## How well the readers work

Tested on 640 fake letters that were held back from training, read from photos (tilted, shadowed, folded, cut off at the bottom):

|                        | Letter type right                                   |
| ---------------------- | --------------------------------------------------- |
| Naive Bayes classifier | 98.1%                                               |
| Gemini                 | 96.7%                                               |
| Both agree             | 95.9% (when they disagree, the app asks the person) |
| Both agree but wrong   | 3 of 640                                            |

Gemini sometimes misses dates (it found the notice date on 68% of letters), but it leaves them blank instead of guessing: it made up 0 dates. Every blank gets flagged on the screen where the person checks the facts. Details are in [`core/eval/`](core/eval/).

## How it's built

| Part             | What it uses                                                                         |
| ---------------- | ------------------------------------------------------------------------------------ |
| App              | React and TypeScript (Vite), installable on a phone, works offline                   |
| Text recognition | Tesseract.js, on the phone                                                           |
| Forms            | pdf-lib fills the official PDFs; pdf.js shows them before signing                    |
| Storage          | The phone's own storage (IndexedDB); receipts are hashed with SHA-256                |
| Server           | Python (FastAPI); passes text to Gemini and keeps the key private                    |
| AI               | Google Gemini                                                                        |
| Classifier       | Naive Bayes in Python, trained offline, run in the browser from its exported weights |
| Hosting          | Docker on Render                                                                     |
| Tests            | pytest and Vitest, 346 automated tests                                               |

## What's where

```
app/                 the phone app (React and TypeScript)
  src/               screens, the two readers, deadlines, form filling, the AI helper
  public/            icons, the classifier's weights (model.json), the official PDF forms
backend/             the server: redaction, Gemini calls, the AI helper's relay, tests
core/
  classifier.py      the Naive Bayes letter classifier (train_classifier.py trains it)
  rules/             deadline rules with their legal sources (deadlines.json), and tests
  contradictions.py  the county-mistake rules
  checker.py         checks the filled forms against the confirmed facts
  eval/              accuracy reports for both readers
prompts/             the instructions given to Gemini
agent/TOOLS.md       the AI helper's 14 tools and the rules that keep it safe
data/
  generate.py        makes the fake letters (generator_design.md says what varies)
  templates/         official DHCS forms and letters
  synthetic/         labels, letter texts, and the printable test letters
docs/                the problem statement and images
Dockerfile           how the app is built and put online (with render.yaml)
```

## Run it yourself

You need Node 22 and Python 3.13. A Gemini API key is optional; without one, phone-only mode still works.

```bash
make setup                               # installs everything
cp backend/.env.example backend/.env     # then put your GEMINI_API_KEY in backend/.env
make dev-backend                         # the server, on port 8000
make dev-app                             # the app; open the address it prints, on your phone or computer
```

On Windows, use `.venv\Scripts\python` where the Makefile says `.venv/bin/python`.

Tests:

```bash
make test-py    # Python: server, rules, classifier, checker
make test-js    # the app
```
