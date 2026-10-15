from core.rules.evaluate import evaluate, load_rules
# IF the person sent the papers after the effective date and on or before the cure deadline (89 days after notice date), AND coverage wasn't restored, THEN the county shall treat it as if it is received timely (Law: W&IC 14005.37(a)., MEDIL I15-22E)
# if papers arrive on the effective date, it counts as satisfying the deadline, because the law or contract typically includes the final day up until its final minute within the permitted timeframe, and a deadline is met as long as performance occurs on or before that specified date
# IF the person sent the papers on or before the effective date, AND they got discontinued anyway, THEN the county must restore Medi-Cal benefits while they  wait for verification (MEDIL I15-22, ACWDL 11-23)

"""
RULES:
One event should contain:
* Date
* What type of event
* description of what happened
* who did the event
* Proof (yes/no), what the proof is
Kinds of events:
* County sent you the letter
* Letter arrived at your house
* You sent papers ---- IF ONLY THIS, MARK AS NEEDS PROOF
* County received papers ---- USE THIS WHEN AVAILABLE
* County sends receipt
* You receive receipt
* Coverage is restored
* Coverage is denied
Proof rule: If someone did it and has no receipt, Rule 1 still fires, but needs proof. It should be relatively easy to keep records using replyby, or make sure to take photo/video proof of sending mail. There may be a mail tracking link that can act as proof.
"""

EVENT_FIELDS = [
    "date",
    "type",
    "description",
    "subject",
    "proof"
]

KINDS = [
    "county_sent_letter",
    "letter_arrived",
    "papers_sent",
    "papers_received",
    "receipt_sent",
    "receipt_received",
    "coverage_restored",
    "coverage_denied"
]

EXAMPLE_EVENT = {
    "date": "2026-10-08",
    "type": "coverage_restored",
    "description": "The county received your papers and your MediCal has been restored.",
    "subject": "Billy bob jr.",
    "proof": "pdf of email/letter sent by county"
}

def find_papers(events):
    needs_proof = True
    received_date = None
    sent_date = None
    sent_proof = ""
    for event in events:
        if event["type"] == "papers_received":
            received_date = event["date"]
        elif event["type"] == "papers_sent":
            sent_date = event["date"]
            if event["proof"] != "":
                sent_proof = event["proof"]
    if received_date:
        papers_date = received_date
        needs_proof = False
    elif sent_date:
        papers_date = sent_date
        needs_proof = sent_proof == ""
    else:
        return (None, None)
    return (papers_date, needs_proof)

def check_rule_1(events, effective_date):
    papers_date, needs_proof = find_papers(events)
    if papers_date is None:
        return None
    covered_denied_event = False
    for event in events:
        if event["type"] == "coverage_denied":
                    covered_denied_event = True
    if covered_denied_event == False:
        return None
    if papers_date <= effective_date:
        return {
                    "rule": 1,
                    "date": papers_date,
                    "needs_proof": needs_proof,
                    "citation": "MEDIL I15-22, ACWDL 11-23",
                    "reason": "Coverage was denied even though papers were sent in time."
                }
    else:
        return None

def check_rule_2(events, notice_date, effective_date):
    papers_date, needs_proof = find_papers(events)
    if papers_date is None:
        return None
    results = evaluate(load_rules(), "MC_239A", {"notice_date": notice_date}, notice_date)
    by_id = {r["id"]: r for r in results}
    cure_deadline = by_id["document_request_coverage_stopped"]["date"]
    if papers_date > effective_date and papers_date <= cure_deadline:
        for event in events:
            if event["type"] == "coverage_restored":
                return None
        return {
            "rule": 2,
            "date": papers_date,
            "needs_proof": needs_proof,
            "citation": "W&IC 14005.37(a), MEDIL I15-22EE",
            "reason": "Papers came in during the 90-day cure period, but coverage was not restored. If your coverage isn't back soon, check with your county." # we should allow some time for the county to process, but firing right away to let the user know they are in the right.
        }
    else:
        return None