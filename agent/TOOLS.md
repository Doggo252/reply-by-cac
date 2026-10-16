# Agent tools
## 1. Purpose
1. Start: When the user clicks "Use AI to prepare my response". Internet is required, else grey this button and the manual button is the only one able to be clicked. If the user chose “Keep everything on my phone”, the button is not shown at all.
2. All letters: For every letter type, suggest papers to pick or ask for a photo. 
3. Privacy: Before the paper's text is sent to the AI model, remove PII data. PII data includes name, address, case number, account numbers, social security number, birthdate. The user is informed that their sensitive PII data stays on their phone, what is sent is the text from the papers. If the user says no, then they have the option to manually choose the papers to use in the packet and draft the reason.
4. For MC 239 A only: The agent creates a draft of the hearing request. Additionally if the county mistake is found, it creates a draft for the restore letter. If no mistake is found, the restore letter is not suggested.
5. The user must check the responses, fix yellow boxes and sign. The check must pass before they can sign. After they sign, the packet is saved into My papers.
6. Control: If the agent tries to make the packet before the user signature or the checker returned errors are not fixed, the application code prevents that. The application code also ensures that the deadline rules and county rules are followed and not made up.
7. Watcher: After a letter is saved or the response packet is prepared, the next time the user opens the app, the watcher warns the user of any deadlines if approaching in 7 days or less and let the user confirm if they have acted on it. If the user records a new event or letter, the watcher applies the deadline and county-mistake rules and, if there is an issue, offers a button to start the AI helper for the hearing request and restore letter.

## 2. Tools

How the loop works: Claude thinks; tools are its hands. Claude asks the loop to run a tool, the code checks this file, runs the tool, removes pii if needed, and sends it back. Every tool returns { ok: true, ... } or { ok: false, reason }.

Two kinds of refusal:

Soft refuse: the tool returns { ok: false, reason }, the loop logs it, and Claude can try something else.
Hard stop: the loop ends and the user sees a plain message. Used only for build_packet, blanking failures, lost internet, and the limits in Section 5.

Unless an entry says “hard stop,” a failed precondition is a soft refuse.

get_letter

What it does: returns the pii redacted text, type and confirmed facts of the letter that started this response.
Inputs: letter_id (text)
Output: { ok: true, letter_id, letter_type, piiredacted_text, confirmed_facts } or { ok: false, reason }
Preconditions (checked in code, not by the AI):
letter exists
privacy consent is yes (not phone-only mode)
text is blanked by the loop before it is returned
If a precondition fails: soft refuse. If blanking itself fails, hard stop.
Why it is not locked: read only.

get_timeline

What it does: returns the events the user recorded for this letter. An empty list is a normal result.
Inputs: letter_id (text)
Output: { ok: true, events: [{ date, event_type, note_blanked }] } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter exists
privacy consent is yes
notes are blanked by the loop before return
If a precondition fails: soft refuse. If pii redaction fails, hard stop.
Why it is not locked: read only.

list_papers

What it does: lists the papers in My papers with their IDs, redacted names and dates added. No text. An empty list is a normal result.
Inputs: none
Output: { ok: true, papers: [{ paper_id, name_blanked, date_added }] } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

privacy consent is yes
names are redacted by the loop before return
If a precondition fails: soft refuse. If blanking fails, hard stop.
Why it is not locked: read only.

get_paper_text

What it does: returns the pii redacted text of one paper so Claude can tell what kind of paper it is.
Inputs: paper_id (text)
Output: { ok: true, paper_id, piiredacted_text } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

paper exists
privacy consent is yes
text is pii redacted by the loop before return
If a precondition fails: soft refuse (for example “no such paper”). If pii redaction fails, hard stop.
Why it is not locked: read only.

request_photo

What it does: opens the camera so the user can photograph a missing paper. Cancelling is a normal result.
Inputs: paper_name (text)
Output: { ok: true, paper_id } or { ok: false, reason: “cancelled” }
Preconditions (checked in code, not by the AI):

