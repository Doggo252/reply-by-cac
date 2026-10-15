# CLAUDE.md

Read this file completely before doing anything in this repository.

## What this project is

ReplyBy (working name) is a mobile web app for the Congressional App Challenge (California District 16). The builder is a high school student working alone. Submission deadline: Monday, October 26, 2026, 9:00 am Pacific. Internal target: submit Saturday, October 24.

The app: a person photographs a Medi-Cal letter. The app reads it, identifies which letter it is using two independent readers (an LLM and a small classifier the student trained), extracts the key facts for the user to confirm, computes every legal deadline from a rules file, explains the letter in plain language, fills the response forms, checks the filled forms against the confirmed facts, detects when the county itself made a mistake, and runs an agent that faxes the response and keeps a receipt.

Medi-Cal is California's Medicaid program. The problem: people lose coverage for paperwork reasons, not eligibility. About 69% of Medicaid disenrollments during the 2023 to 2024 unwinding were procedural.

## The two most important rules for you

### Rule 1: ownership. Some files are the student's, not yours.

The competition requires full disclosure of AI use and says AI cannot be the entire technical effort. Judges may ask the student to explain any part. So the repository is split:

**Student-owned files. Do NOT write or edit code in these. You may explain concepts, review the student's code, point out bugs, suggest test cases, and answer questions. If asked to write them, decline and offer to explain instead.**

- `core/classifier.py` and `core/train_classifier.py` (hand-written Naive Bayes letter classifier and its training script)
- `core/rules/deadlines.json` (the legal deadline rules)
- `core/rules/test_deadlines.py` (deadline tests)
- `core/contradictions.py` and `core/test_contradictions.py` (county-mistake rules)
- `core/checker.py` and `core/test_checker.py` (form-versus-facts checker)
- `prompts/*.md` (every LLM prompt)
- `agent/TOOLS.md` (the agent tool spec and guards)
- `data/generator_design.md` (which fields the fake-letter generator randomizes)

**Everything else you build:** the web app, camera capture, OCR wiring, confirm screen, countdown UI, PDF filling, storage, offline support, the backend, the LLM API call, the agent loop that executes the student's tool spec, the fax integration, the evaluation dashboard, charts, tests for your own code, and the rendering code of the fake-letter generator (the student designs it; you write the PyMuPDF and Pillow calls).

### Rule 2: log every session in AI-USE.md.

At the end of every session, append an entry to `AI-USE.md`:

```
## 2026-09-16
Files created or edited: app/src/Capture.tsx, backend/main.py
What I did: set up camera capture and the OCR call.
What the student did: designed the confirm-screen fields; reviewed the code.
```

Never skip this. It becomes the competition's required disclosure.

## How to work with this student

- The student has not written much code by hand in a while and is rebuilding skill. Explain in plain language. Define terms the first time you use them.
- For anything touching the student-owned files: explain the approach first with no code, let the student write it, then review. When reviewing, say what is wrong and why; do not silently rewrite it.
- Keep the code simple and readable. Prefer plain functions over clever abstractions. Add short comments a high schooler can follow.
- Ask before adding any dependency. Keep the dependency list short.
- No agent frameworks. The agent loop is a plain loop the student can read.
- Run the tests after every change. Small commits with clear messages.
- If a request would break Rule 1, the privacy rules below, or the competition rules, say so and propose an alternative.
- Do not expand scope. Three letter types, one program (Medi-Cal), two counties (Santa Clara and San Mateo). If asked for more, note it in `NEXT_VERSION.md` and move on.

## Stack

