"""Makes a printable kit for filming the stop-letter (MC 239 A) flow: Gloria Lee's
whole story, built around the same letter as data/synthetic/test-letters.pdf
page 1 (the one in the video's opening), so the letter on screen matches.

    .venv/bin/python data/make_denial_kit.py        (Windows: .venv\\Scripts\\python)

Writes data/synthetic/denial-kit.pdf:
  page 1       the role card: who Gloria is, her money, what happened
  page 2       divider: PART 1, the letter the county mailed you
  pages 3-4    the Notice of Action (MC 239 A) and the hearing rights page (NA Back 9)
  page 5       divider: PART 2, the renewal packet
  pages 6-26   her renewal packet (MC 210 RV, 21 pages), with last year's facts
               printed in the county's "review" boxes (the app photographs
               form pages 5, 9 and 11, which are kit pages 10, 14 and 16)
  page 27      divider: PART 3, your own papers
  pages 28-30  her Social Security letter, bank statement and Medicare card

Every name, number and amount is made up. The story: her renewal was due
September 22; she mailed it on October 15, before her Medi-Cal's stop date
(October 31), and the county stopped it anyway. That is the county mistake the
app should catch.
"""

from datetime import date, timedelta

import pymupdf

import generate as g
import make_test_kit as kit
import make_test_letters as mtl

NOTICE = date(2026, 10, 7)          # the letter in the video's opening
SENT = date(2026, 10, 15)           # when she mailed her renewal back
RENEWAL_NOTICE = date(2026, 7, 24)  # the renewal packet's date (due 60 days later)

GLORIA = {
    "name": "Gloria Lee",
    "street": "5212 Alameda Ave",
    "city": "Palo Alto, CA 94301-7513",
    "phone": "(650) 555-0163",
    "born": date(1951, 6, 2),
    "case": "7X4M714",
    "worker": "Lorraine Nguyen",
    "worker_phone": "(669) 260-4088",
}
SOCIAL_SECURITY = "1,312.00"
PART_B = "202.90"
BANK = "Golden State Credit Union"
BALANCE = "2,684.17"
LAST_YEAR = {"social_security": "1,262.00", "part_b": "185.00", "bank": "2,050.00", "car": "5,200.00"}


def use_gloria():
    """The test-kit pages read these from make_test_kit; point them at Gloria."""
    kit.ROSA = GLORIA
    kit.SOCIAL_SECURITY, kit.PART_B, kit.BANK, kit.BALANCE = SOCIAL_SECURITY, PART_B, BANK, BALANCE
    kit.LAST_YEAR = LAST_YEAR
    kit.VEHICLE = "2014 Honda Civic"


def role_card(doc):
    r = GLORIA
    w = kit.words
    kit.text_page(doc, [
        ("Your role", 22, True),
        (kit.MADE_UP, 11, False),
        "",
        (f"You are {r['name']}. You were born on {w(r['born'])}.", 15, False),
        (f"You live alone at {r['street']}, {r['city']}. Your phone is {r['phone']}.", 15, False),
        ("No one moved in or out this year.", 15, False),
        "",
        ("What happened", 16, True),
        (f"Your renewal packet came in July (Part 2). It was due {w(RENEWAL_NOTICE + timedelta(days=g.RENEWAL_DAYS_TO_RESPOND))}.", 14, False),
        (f"You mailed it back on {w(SENT)}, late, but before your Medi-Cal's stop date.", 14, False),
        (f"Then this letter came (Part 1): your Medi-Cal stops on {w(mtl.letter('MC_239A', NOTICE, 1)['discontinuance_date'])}.", 14, False),
        "",
        ("Money", 16, True),
        (f"Social Security: ${SOCIAL_SECURITY} a month, before Medicare is taken out.", 14, False),
        ("No pension, no job, no other money. Your income is the same every month.", 14, False),
        "",
        ("Things you own", 16, True),
        (f"A checking account at {BANK}, with about $2,700 in it.", 14, False),
        ("A 2014 Honda Civic, worth about $5,000. It is paid off.", 14, False),
        ("No other house or land. No life insurance.", 14, False),
        "",
        ("Health", 16, True),
        ("You have Medicare. Part B comes out of your Social Security.", 14, False),
        ("No drug plan costs, no nursing home, no other health insurance.", 14, False),
    ], top=50)


def stop_letter(doc):
    """The Notice of Action exactly as in test-letters.pdf, then the official
    hearing rights page that goes on its back."""
    facts = mtl.letter("MC_239A", NOTICE, 1)
    doc.insert_pdf(g.build_letter(facts), from_page=0, to_page=0)
    doc.insert_pdf(pymupdf.open(g.TEMPLATES / "na_back_9_eng.pdf"))
    return facts


def main():
    use_gloria()
    doc = pymupdf.open()
    role_card(doc)
    kit.divider(doc, "PART 1", "The letter the county mailed you", [
        "Notice of Action: your Medi-Cal is being stopped.",
        "The second page is your hearing rights (the back of the letter).",
        "Take a photo of the first page with ReplyBy.",
    ])
    letter = stop_letter(doc)
    kit.divider(doc, "PART 2", "Your renewal packet", [
        "The renewal form the county mailed you in July (21 pages).",
        "When ReplyBy asks for the pages the county filled in,",
        "photograph the ones it names (form pages 5, 9 and 11).",
    ])
    first_renewal_page = len(doc)
    real_today = kit.TODAY
    kit.TODAY = RENEWAL_NOTICE + timedelta(days=10)   # the packet's dates come from "today"
    renewal = kit.renewal_packet(doc)
    kit.TODAY = real_today
    kit.divider(doc, "PART 3", "Your own papers", [
        "Papers you keep at home: your Social Security letter,",
        "your bank statement and your Medicare card.",
        "Take photos of them when ReplyBy asks.",
    ])
    kit.social_security_letter(doc)
    kit.bank_statement(doc)
    kit.medicare_card(doc)

    g.OUT_DIR.mkdir(exist_ok=True)
    out = g.OUT_DIR / "denial-kit.pdf"
    doc.save(out, garbage=3, deflate=True)
    page = lambda form_page: first_renewal_page + form_page   # kit page number of a form page
    answers = [
        "What the app should find:",
        f"  Stop letter: notice {letter['notice_date']}, Medi-Cal stops {letter['discontinuance_date']}, "
        f"case {GLORIA['case']}, worker {GLORIA['worker']} {GLORIA['worker_phone']}",
        f"  Renewal packet: notice {renewal['notice_date']}, due {renewal['due_date']}",
        f"  County pages: form page 5 = kit page {page(5)}, page 9 = kit page {page(9)}, page 11 = kit page {page(11)}",
        f"  Social Security letter: ${SOCIAL_SECURITY} a month, Part B ${PART_B}",
        f"  Bank statement: {BANK}, ending balance ${BALANCE}",
        f"  Medicare card: {kit.MEDICARE_NUMBER}",
        f"  Story: renewal mailed {SENT}, before the stop date, so the county made a mistake.",
    ]
    (g.OUT_DIR / "denial-kit-answers.txt").write_text("\n".join(answers) + "\n", encoding="utf-8")
    print("\n".join(answers))
    print(f"\n{len(doc)} pages. Print {out}")


if __name__ == "__main__":
    main()
