# AI use disclosure

This file lists every session where AI (Claude, through Claude Code) was used on
this project. It is kept because the Congressional App Challenge requires full
disclosure of AI use, and because AI is not allowed to be the whole technical
effort.

The split of work is written down in `CLAUDE.md`. In short: the letter
classifier, the legal deadline rules and their tests, the form checker, the
county-mistake rules, every LLM prompt, the agent tool spec, and the fake-letter
design are written by hand by the student. AI writes the app shell, the
backend plumbing, and the glue around those pieces.

Entries are appended newest last.

## 2026-09-15
Files created or edited: repository layout, `app/`, `backend/`, `Makefile`, `SOURCES.md`, `NEXT_VERSION.md`, `TODO.md`, `docs/student-guides/`, `data/templates/`, `data/handbook/`.
What I did: set up the app shell, backend, and tests; downloaded and verified the official forms; wrote study guides for the student-owned files; built the schedule.
What the student did: chose the idea and scope in earlier planning chats with Claude (which drafted the planning documents), set the time budget, contacted partner organizations, tested the app on a phone.

## 2026-09-16
Files created or edited: `SOURCES.md`, `TODO.md`, `data/templates/`.
What I did: researched replacement partner organizations; found CalSAWS example notices; reviewed the student's design draft and answered questions.
What the student did: wrote the MC 239 A section of `data/generator_design.md` and made its design decisions.

## 2026-09-17
Files created or edited: none.
What I did: reviewed the student's design drafts and answered questions.
What the student did: finished `data/generator_design.md`.

## 2026-09-18
Files created or edited: `data/generate.py`, `data/test_generate.py`, `pytest.ini`.
What I did: wrote the fake-letter generator from the student's design and improved its realism from the student's feedback; generated 800 letters per type.
What the student did: reviewed the sample letters and directed the changes (fonts, handwriting, layout mix).

## 2026-09-20
Files created or edited: `data/generate.py`, `data/test_generate.py`, `data/real/`, `docs/problem-statement.md`, `app/src/Capture.tsx`, `app/src/ocr.ts`, `app/src/image.ts`, `app/scripts/copy-ocr-files.mjs`.
What I did: compared two real letters with the design; updated the generator to the real formats; edited the wording of the student's problem statement; researched fax services; built the photo capture and on-phone text reading (OCR) screen.
What the student did: collected and redacted real letters, updated the design from them, wrote the problem statement, chose the app name (ReplyBy), sent outreach emails.

## 2026-09-22 to 2026-09-24
Files created or edited: none.
What I did: quizzed the student on the classifier concepts and checked his hand-worked example; reviewed drafts of `prompts/extract.md` and pointed out problems.
What the student did: worked the Naive Bayes example by hand; wrote `prompts/extract.md`.

## 2026-09-25
Files created or edited: `app/src/redact.ts`, `app/src/redact.test.ts`, `backend/redact.py`, `backend/tests/test_redact.py`.
What I did: wrote the redaction code (on the phone, with a server-side backup) and its tests.
What the student did: decided the redaction rule: blank case numbers, ID numbers, names and addresses; keep the worker's details.

## 2026-09-26
Files created or edited: `data/extract_text.py`.
What I did: wrote the script that saves each fake letter's text for training; reviewed the student's classifier as he wrote it and pointed out bugs.
What the student did: wrote `core/classifier.py` by hand (tokenize, train, predict, save, load).

## 2026-09-27
Files created or edited: `app/src/classify.ts`, `app/src/Capture.tsx`, `app/src/redact.ts`, `backend/main.py`, `backend/llm.py`, `backend/redact.py`, their tests, `core/eval/ocr_accuracy.py`, `core/eval/reader_b_ocr.md`, `data/generate.py`.
What I did: reviewed the student's training script; wrote the browser version of his classifier; built Reader A (the `/extract` endpoint using Gemini); installed Tesseract, measured the classifier on OCR text, and hardened the redaction after testing it on OCR output and the real letters; added the student's OTHER pile to the generator.
What the student did: wrote `core/train_classifier.py`; designed the fourth "OTHER" letter type and its mix; retrained the classifier on four types (98.4%); set up the Gemini API key.

