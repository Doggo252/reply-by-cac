# TODO

Schedule for ReplyBy. Updated October 18, 2026.

Deadline: **Monday October 26, 2026, 9:00 am Pacific.** Submit **Saturday
October 24.** Monday is a zero day, so Saturday is the real deadline.

Legend: **[N]** Neil writes it. **[C]** Claude builds it.

## The time budget

| Day | Hours |
|---|---|
| Monday | 0 |
| Tuesday | 1 |
| Wednesday | 1 |
| Thursday | 1.5 |
| Friday | 1 (3 this week, no school) |
| Saturday | 2.5 |
| Sunday | 2.5 (short this week) |

Monday is the slip day: overruns land there because it costs nothing to lose.

---

## Where things stand (October 18)

| Checkpoint | Status |
|---|---|
| Sep 20: fake letters, app on phone | Done, 2 days early |
| Sep 27: photo returns facts, both readers | Done on time |
| Oct 4: photo to countdowns | Done Oct 7, 3 days late, then caught up |
| Oct 11: full flow (forms, checker, timeline, vault) | Done |
| Oct 18: AI helper, dashboard, airplane test, user testing | AI helper and dashboard done; airplane test and Mom's test left |

**Done and working:** camera and text reading on the phone; Neil's classifier
(98.4%, and 99.8% on photos); the AI reader; the must-agree rule; redaction;
the deadline rules with 20 tests; the confirm screen with Neil's flags; the
phone-only reading choice; the plain-language explanation in English and
Spanish with the invented-date check; the county-mistake rules with 10 tests;
the checker; forms and the signed packet; the timeline and vault; the AI
helper (agent loop, 13 tools, the locked `build_packet` and its guard tests);
the offline watcher; the evaluation dashboard; hosting on Render.

**Accuracy measured** (`core/eval/`): the classifier 98.1% on 640 photos;
the AI reader 96.7% on letter type (OTHER 91%), 0 dates made up, 0 case
numbers leaked. The readers disagree on 4% of letters. **Gemini credit is
low. Only one more full test run, near submission.**

---

## Week 4, finishing

### Friday 10/9 (about 3 hours, no school)
- [x] [N] `core/checker.py` (about 30 lines): compare the finished form's
      fields to the confirmed facts, return the list of mismatches. Normalize
      dates, spaces, capitals and phone numbers before comparing.
- [x] [N] `core/test_checker.py`: a correct form passes; **a planted wrong
      date blocks** (filmed); different date formats still match; the
      near-miss `2026-03-04` vs `2026-04-03` fails; a blank field; two
      mismatches both reported.
- [x] [N] `prompts/extract.md`: say what each of the three letters looks like
      (its title, first page only) and what counts as OTHER. Reran the Reader A
      test (81.1% to 96.7%).
- [x] [N] `prompts/explain.md`: say what each letter type means, so it stops
      calling a discontinuance "a change."
- [x] [N] `prompts/draft.md`: writes the rescission request letter and the
      hearing "Here's why" text from the county-mistake findings.