- Front end: React with Vite, installable as a PWA. Runs in the phone browser.
- OCR: Tesseract.js in the browser. The photo never leaves the phone.
- Backend: Python FastAPI. Holds the LLM API key and the fax API key. Endpoints: `/extract` (redacted text in, structured facts out), `/explain`, `/draft`, `/fax`, `/fax/status`.
- LLM: Claude via the Anthropic API, called only from the backend. Structured outputs via a JSON schema.
- Classifier: hand-written Naive Bayes in Python (student-owned), trained offline; weights exported to `app/public/model.json` and run in the browser by `app/src/classify.ts` (you write the browser inference to match the student's Python exactly).
- Rules: `core/rules/deadlines.json` (student-owned), evaluated by `app/src/deadlines.ts` (you write the evaluator; it must be a pure function with no dates hard-coded).
- PDF filling: pdf-lib in the browser.
- Storage: IndexedDB. Receipt vault entries include a SHA-256 hash from the Web Crypto API.
- Fake-letter generator: Python with PyMuPDF and Pillow.
- Tests: pytest for Python, Vitest for TypeScript. One command each: `make test-py`, `make test-js`.
- Fax: Phaxio or SRFax, behind the backend. Not needed until week 5.

## Repository layout

```
CLAUDE.md
AI-USE.md
SOURCES.md              links to every official form and letter used
NEXT_VERSION.md         ideas explicitly out of scope
data/
  templates/            official PDFs (MC 210 RV, MC 216, MC 355, NA Back 9, MC 382); see SOURCES.md
  handbook/             saved Santa Clara County handbook pages on notices
  generator_design.md   student-owned
  generate.py           you write; renders fake letters from the design
  synthetic/            generated images and labels.csv (gitignored)
  real/                 redacted clinic letters, TEST ONLY, gitignored, never used for training
core/
  classifier.py         student-owned
  train_classifier.py   student-owned
  checker.py            student-owned
  contradictions.py     student-owned
  rules/deadlines.json  student-owned
  rules/test_deadlines.py  student-owned
  eval/                 you write: accuracy tables and disagreement rate for both readers
prompts/                student-owned
agent/
  TOOLS.md              student-owned spec
  loop.py               you write; executes only the tools in TOOLS.md
backend/
app/
```

## Domain facts (use these; do not invent others)

**The three letters the app recognizes**
1. Renewal packet cover letter with form MC 210 RV (the pre-filled annual renewal for seniors and people with disabilities, the non-MAGI side of Medi-Cal). Since renewals due on or after January 1, 2026 it comes with a property supplement insert because asset reporting was reinstated (ACWDL 25-14). Deadline: the due date printed on the cover letter. The MC 216 (families) and MC 217 (mixed households) are the same idea for other groups and are next version.
2. MC 355, Request for Information. The county allows 30 days for response.
3. MC 239 A, discontinuance for not returning the renewal (and sibling MC 239 letters for not providing requested documents or asset information). Must list the missing items, the names it applies to, the regulations, and the right to a state hearing (printed on the NA Back 9 on the reverse).

Anything else is "unknown" and gets the generic path.

**Deadline rules the student will encode (with citations)**
- Renewal due date: from the letter.
- MC 355 response: 30 days from the notice date.
- 90-day cure period after discontinuance: return the requested information within 90 days and Medi-Cal is reinstated back to the discontinuance date with no new application. W&IC 14005.37; DHCS MEDIL I14-60; I15-22E. Also applies to discontinuance for missing asset information (ACWDL 25-14).
- State hearing request: within 90 days of the notice date. W&IC 10951. Benefits continue if requested before the effective date.
- Covered California special enrollment: 90 days after discontinuance (shown as a safety net).

**County-mistake rules the student will encode**
- Returned before the effective date but discontinued anyway: the county shall rescind the termination and restore benefits while it waits for verification. DHCS MEDIL I15-22 (citing ACWDL 11-23, Q25).
- Information received within the 90-day cure period must be treated as received timely. W&IC 14005.37(a); MEDIL I15-22E.

**Forms the app fills**
- State hearing request (the form on the NA Back 9).
- MC 355 response with attachments.
- MC 210 RV: do not retype the packet. Produce a checklist of sections to answer (including the property supplement), a signature page, and a cover sheet with case number and page index.
- Rescission request letter (generated, cites the rules above).
- MC 382 Appointment of Authorized Representative (next version).

**Sources**
- DHCS forms index: https://www.dhcs.ca.gov/formsandpubs/forms/Pages/Index-MC200.aspx and https://www.dhcs.ca.gov/formsandpubs/forms/Pages/MCEDFormsMC300.aspx
- Santa Clara County Medi-Cal handbook (notice wording): https://stgenssa.sccgov.org/debs/program_handbooks/medi-cal/
- DHCS letters: I15-22, I15-22E, I14-60 at https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/

## Privacy and safety rules (enforced in code, not prompts)

- Before any text is sent to the LLM, blank out digit strings of 6 or more characters (case numbers, SSNs). Unit test this.
- API keys live only in backend environment variables. Never in the app bundle. Never committed.
- Nothing is sent to a county without the user tapping Send after signing. The `send_fax` tool refuses unless `checker_passed == True` and `signed == True`. Unit test this guard.
- LLM explanations are rejected if they contain a date that is not in the confirmed facts. Unit test this.
- The app must run in airplane mode for capture, OCR, classification (Reader B), confirm, deadlines, checker, and vault. Only `/extract`, `/explain`, `/draft`, and `/fax` need the network.

## Milestones

- Sun Sept 20: fake letters generated (800 per type), blank app installs on the phone, backend runs locally.
- Sun Sept 27: photo of a printed mock letter returns structured facts on the phone; both readers wired; disagreement case handled.
- Sun Oct 4: photo to countdown works end to end; accuracy numbers for both readers saved in `core/eval/`.
- Sun Oct 11: full flow end to end including forms, checker, timeline, vault. Scope freeze.
- Sun Oct 18: agent with real fax round trip; evaluation dashboard; airplane-mode test; user testing done.
- Sat Oct 24: submit.

## Definition of done for the demo video

- A printed discontinuance letter is photographed and recognized; both readers agree on screen.
- Facts are highlighted beside the photo; one is corrected by hand.
- Three countdowns appear with the law each comes from.
- The explanation switches to Spanish.
- An upload receipt is added; the timeline flags "returned before the effective date"; the rescission request and hearing request draft themselves.
- The checker catches a planted wrong date; the user fixes it and signs.
- The agent runs with its action log visible; the fax receipt lands in the vault.
- The rules tests run green; the `send_fax` guard refuses an unsigned send; airplane mode works.

## First session: do these in order

1. Confirm you have read this file by summarizing Rule 1 and Rule 2 back in two sentences.
2. Create the repository layout above with placeholder files. Put a one-line comment in each student-owned file that says "Student-owned. See CLAUDE.md." and nothing else.
3. Create `AI-USE.md`, `SOURCES.md`, `NEXT_VERSION.md`, `.gitignore` (ignore `data/synthetic/`, `data/real/`, `.env`, `node_modules/`).
4. Set up `app/` (React, Vite, PWA manifest, service worker) so a blank page opens on the phone over the local network.
5. Set up `backend/` (FastAPI) with a `/health` endpoint and `.env` loading. No LLM call yet.
6. Set up `make test-py` and `make test-js` with one passing placeholder test each.
7. Ask the student to write `data/generator_design.md` (which letter fields to randomize, and what each of the three letters looks like). Explain what a good design contains. Do not write it for them.
8. Once the design exists, write `data/generate.py` to render the fake letters and a `labels.csv`.
9. Append the first `AI-USE.md` entry.

Do not start on the classifier, rules, prompts, checker, or contradiction rules. Those are the student's.