## 2026-09-29
Files created or edited: `app/src/readerA.ts`, `app/src/Capture.tsx`, `app/vite.config.ts`.
What I did: reviewed the student's must-agree function; wired both readers and his rule into the camera screen.
What the student did: fixed the letter type names in `prompts/extract.md`; wrote the must-agree rule (`app/src/agree.ts`) and its four cases.

## 2026-09-30 to 2026-10-01
Files created or edited: `backend/main.py`, `backend/grounding.py`, `backend/tests/test_explain.py`, `backend/tests/test_grounding.py`, `TODO.md`.
What I did: reviewed drafts of the student's explanation prompt; built the `/explain` endpoint and the check that rejects explanations with dates not in the facts.
What the student did: found the legal sources for the 90-day rule and the weekend rule, decided how days are counted, wrote `prompts/explain.md`, and decided to rework the agent without faxing.

## 2026-10-07
Files created or edited: `core/rules/evaluate.py`, `core/rules/test_evaluate.py`, `app/src/deadlines.ts`, `app/src/deadlines.test.ts`, `app/src/Countdowns.tsx`, `app/src/Capture.tsx`, `app/src/Confirm.tsx`, `app/src/Explanation.tsx`, `app/src/flags.ts`, `app/src/localFacts.ts`, `backend/llm.py`, and tests.
What I did: explained the deadline rules file, reviewed the student's rules and tests and suggested test cases; looked up the current state holiday law and computed the holiday dates for 2026 to 2028; built the code that turns his rules into countdowns (phone and Python copies, checked to match) and the countdown cards; built the reading choice, the on-phone fact finder, the confirm screen with the student's flag rules, and the explanation with its English and Spanish switch; switched to a faster AI model after timing it.
What the student did: designed `core/rules/deadlines.json` and wrote all five rules with their citations; chose which date the cure period counts from and to move only hearing deadlines off weekends and holidays; wrote the 20 deadline tests in `core/rules/test_deadlines.py`, working out every expected date by hand; chose the confirm-screen flag rules, an on-phone-only reading option, and on-phone case number reading; wrote the two county-mistake rules in plain English and designed the timeline event and proof rule in `core/contradictions.py`.

## 2026-10-08
Files created or edited: none.
What I did: gave step-by-step outlines for the county-mistake code and its tests; reviewed each draft and pointed out bugs.
What the student did: wrote `core/contradictions.py` (finding the papers, Rule 1, Rule 2) and its 10 tests in `core/test_contradictions.py`.
Update (2026-10-08): wrote `core/eval/reader_a_accuracy.py` and measured Reader A on the 640 test letters (results in `core/eval/reader_a.md`).

