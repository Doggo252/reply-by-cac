"""Makes a printable test kit for a user test: one person's whole story.

    .venv/bin/python data/make_test_kit.py                 (Windows: .venv\\Scripts\\python)
    .venv/bin/python data/make_test_kit.py --second-round  (adds an MC 355 at the end)

Writes data/synthetic/test-kit.pdf, in two clearly marked parts:
  page 1       the role card for the tester ("You are Rosa Delgado...")
  page 2       divider: PART 1, the letter the county mailed you
  pages 3-23   Rosa's whole renewal packet, all 21 pages of the MC 210 RV,
               with what the county prints on it (last year's facts)
  page 24      divider: PART 2, your own papers
  pages 25-27  her Social Security letter, bank statement and Medicare card
  (--second-round adds a divider and a 3-page Request for Information, MC 355)

Every name, number and amount is made up. That is said once, on the role card
and the dividers, not on the papers themselves, so the app reads them the way
it would read real ones. The numbers match the role card, so the app's photo
reading can be checked against it. Dates are worked out from today.
"""

import random
import sys
from datetime import date, timedelta

import pymupdf

import generate as g

TODAY = date.today()
ROSA = {
    "name": "Rosa Delgado",
    "street": "1240 Broadway",
    "city": "Sunnyvale, CA 94086",
    "phone": "(408) 555-0142",
    "born": date(1953, 3, 14),
    "case": "7Q2M118",
    "worker": "Ana Ruiz",
    "worker_phone": "(408) 555-0188",
}
# This year's facts (on her own papers) ...
SOCIAL_SECURITY = "1,240.00"
PART_B = "185.00"
BANK = "Golden State Credit Union"
BALANCE = "2,312.45"
MEDICARE_NUMBER = "1EG4-TE5-MK73"  # the made-up number Medicare uses in its own examples
# ... and last year's, which the county printed in the renewal packet for her to check.
LAST_YEAR = {"social_security": "1,190.00", "part_b": "174.70", "bank": "1,850.00", "car": "4,500.00"}

PAGE = (612, 792)
MADE_UP = "Everything in this kit is made up for a test of the ReplyBy app."


def words(d):
    """A date the way a letter writes it: October 5, 2026."""
    return f"{d:%B} {d.day}, {d.year}"


def text_page(doc, lines, top=60, size=12):
    """A plain page. Each line is text, or (text, size, bold)."""
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    y = top
    for line in lines:
        text, line_size, bold = line if isinstance(line, tuple) else (line, size, False)
        if text == "":
            y += line_size * 0.8
            continue
        rect = pymupdf.Rect(60, y, PAGE[0] - 60, y + 200)
        used = page.insert_textbox(rect, text, fontsize=line_size, fontname="hebo" if bold else "helv")
        # insert_textbox returns the space left; work out the height used.
        height = 200 - used if used >= 0 else line_size * 1.3
        y += max(height, line_size * 1.3) + 2
    return page


def divider(doc, part, title, lines):
    """A page that says what comes next, in big letters, with a box around it."""
    page = text_page(doc, [(part, 20, True), (title, 30, True), ""] + [(line, 15, False) for line in lines] + ["", (MADE_UP, 11, False)], top=230)
    page.draw_rect(pymupdf.Rect(40, 200, PAGE[0] - 40, 600), color=(0.12, 0.31, 0.55), width=4)


def role_card(doc):
    r = ROSA
    text_page(doc, [
        ("Your role for this test", 22, True),
        (MADE_UP, 11, False),
        "",
        (f"You are {r['name']}. You were born on {words(r['born'])}.", 15, False),
        (f"You live alone at {r['street']}, {r['city']}. Your phone is {r['phone']}.", 15, False),
        ("No one moved in or out this year.", 15, False),
        "",
        ("Money", 16, True),
        (f"Social Security: ${SOCIAL_SECURITY} a month, before Medicare is taken out.", 14, False),
        ("No pension, no job, no other money. Your income is the same every month.", 14, False),
        ("No one gives you free rent, utilities or food.", 14, False),
        "",
        ("Things you own", 16, True),
        (f"A checking account at {BANK}, with about $2,300 in it.", 14, False),
        ("A 2012 Toyota Corolla, worth about $4,000. It is paid off.", 14, False),
        ("No other house or land. No life insurance.", 14, False),
        "",
        ("Health", 16, True),
        ("You have Medicare. Part B comes out of your Social Security.", 14, False),
        ("You pay $35 a month for a drug plan (Part D).", 14, False),
        ("You do not live in a nursing home. No other health insurance.", 14, False),
        "",
        ("Your papers", 16, True),
        ("Part 1: the renewal packet the county mailed you (21 pages).", 14, False),
        ("Part 2: your own papers from home: your Social Security letter, your bank statement and your Medicare card.", 14, False),
        "",
        ("Your task", 16, True),
        ("Use ReplyBy to get your renewal ready to mail.", 15, True),
        ("Think out loud as you go: say what you are looking for and what you expect.", 13, False),
    ], top=50)