- [x] [C] county-mistake rules on the phone (matched to Neil's Python), the
      timeline screen, the receipt vault with file fingerprints, the `/draft`
      endpoint.
- [x] [N] Small fix: the Rule 2 citation in `core/contradictions.py` (done 10/15).

### Saturday 10/10 (2.5 hours)
- [x] [N] **Redesign the agent without fax.** Neil picked option C (packet
      helper and follow-up watcher) on 10/15.
- [x] [N] Start `agent/TOOLS.md`.
- [x] [C] form filling (hearing request, MC 355 response, MC 210 RV checklist,
      signature page and cover letter), signature pad, Neil's checker on the
      phone (matched on 3,800 dates and 600 forms).

### Sunday 10/11 (short): **scope freeze**
- [x] Nothing new gets started after today, except the agent. (Since then only
      polish for seniors, from testing.)
- [x] [N] Finish `agent/TOOLS.md` (10/16).
- [x] [C] printable fake letters for the test run
      (`data/synthetic/test-letters.pdf`, answers in `test-letters-answers.txt`;
      remake with `.venv/bin/python data/make_test_letters.py`).

---

## Week 5: the agent, real people, hardening

- [x] **Tue 10/13 (1h)** [N] Full run on the phone with the printed test
      letters (done 10/15; phone-only fixes the same day).
- [x] **Wed 10/14 (1h)** [N] Finish `agent/TOOLS.md`.
- [x] **Thu 10/15 (1.5h)** [C] builds the agent loop from the spec. [N] tests
      that the locked tool refuses an unsigned send and logs why.
  - [x] [N] `agent/TOOLS.md` finished (10/16).
  - [x] [C] Loop core on the phone: `app/src/agentLoop.ts`, the 13 tools in
        `app/src/agentTools.ts`, the date check on the phone (`grounding.ts`).
  - [x] [N] `prompts/agent.md` (10/18). One real run with Gemini worked end
        to end: 12 steps, county mistake found, both drafts, 23 seconds.
  - [x] [N] The `build_packet` guard tests in `app/src/agentGuard.test.ts`.
  - [x] [C] Backend `/agent` endpoint (10/17).
  - [x] [C] The screens: AI helper, live action log, review screen, consent
        message (10/17); the watcher on app open (10/18).
- [ ] **Fri 10/16 (1h)** [N] User test. Grandpa and Grandma are no longer on
      Medi-Cal, so **Mom tests instead** (tonight, 10/18). Say nothing, watch,
      write down every hesitation.
- [x] **Sat 10/17 (2.5h)** [N] Fix the top problems with Claude.
      [C] the https address and the evaluation dashboard.
  - [x] [C] Hosting ready (10/18): `Dockerfile` and `render.yaml`, one
        address for the app and API, a cap of 300 AI calls a day.
  - [x] [C] Evaluation dashboard: My papers, "How well ReplyBy works" (10/18).
  - [x] [C] Prefill "About you" from the letter (10/18), on the phone.
- [x] **Sun 10/18** [N] found the problems on his phone and chose the design;
      [C] built it:
  - [x] Senior redesign: one job per letter, plain words, two tabs, warm
        colors, Atkinson Hyperlegible font. Sending papers first; the hearing
        is a small backup link.
  - [x] Guided paper steps: which boxes are checked (MC 355), the renewal form
        part by part, then one paper at a time with what it is, where to find
        it, and "I don't have it" / "I can't find it" answers.
  - [x] "Look over your reply" before signing, with ways to change things.
  - [x] Six test letters walked through as a judge, as Neil and as a senior;
        everything found was fixed.
  - [x] The AI helper uses the same paper screens and preview as step by
        step (it was skipping the renewal walk-through and the MC 355 boxes).
  - [x] The cover letter is now a real letter (address, date, "Dear...",
        what's included, "Sincerely," signature, list of pages).
  - [x] "Read it to me" (reads the screen out loud) and "Remind me on my
        calendar".
  - [x] Generator tests pass on Windows too.
  - [ ] [N] Review and commit everything.
  - [ ] [N] Phone check: "Read it to me" talks; the calendar file opens Calendar.
  - [ ] [N] Airplane-mode test on the Render address (steps from Claude, 10/18).
  - [x] [N] Video script: drafted 10/18, Neil is editing it in his Claude doc.
  - [ ] [N] Record a rough cut as insurance for week 6.
  - [ ] [N] Mom's test (see Fri 10/16 above).

- [ ] **Weak spot: Reader A misses dates** (notice date right 68%, effective
      date 69%, due date 90%; it leaves them blank, never makes them up).
      - [ ] [N] During the phone run, check that blank dates are flagged
            and easy to type in.
      - [x] [C] The date table (right, wrong, missed, made up) is on the
            evaluation dashboard.
      - [x] Video script: Neil chose not to mention it; the dashboard shows it.

---

## Week 6: video and submission

- [ ] **Tue 10/20 (1h)** [C] repo cleanup: README, one-command tests.
      [N] reviews it.
- [ ] **Wed 10/21 (1h)** [N] Submission write-up, plus the AI disclosure
      copied from `AI-USE.md`.
- [ ] **Thu 10/22 (1.5h)** [N] Record the app on a phone stand; record the
      story separately.
- [ ] **Fri 10/23 (1h)** [N] Edit to under three minutes.
- [ ] **Sat 10/24 (2.5h)** [N] Whiteboard rehearsal (classifier, rules,
      checker, agent guard, two minutes each, recorded once). **Submit.**
      Confirm the confirmation email arrives.

---

## Standing risks

- **One lost Saturday costs a week of authored work.**
- **Week 6 has 1.5 hours to record and 1 hour to edit.** The rough cut is the
  insurance.
- **The airplane-mode test has not been run yet.** It needs the Render
  address, since offline mode only works over https.
- **The AI helper's review screen changed today** and has not had a real run
  since (each run uses Gemini credit). One real run before recording.
- **Reader A misses dates** (notice date only 68%). The confirm screen
  catches it, but the user has to type them. No prompt rework before
  submission.

## Open questions

- [x] What does the agent do without fax? Option C (packet helper and
      follow-up watcher), 10/15.
- [ ] Tell Mom the Phaxio account is on hold.
- [x] Hosting: Render, one server for the app and API (10/18).