## 2026-10-09
Files created or edited: `backend/main.py` (`/draft`), `app/src/contradictions.ts`, `app/src/fingerprint.ts`, `app/src/storage.ts`, `app/src/Timeline.tsx`, `app/src/Vault.tsx`, `app/src/LetterHome.tsx`, `app/src/App.tsx`, `app/src/Capture.tsx`, `app/src/index.css`, `core/eval/make_contradiction_cases.py`, and tests.
What I did: gave outlines for the checker and its tests and reviewed each draft; reviewed the three prompts and reran the Reader A test (81.1% to 96.7%); built the `/draft` endpoint, the phone copy of the county-mistake rules (matched to the student's Python on 400 cases), the timeline, the receipt vault with fingerprints, and a simpler, larger app design at the student's request.
What the student did: wrote `core/checker.py` and its 8 tests; rewrote `prompts/extract.md` to tell the letters apart, fixed `prompts/explain.md`, and wrote `prompts/draft.md` (a few lines in the extract and draft prompts use wording I suggested); asked for the senior-friendly redesign.

## 2026-10-11
Files created or edited: `app/src/checker.ts`, `app/src/packet.ts`, `app/src/ReplyPacket.tsx`, `app/src/SignaturePad.tsx`, `app/src/App.tsx`, `app/src/LetterHome.tsx`, `app/src/Timeline.tsx`, `app/src/storage.ts`, `app/public/forms/`, `app/public/sw.js`, `core/eval/make_checker_cases.py`, `data/make_test_letters.py`, and tests.
What I did: laid out the agent options now that fax is out; built the phone copy of the student's checker (matched to his Python on 3,800 dates and 600 forms), form filling for the hearing request and the MC 210 RV signature page, the cover sheet, the signature pad, the reply packet steps, and printable test letters.
What the student did: chose the agent design (in progress).

## 2026-10-15
Files created or edited: `app/src/localFacts.ts`, `app/src/localFacts.test.ts`, `app/src/contradictions.ts`, `app/src/fixtures/contradiction_cases.json`, `CLAUDE.md`, `TODO.md`.
What I did: explained the project and planned the week; fixed the phone-only reader after the student's phone test (it now finds what the county is asking for, repairs a misread case number and stops worker names at the next label), checked on the 640 test letters; matched the phone county-mistake rules to the student's fixed citation; noted Reader A's missed dates as a known weak spot.
What the student did: ran the phone-only test and reported the three problems; fixed the cure-period citation in `core/contradictions.py`; wrote `agent/TOOLS.md` (purpose, 13 tools, the locked `build_packet`, what the agent may never do, limits, action log).

## 2026-10-16
Files created or edited: `app/src/agentLoop.ts`, `app/src/agentTools.ts`, `app/src/grounding.ts`, `app/src/redact.ts`, `core/eval/make_grounding_cases.py`, tests, `CLAUDE.md`, `TODO.md` (a second Claude session, merged 10/17).
What I did: built the AI helper's loop and its 13 tools from the student's `agent/TOOLS.md`, the date check on the phone, and blanking of the person's known names; updated `CLAUDE.md` for no fax.
What the student did: finished `agent/TOOLS.md`; chose to run the loop on the phone.

## 2026-10-17
Files created or edited: `backend/agent.py`, `backend/main.py`, `backend/llm.py`, `app/src/agentApi.ts`, `app/src/AgentHelper.tsx`, `app/src/agentWords.ts`, `app/src/App.tsx`, `app/src/LetterHome.tsx`, `app/src/Vault.tsx`, `app/src/storage.ts`, `CLAUDE.md`, and tests.
What I did: reviewed the other session's work and planned the weekend; built the `/agent` endpoint (relays to Gemini, scrubs again, only the 13 tools), the helper screens (consent, live log, review, sign, photo), and the saved log in My papers; explained the letter sequence and each tool for the prompt.
What the student did: chose Render for hosting; wrote `prompts/agent.md` over three drafts after reviews (I formatted his final text as Markdown without changing his words).

## 2026-10-18
Files created or edited: `app/src/watcher.ts`, `app/src/Watcher.tsx`, `app/src/aboutFromLetter.ts`, `app/src/Dashboard.tsx`, `core/eval/make_dashboard.py`, `backend/serve.py`, `Dockerfile`, `render.yaml`, `Makefile`, `app/src/AgentHelper.tsx`, `app/src/agentLoop.ts`, and tests.
What I did: ran the AI helper once for real and fixed a stop on an unreadable photo; built the offline watcher, the "About you" first guess from the letter, the evaluation dashboard, and the hosting setup with a daily AI-call cap; gave an outline for the guard tests.
What the student did: fixed and pushed `prompts/agent.md`; is writing the `build_packet` guard tests in `app/src/agentGuard.test.ts`.
Update (2026-10-18, on the student's Windows PC): Claude fixed two Windows-only bugs (a file name clash that blanked the app, and prompt files read without UTF-8), measured the phone reader on 60 test photos and enlarged photos to 3000 pixels plus two misread repairs, and redesigned the screens for seniors: one job per letter (`app/src/letterJob.ts`), sending papers first with the hearing as a backup, one thing per screen in the reply steps, and two tabs. The student found the problems on his phone, chose the design (small hearing link, the AI helper as the big button, two tabs, current text size), and moved the work back to one `main` branch. At the student's direct request, Claude edited three lines in student-owned files to match the redesign: step 4b of `prompts/agent.md` (hearing request only when the county made a mistake) and Section 1, points 4 and 7 of `agent/TOOLS.md` (the same rule, and the watcher warning only about the main deadline). The rest of both files is the student's own writing.

## 2026-10-18 (second session)
Files created or edited: `app/src/PaperSteps.tsx`, `app/src/paperHelp.ts`, `app/src/PaperChecklist.tsx`, `app/src/printOrSend.ts`, `app/src/ReplyPacket.tsx`, `app/src/AgentHelper.tsx`, `app/src/LetterHome.tsx`, `app/src/letterJob.ts`, `app/src/packet.ts`, `app/src/Capture.tsx`, `app/src/Confirm.tsx`, `app/src/Explanation.tsx`, `app/src/Timeline.tsx`, `app/src/Vault.tsx`, `app/src/Watcher.tsx`, `app/src/words.ts`, `app/src/agentWords.ts`, `app/src/flags.ts`, `app/src/localFacts.ts`, `app/src/aboutFromLetter.ts`, `app/src/redact.ts`, `backend/redact.py`, `core/eval/make_redact_cases.py`, `app/src/index.css`, `app/src/main.tsx`, `app/public/sw.js`, `app/package.json`, `app/src/App.tsx`, `app/src/ReadAloud.tsx`, `app/src/speech.ts`, `app/src/calendar.ts`, `data/generate.py`, and tests.
What I did: rewrote the app's words in plain language for seniors; added a guided flow that asks one question at a time (which boxes are checked on an MC 355, an offer to go through the renewal form part by part, and one screen per paper with what it is, where to find it, and "I don't have it" / "I can't find it" answers); added a "Look over your reply" screen before signing, with a way to change things; listed the papers to send on the letter screen and on the cover sheet; added tips for short or weekend deadlines and other ways to send (phone, fax, in person) read from the letter; a new color palette and the Atkinson Hyperlegible font; a share-or-download button for the finished packet; fixes to the phone reader (case numbers, phone numbers, the "asked for" list, street addresses) and to name blanking, with a shared test file so the phone and the backend blank the same way. I then walked through six test letters (two of each type) as a judge, as the submitter and as a senior, and fixed what came up. After that I added a "Read it to me" button that reads each screen aloud with the phone's own voice (`app/src/ReadAloud.tsx`, `app/src/speech.ts`), a "Remind me on my calendar" button that saves the deadline as a calendar file with two reminders (`app/src/calendar.ts`), and Windows fonts in `data/generate.py` so its tests pass on Windows (a Mac still makes the same letters). Wrote the airplane-mode test steps, and drafted the demo video script at the student's request, for him to edit and record (later, at his request, changed one sentence and made the on-screen cues name the exact screens and buttons). Made the AI helper use the same paper screens and preview as the step-by-step reply (`app/src/usePapers.ts`, `app/src/ReplyPreview.tsx`), rewrote the packet's cover page as a real letter (`app/src/packet.ts`), and updated `TODO.md`.
What the student did: tested on his phone and reported the problems (errors, a confusing flow, no list of what to send, wording that read like AI, a generic look); asked for a preview before signing and for the app to ask specific questions; chose the warm palette, the font, the first-screen wording ("Most accurate / Most private"), flagging only unsure boxes in phone-only mode, and the AI helper as the big button; asked for the six-letter review; picked read-aloud and the calendar reminder from a list of ideas, and asked for the Windows test fix; found that the AI helper skipped the renewal details and that the packet's cover page did not read like a real letter; edited the video script himself.