def county_pen():
    return {"writing": "printed", "font": g.PRINT_FONTS[0] if g.PRINT_FONTS else None, "color": (0, 0, 0), "scale": 1.0}


def renewal_packet(doc):
    """The whole MC 210 RV as the county mails it: page 1 made by the letter
    generator (the page the app photographs), then pages 2 to 21 with last
    year's facts printed in the "review" boxes for Rosa to check."""
    rng = random.Random("test-kit-renewal")
    facts = g.make_facts("MC210_RV", rng)
    notice = TODAY - timedelta(days=10)
    facts.update({
        "county": "Santa Clara",
        "notice_for": ROSA["name"],
        "address": (ROSA["street"], ROSA["city"]),
        "notice_date": notice,
        "due_date": notice + timedelta(days=g.RENEWAL_DAYS_TO_RESPOND),
        "case_number": ROSA["case"],
        "worker_name": ROSA["worker"],
        "worker_phone": ROSA["worker_phone"],
        "household": [(ROSA["name"], ROSA["born"])],
        "office_name": "Santa Clara County Medi-Cal Office",
        "office_address": ("1867 Senter Rd", "San Jose, CA 95112"),
        "office_phone": "(408) 555-0100",
        "hard_case": "",
        "pen": county_pen(),
    })
    doc.insert_pdf(g.build_letter(facts), from_page=0, to_page=0)

    # Pages 2 to 21: what the county already has on file, printed by its computer.
    on_file = {
        "contact_name": ROSA["name"],
        "contact_home_street": ROSA["street"],
        "contact_home_address": ROSA["city"],
        "contact_phone": ROSA["phone"],
        "contact_written": "English",
        "contact_speak": "English",
        "Case holder's name": ROSA["name"],
        "Case holder's name2": ROSA["name"],
        "household_name_1": ROSA["name"],
        "household_relation_1": "Self",
        "household_address_1": f"{ROSA['street']}, {ROSA['city']}",
        "income_name_1": ROSA["name"],
        "income_source_1": "Social Security",
        "income_gross_1": LAST_YEAR["social_security"],
        "income_often_1": "Monthly",
        "expenses_name_1": ROSA["name"],
        "expenses_type_1": "Medicare Part B premium",
        "expenses_amount_1": LAST_YEAR["part_b"],
        "expenses_often_1": "Monthly",
        "resources_name_1": ROSA["name"],
        "resources_type_1": "Checking account",
        "resources_details_1": BANK,
        "resources_amount_1": LAST_YEAR["bank"],
        "resources_name_2": ROSA["name"],
        "resources_type_2": "Vehicle",
        "resources_details_2": "2012 Toyota Corolla",
        "resources_amount_2": f"{LAST_YEAR['car']} / 0.00",
        "medicare_name_1": ROSA["name"],
        "medicare_parta_1": "0.00",
        "medicare_partb_1": LAST_YEAR["part_b"],
    }
    form = pymupdf.open(g.TEMPLATES / "mc210rv_eng.pdf")
    for page in form:
        for widget in page.widgets():
            if widget.field_name in on_file:
                widget.field_value = on_file[widget.field_name]
                widget.text_font = "Cour"
                widget.text_fontsize = 9
                widget.update()
    form.bake()
    doc.insert_pdf(form, from_page=1, to_page=len(form) - 1)
    return facts


def social_security_letter(doc):
    sent = TODAY - timedelta(days=25)
    after = f"{float(SOCIAL_SECURITY.replace(',', '')) - float(PART_B):,.2f}"
    text_page(doc, [
        ("Social Security Administration", 18, True),
        ("Retirement, Survivors and Disability Insurance", 11, False),
        "",
        (f"Date: {words(sent)}", 12, False),
        "",
        (ROSA["name"].upper(), 12, False),
        (ROSA["street"], 12, False),
        (ROSA["city"], 12, False),
        "",
        ("Your Benefit Amount", 15, True),
        "",
        ("This letter tells you how much you get each month from Social Security.", 12, False),
        "",
        (f"Your monthly benefit before deductions is ${SOCIAL_SECURITY}", 13, False),
        (f"The amount we deduct for Medicare medical insurance is ${PART_B}", 13, False),
        (f"The amount you will receive after deductions is ${after}", 13, False),
        "",
        ("You will receive this amount on the second Wednesday of each month.", 12, False),
        ("Keep this letter. You may need it to show how much you get.", 12, False),
    ])