none
If a precondition fails: n/a.
Why it is not locked: the user takes the photo, and it stays on the phone.

check_county_mistake

What it does: compares timeline events with the letter dates using the county-mistake rules loaded by the code. No events, or no mistake, is a normal result.
Inputs: letter_id (text)
Output: { ok: true, mistake_found: true, mistake_id, mistake_type, plain_words } or { ok: true, mistake_found: false } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter exists
If a precondition fails: soft refuse.
Why it is not locked: it only reads and reports.

request_photo

What it does: opens the camera so the user can photograph a missing paper. Cancelling is a normal result.
Inputs: paper_name (text)
Output: { ok: true, paper_id } or { ok: false, reason: “cancelled” }
Preconditions (checked in code, not by the AI):

none
If a precondition fails: n/a.
Why it is not locked: the user takes the photo, and it stays on the phone.

check_county_mistake

What it does: compares timeline events with the letter dates using the county-mistake rules loaded by the code. No events, or no mistake, is a normal result.
Inputs: letter_id (text)
Output: { ok: true, mistake_found: true, mistake_id, mistake_type, plain_words } or { ok: true, mistake_found: false } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter exists
If a precondition fails: soft refuse.
Why it is not locked: it only reads and reports.

draft_hearing_request

What it does: for MC 239 A letters only, creates a draft hearing request. Claude supplies the reason for disagreeing; the code fills in case number, dates and county from the confirmed facts. If this run already has a hearing request draft for the letter, the new draft replaces it.
Inputs: letter_id (text), reason_text (text)
Output: { ok: true, draft_id } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter exists and letter_type is MC 239 A
reason_text contains no date that is not in the confirmed facts or the timeline
If a precondition fails: soft refuse, so Claude can rewrite the reason. Date rejections have their own counter (Section 5).
Why it is not locked: it is only a draft the review screen shows before anything is approved.

draft_restore_letter

What it does: creates a draft restore letter for a mistake found by check_county_mistake. Claude supplies the plain-words reason; the code fills in case number, dates, county and the law citations stored in the county-mistake rules. If this run already has a restore letter draft for the letter, the new draft replaces it.
Inputs: letter_id (text), mistake_id (text), reason_text (text)
Output: { ok: true, draft_id } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter_type is MC 239 A
mistake_id was returned by check_county_mistake for this letter
reason_text contains no date that is not in the confirmed facts or the timeline
If a precondition fails: soft refuse. A restore letter is never drafted when no mistake was found.
Why it is not locked: it is only a draft shown on the review screen.

propose_packet

What it does: saves Claude’s suggested papers and drafts as a proposal. Nothing is approved yet. If the letter already has an approved packet from an earlier run, this starts a new proposal based on it; approved_version is bumped and the old check result and signature are cleared.
Inputs: letter_id (text), paper_ids (list), draft_ids (list)
Output: { ok: true, packet_id } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

letter exists
every paper_id exists in My papers
paper_ids has at most 10 entries
every draft_id exists and was drafted for this letter
If a precondition fails: soft refuse.
Why it is not locked: a proposal is only a suggestion until the review screen approves it.

run_checker

What it does: compares the facts on the drafted forms with the letter’s confirmed facts and reports mismatches as yellow boxes. The code stores the result with the current version. A pass with no yellow boxes is a normal result.
Inputs: packet_id (text)
Output: { ok: true, pass: true, version } or { ok: true, pass: false, version, yellow_boxes: [{ yellow_box_id, form, field, found, expected }] } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

a proposed or approved packet with this packet_id exists
If a precondition fails: soft refuse.
Why it is not locked: it only reads and reports.

open_review_screen

What it does: shows the user the proposed papers, the draft reasons and any yellow boxes. They can add or remove papers, edit reasons and fix yellow boxes. The screen does not allow more than 10 papers; the user is told at the limit, and this is not a tool refusal. On Done, the code bumps approved_version, clears the stored check result and signature, reruns the checker and stores the new result. Cancelling is a normal result.
Inputs: packet_id (text), explanations (list of { yellow_box_id, plain_words })
Output: { ok: true, approved_version, changed: true/false, check: pass/fail } or { ok: false, reason: “cancelled” }
Preconditions (checked in code, not by the AI):

