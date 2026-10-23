<p align="center">
  <img src="app/public/logo.svg" alt="ReplyBy logo" width="120">
</p>

<h1 align="center">ReplyBy</h1>

<p align="center">
  Helps seniors on Medi-Cal understand their county paperwork and send back the right reply, so they don't lose their health coverage.
</p>

<p align="center">
  <a href="https://reply-by-cac.web.app"><b>Open the app: reply-by-cac.web.app</b></a>
</p>

> The website works best on a phone. On a computer, tap "No letter handy? Try a sample one" to try it with a made-up letter.

Made by Neil Patil for the 2026 Congressional App Challenge, California's 16th District.

## Why I made it

My grandparents were on Medi-Cal. Their letters were long, full of legal words, and had deadlines. Even with a social worker, they couldn't tell what to send or when. My mom ended up walking them through it, and without her they would have lost their coverage.

They're not unusual. About 69% of the people who lost Medicaid during the 2023 to 2024 renewals lost it over paperwork. They still qualified ([KFF](https://www.kff.org/medicaid/medicaid-enrollment-and-unwinding-tracker/)). And starting in 2026, seniors on Medi-Cal have to report their savings again (DHCS ACWDL 25-14), which means more forms to miss.

This year CA-16 asked for apps that help people get to benefits and services. Getting Medi-Cal is half of that. Keeping it is the other half, and that's what ReplyBy is for.

## What it does

A lot of tools can explain a letter or remind you about a deadline. ReplyBy does the reply. You take a picture of the letter, and it figures out which letter it is, what it means, and every deadline. Then it fills in the official forms, checks them against your letter, and gets everything ready for you to sign and mail.

- It reads the letter twice, with Google's Gemini and with a Naive Bayes classifier I trained on 2,560 fake letters. If the two don't agree, it asks you. You check every fact before the app uses it.
- It shows what happened, what to send, and the deadline. The deadlines come from rules I wrote from California law, and each one shows where it comes from.
- For a renewal, it reads the pages the county already filled in, so you just tap "Still right" or "It changed". It reads amounts off your papers (Social Security letter, bank statement, Medicare card) and fills in the real 17-page state form, the MC 210 RV.
- If you sent your papers before your coverage was cut off and the county cut you off anyway, it catches that, cites the rule (DHCS MEDIL I15-22), and writes a letter asking the county to fix it.
- An AI helper puts the whole reply together using Gemini function calling with 14 tools. It stops for your OK at every step.
- Before you sign, you see every page. If a date doesn't match your letter, the checker flags it, and you can't sign until it's fixed. The app never sends anything. You mail it yourself.
- It can read each screen out loud, and the whole app works in Spanish.

It handles three letters for Santa Clara and San Mateo counties: the stop notice (MC 239 A), the request for information (MC 355), and the renewal (MC 210 RV). Any other letter gets a general explanation.

## Testing it with real people

I didn't want it to only work on my own test letters, so my mom, the same person who walked my grandparents through their letters, tested it twice on her phone, on the live site, with a printed test kit. A lot of things broke, which was the point.

- In the first round, the renewal help only gave her a checklist. That doesn't help someone who only has the cover letter in front of them, so now the app asks the form's questions one at a time and fills in the real form. She also wanted fewer taps, saving as she goes, and a way to start over.
- In the second round, it missed her address and date of birth, her bank statement and Medicare card photos only worked on the second try, the photos in the finished packet came out sideways, and she wanted to see the whole packet before signing. All of that is fixed now.
- I also ran the whole stop-letter story myself on a real phone (that's the screen recording in my video). That found one more bug: the app filled in the county office's address instead of the person's. Fixed too.

There are also 346 automated tests (pytest and Vitest) that run on every change.

## How well it reads letters

I tested both readers on 640 fake letters they had never seen, read from photos that were tilted, shadowed, folded, or cut off at the bottom.

| | Letter type right |
| --- | --- |
| Naive Bayes classifier | 98.1% |
| Gemini | 96.7% |
| Both agree | 95.9% (when they disagree, the app asks the person) |
| Both agree but wrong | 3 of 640 |

Gemini sometimes misses dates. It found the notice date on 68% of letters, but it never made one up. It leaves a date blank instead of guessing, and every blank gets flagged on the screen where you check the facts. The full numbers are in [`core/eval/`](core/eval/).

## Privacy

Photos of your letters never leave your phone, because the text is read on the phone. If you turn AI on, the phone takes out your name, address and case number before any text is sent. If you pick phone-only mode, nothing is sent at all, and it works in airplane mode. The Gemini key stays on the server, never in the app.

## Try it

The easiest way is the sample letter: open the app, pick a language, and tap "No letter handy? Try a sample one". Every letter here is made up.

If you want to try the camera, print one of these and take a picture of it:

- [`data/synthetic/test-letters.pdf`](data/synthetic/test-letters.pdf): one of each letter type
- [`data/synthetic/denial-kit.pdf`](data/synthetic/denial-kit.pdf): a stop letter, plus the renewal packet and the person's own papers
- [`data/synthetic/test-kit.pdf`](data/synthetic/test-kit.pdf): a full renewal packet, plus the person's papers

The `-answers.txt` file next to each one lists what the app should find.

## How it's built

The app is React and TypeScript, built with Vite, and you can install it on a phone like a normal app. Text recognition runs on the phone with Tesseract.js. pdf-lib fills in the official PDFs, and pdf.js shows them before you sign. Everything you save stays in the phone's own storage, and each signed packet gets a SHA-256 code that shows it was never changed.

The server is Python (FastAPI). Its job is to pass text to Gemini and keep the API key private. The app's pages are on Firebase Hosting, and Firebase passes the AI calls to the server, which runs in Docker on Google Cloud Run. The same Docker setup also runs the whole app on Render (replyby.onrender.com) as a backup.

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
Dockerfile           how the app and server are built (for Cloud Run, and for Render with render.yaml)
firebase.json        how the app is put online on Firebase, with the AI calls sent to Cloud Run
```

## Run it yourself

You need Node 22 and Python 3.13. A Gemini API key is optional. Without one, phone-only mode still works.

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