def bank_statement(doc):
    last = TODAY.replace(day=1) - timedelta(days=1)
    first = last.replace(day=1)
    text_page(doc, [
        (BANK, 18, True),
        ("Member statement", 12, False),
        "",
        (f"Statement period: {words(first)} - {words(last)}", 12, False),
        "",
        (ROSA["name"].upper(), 12, False),
        (ROSA["street"], 12, False),
        (ROSA["city"], 12, False),
        "",
        ("Checking account ending in 4417", 13, True),
        "",
        ("Beginning balance        $2,104.10", 12, False),
        ("Deposits                 $1,055.00", 12, False),
        ("Withdrawals                $846.65", 12, False),
        (f"Ending balance           ${BALANCE}", 13, True),
        "",
        ("Thank you for banking with us.", 11, False),
    ])


def medicare_card(doc):
    page = doc.new_page(width=PAGE[0], height=PAGE[1])
    card = pymupdf.Rect(106, 150, 506, 400)
    page.draw_rect(card, color=(0.1, 0.2, 0.5), width=3)
    page.draw_rect(pymupdf.Rect(card.x0, card.y0, card.x1, card.y0 + 50), color=None, fill=(0.75, 0.1, 0.1))
    page.insert_text((card.x0 + 20, card.y0 + 33), "MEDICARE HEALTH INSURANCE", fontsize=18, fontname="hebo", color=(1, 1, 1))
    lines = [
        ("Name/Nombre", 9, False), (ROSA["name"].upper(), 16, True),
        ("Medicare Number/Numero de Medicare", 9, False), (MEDICARE_NUMBER, 18, True),
        ("Entitled to                Coverage starts", 9, False),
        ("HOSPITAL (PART A)       03-01-2018", 12, False),
        ("MEDICAL (PART B)         03-01-2018", 12, False),
    ]
    y = card.y0 + 75
    for text, size, bold in lines:
        page.insert_text((card.x0 + 20, y), text, fontsize=size, fontname="hebo" if bold else "helv")
        y += size + 9


def mc355(doc):
    rng = random.Random("test-kit-mc355")
    facts = g.make_facts("MC355", rng)
    notice = TODAY - timedelta(days=6)
    facts.update({
        "county": "Santa Clara",
        "notice_for": ROSA["name"],
        "address": (ROSA["street"], ROSA["city"]),
        "notice_date": notice,
        "due_date": notice + timedelta(days=30),
        "case_number": ROSA["case"],
        "worker_name": ROSA["worker"],
        "worker_phone": ROSA["worker_phone"],
        "hard_case": "",
        "pen": county_pen(),
    })
    doc.insert_pdf(g.build_letter(facts), from_page=0, to_page=0)
    # Pages 2 and 3 of the official form, with two boxes checked by the county.
    form = pymupdf.open(g.TEMPLATES / "mc355_eng.pdf")
    for page in form:
        for widget in page.widgets():
            name = widget.field_name or ""
            if name.startswith("Proof of social security benefits") or name.startswith("A copy of your most recent bank statement"):
                widget.field_value = widget.on_state()
                widget.update()
    form.bake()
    doc.insert_pdf(form, from_page=1, to_page=2)
    return facts


def main():
    second_round = "--second-round" in sys.argv
    doc = pymupdf.open()
    role_card(doc)
    divider(doc, "PART 1", "The letter the county mailed you", [
        "Your Medi-Cal renewal packet: all 21 pages, as it came in the mail.",
        "Take a photo of the first page with ReplyBy.",
    ])
    renewal = renewal_packet(doc)
    divider(doc, "PART 2", "Your own papers", [
        "Papers you keep at home: your Social Security letter,",
        "your bank statement and your Medicare card.",
        "Take photos of them when ReplyBy asks.",
    ])
    social_security_letter(doc)
    bank_statement(doc)
    medicare_card(doc)
    request = None
    if second_round:
        divider(doc, "SECOND ROUND", "Another letter from the county", ["A Request for Information (3 pages)."])
        request = mc355(doc)
    g.OUT_DIR.mkdir(exist_ok=True)
    out = g.OUT_DIR / "test-kit.pdf"
    doc.save(out, garbage=3, deflate=True)
    answers = [
        "What the app should find:",
        f"  Renewal letter: notice {renewal['notice_date']}, due {renewal['due_date']}, case {ROSA['case']}, worker {ROSA['worker']} {ROSA['worker_phone']}",
        f"  Social Security letter: ${SOCIAL_SECURITY} a month, Part B ${PART_B}",
        f"  Bank statement: {BANK}, ending balance ${BALANCE}",
        f"  Medicare card: {MEDICARE_NUMBER}",
    ]
    if request:
        answers.append(
            f"  MC 355: notice {request['notice_date']}, due {request['due_date']}; checked boxes: Social Security proof, bank statement"
        )
    (g.OUT_DIR / "test-kit-answers.txt").write_text("\n".join(answers) + "\n", encoding="utf-8")
    print("\n".join(answers))
    print(f"\n{len(doc)} pages. Print {out}")


if __name__ == "__main__":
    main()
