# TODO

Schedule for ReplyBy. Updated October 11, 2026.

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

## Where things stand (October 8)

| Checkpoint | Status |
|---|---|
| Sep 20: fake letters, app on phone | Done, 2 days early |
| Sep 27: photo returns facts, both readers | Done on time |
| Oct 4: photo to countdowns | Done Oct 7, 3 days late, then caught up |
| Oct 11: full flow (forms, checker, timeline, vault) | On track |

**Done and working:** camera and text reading on the phone; Neil's classifier
(98.4%, and 99.8% on photos); the AI reader; the must-agree rule; redaction;
the deadline rules with 20 tests; the confirm screen with Neil's flags; the
phone-only reading choice; countdowns; the plain-language explanation in
English and Spanish with the invented-date check; the county-mistake rules
with 10 tests.

**Accuracy measured** (`core/eval/`): the classifier 98.1% on 640 photos;
the AI reader 96.7% on letter type (OTHER 91%), 0 dates made up, 0 case
numbers leaked. The readers disagree on 4% of letters. **Gemini credit: about
$7 left. Only one more full test run, near submission.**

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
      (its title, first page only) and what counts as OTHER: approval notices
      ("MC Approval"), inside pages of a form, the NA Back 9, other forms
      (MC 216, 217, 380, 382). Then rerun
      `.venv/bin/python core/eval/reader_a_accuracy.py` and compare to 81.1%.
- [x] [N] `prompts/explain.md`: say what each letter type means ("MC_239A
      means their Medi-Cal is being stopped"), so it stops calling a
      discontinuance "a change."
- [x] [N] `prompts/draft.md`: writes the rescission request letter and the
      hearing "Here's why" text from the county-mistake findings. Only the
      citations it is given, only dates in the facts or timeline, polite,
      short, no case number (the phone adds it after).
- [x] [C] county-mistake rules on the phone (matched to Neil's Python), the
      timeline screen, the receipt vault with file fingerprints. Also done:
      the `/draft` endpoint and the senior-friendly redesign (big text, three
      tabs, no reader names on screen).
- [ ] [N] Small fix: in `core/contradictions.py`, the Rule 2 citation starts
      with "Law:" and ends "(a).", which shows up inside the drafted letter.
      Then rerun `.venv/bin/python core/eval/make_contradiction_cases.py`.

### Saturday 10/10 (2.5 hours)
- [ ] [N] **Redesign the agent without fax.** (Slipped to Sunday. Options: A
      packet helper, B follow-up watcher, C both. Claude's pick: A.) Decide what it does (packet
      helper, follow-up watcher, or both), its tools, and the one locked tool
      that refuses unless the checker passed and the user signed.
- [ ] [N] Start `agent/TOOLS.md` if there is time.
- [x] [C] form filling (hearing request, MC 355 response, MC 210 RV checklist,
      signature page and cover sheet), signature pad, Neil's checker on the
      phone (matched on 3,800 dates and 600 forms). Done Sunday.

### Sunday 10/11 (short): **scope freeze**
- [ ] Nothing new gets started after today, except the agent.
- [ ] [N] If there is time: finish `agent/TOOLS.md`. Otherwise it moves to
      Wednesday.
- [x] [C] printable fake letters for Tuesday's test run
      (`data/synthetic/test-letters.pdf`, answers in `test-letters-answers.txt`;
      remake with `.venv/bin/python data/make_test_letters.py`); every piece
      wired into one flow.

---

## Week 5: the agent, real people, hardening

- [ ] **Tue 10/13 (1h)** [N] Full run on the phone with the printed test letters:
      photo, readers, confirm, countdowns, explanation, timeline, county
      mistake, drafts, forms, checker, sign, vault. Write down everything that
      breaks or confuses. That is the fix list.
- [ ] **Wed 10/14 (1h)** [N] Finish `agent/TOOLS.md`: every tool's inputs,
      outputs and preconditions, the locked tool, what the agent may not do,
      an iteration cap, the action-log format.
- [ ] **Thu 10/15 (1.5h)** [C] builds the agent loop from the spec. [N] tests
      that the locked tool refuses an unsigned send and logs why.
- [ ] **Fri 10/16 (1h)** [N] Test with Grandpa and Grandma (the real users;
      no partner organization has replied). Say nothing, watch, write down
      every hesitation.
- [ ] **Sat 10/17 (2.5h)** [N] Fix the top 5 problems with Claude.
      [C] puts the app on a real https address (needed for offline mode and
      so judges can open it), and builds the evaluation dashboard screen.
  - [ ] [C] Prefill "About you" from the letter, on the phone (no AI: the
        name and address are blanked before the AI sees anything). The
        person must confirm the address, or type a new one if they moved.
        Agreed 10/15; candidate for the top 5 list.
  - [ ] [C] With the agent loop: rename "Get my reply ready" to "Manually
        prepare my response", and add "Use AI to prepare my response" for
        the agent (Neil's wording, 10/15).
- [ ] **Sun 10/18 (2.5h)** [N] Airplane-mode test. Write the video script
      (under 450 words). Record a rough cut as insurance for week 6.

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

- **The agent is not designed yet.** Fax is out; Saturday's decisions unblock
  week 5.
- **One lost Saturday costs a week of authored work.**
- **Week 6 has 1.5 hours to record and 1 hour to edit.** The rough cut on
  Sunday 10/18 is the insurance.
- **Offline mode needs a real https address.** Set up Saturday 10/17.

## Open questions

- [x] What does the agent do without fax? Neil picked option C (packet
      helper and follow-up watcher) on 10/15. Claude, through the backend,
      picks each next step. Spec in progress in `agent/TOOLS.md`.
- [ ] Tell Mom the Phaxio account is on hold.
- [ ] Hosting: where the backend lives once the app is online. Claude will
      propose options before 10/17; it may need a parent for the account.