a proposed or approved packet with this packet_id exists
every explanation refers to a real yellow box from the last check
no explanation contains a date that is not in the confirmed facts or the timeline
If a precondition fails: soft refuse, so Claude can fix the explanations.
Why it is not locked: it is the user’s hand, not Claude’s. Claude only opens it and supplies plain-word explanations.

ask_user_to_sign

What it does: asks the user to sign on the signature pad. The pad hands the signature straight to the code, stamped with the current approved version. Declining is a normal result.
Inputs: packet_id (text)
Output: { ok: true, signed_version } or { ok: false, reason: “declined” }
Preconditions (checked in code, not by the AI):

an approved packet with this packet_id exists
the stored check result is pass and its version equals the current approved version
no signature is already stored for the current approved version
If a precondition fails: soft refuse.
Why it is not locked: Claude only asks. The signature never passes through Claude.

3. The locked tool
build_packet (LOCKED)

What it does: assembles the approved papers and signed drafts into the final response packet and saves it to My papers, once.
Inputs: packet_id (text)
Output: { ok: true, saved_at } or { ok: false, reason }
Preconditions (checked in code, not by the AI):

an approved packet with this packet_id exists
the stored check result is pass
the check result’s version equals the current approved version
a signature from the signature pad is stored for this packet
the signature’s version equals the current approved version
no packet has already been built for this packet_id and version
papers and drafts are read only from the stored approved packet, never from Claude
If a precondition fails: hard stop. Write the reason to the log, end the loop, and show the user a plain message with a button to reopen the review screen.
Why it is locked: it creates the final signed thing that goes to the county. Everything before it can be redone; this cannot.

How the version rule works: every Done on the review screen gives the packet a new approved_version. The check result and the signature are each stored with the version they were made against. Any edit after signing clears both, so the user must pass the check and sign again. build_packet only builds when both versions match the current one. That is the one-sentence answer to “what if the AI changes the papers after the user signs?”: it can’t, because build_packet only reads what the code stored at review and signing.

4. Never
No letter, paper or timeline text reaches Claude without consent. Every tool result is blanked by the loop before Claude sees it. Claude cannot skip this because it is not a tool.
In phone-only mode the AI helper is never offered, and all get_ tools refuse.
Claude never supplies a signature. Signatures come only from the signature pad.
Claude never passes a paper list, a draft, a rule or a signature to build_packet. Only a packet_id.
Deadline rules, county-mistake rules and law citations come only from the app’s rule tables, never from Claude.
Any reason, explanation or draft text from Claude containing a date not in the confirmed facts or the timeline is rejected.
Any edit after signing clears the signature and the check result. Nothing is built from an old signature.
build_packet never runs twice for the same packet version.
5. Limits
Max 25 tool calls per helper run. Past that, hard stop.
Max 3 ordinary soft refusals in a row (bad ID, missing packet, and so on). Past that, hard stop with the message “I got stuck. Please try the manual option.” Date rejections are not counted here.
Max 2 rewrites of a reason after a date rejection. On the third, the review screen opens with that reason blank for the user to write. The date counter resets each run.
Max 1 hearing request and 1 restore letter per run. A new draft replaces the old one.
Max 10 papers per packet. The review screen enforces this; propose_packet soft refuses above it.
Internet lost mid-run: hard stop, keep the proposal, offer to continue later or go manual.
Watcher is plain app code, runs offline, never calls Claude, and only offers the button that starts the helper.
6. Action log

Every tool call writes one line, kept on the phone, with no blanked-out fields restored:

time | tool name | inputs (IDs only, no text) | ok or refuse | reason if refused | approved_version at the time

Hard stops also log which rule from Section 4 or 5 fired. The user can view the log from My papers and delete it.
