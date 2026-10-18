"""Makes fake Medi-Cal letters for training and testing the letter classifier.

Every choice about WHAT varies comes from data/generator_design.md, which Neil
wrote. This file only does the drawing. Each setting below says which part of
the design it comes from.

Run from the repository root:
    .venv/bin/python data/generate.py --per-type 800

It writes:
    data/synthetic/images/*.jpg   one photo-like picture per fake letter
    data/synthetic/labels.csv     the answer key: the true value of every blank

The generator picks every fake value itself, so it already knows the right
answer for each letter. That is where labels.csv comes from.
"""

import argparse
import calendar
import csv
import random
from datetime import date, timedelta
from pathlib import Path

import pymupdf
import io

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = Path(__file__).parent
TEMPLATES = HERE / "templates"
OUT_DIR = HERE / "synthetic"

# The fake letters are dated around this day. Fixed, so that running the
# generator twice with the same seed makes exactly the same letters.
BASE_DATE = date(2026, 9, 18)

# How sharp the pictures are. 150 dots per inch is enough for text reading
# (OCR) to work on the small print.
DPI = 150

# Design, "App design decisions": mix of both MC 239 layouts, 30% CalSAWS
# and 70% the 2007 form. (Confirmed by Neil on 2026-09-18.)
CALSAWS_SHARE = 0.30

# Design, "App design decisions": five photo types, 20% each.
PHOTO_EFFECTS = ["clean", "tilt", "thumb", "blur_shadow_fold", "bottom_cut"]

# The design lists hard cases for each letter but not how many letters get
# one. Assumption: 10% of each letter type. Change it here.
HARD_CASE_SHARE = 0.10

# Design, "App design decisions": 20% handwritten, 80% printed. The real
# letters were all printed. (The CalSAWS layout is printed entirely by
# computer, so it is never handwritten.)
HANDWRITTEN_SHARE = 0.2

# Fonts already on a Mac or a Windows PC, so nothing has to be downloaded.
# Any that are missing are skipped, so a Mac uses only the Mac ones (and
# makes the same letters as before) and Windows uses only the Windows ones.
# The forms' own printed words are Arial; the filled-in values vary, because
# we do not yet know what a real county printer uses.
SYSTEM_FONTS = Path("/System/Library/Fonts")
WINDOWS_FONTS = Path("C:/Windows/Fonts")
PRINT_FONTS = [SYSTEM_FONTS / "Supplemental" / name for name in
               ["Courier New.ttf", "Times New Roman.ttf", "Arial.ttf", "Verdana.ttf", "Tahoma.ttf"]]
PRINT_FONTS += [WINDOWS_FONTS / name for name in ["cour.ttf", "times.ttf", "arial.ttf", "verdana.ttf", "tahoma.ttf"]]
HANDWRITING_FONTS = [SYSTEM_FONTS / "Supplemental" / "Bradley Hand Bold.ttf",
                     SYSTEM_FONTS / "Supplemental" / "ChalkboardSE.ttc",
                     SYSTEM_FONTS / "Noteworthy.ttc"]
HANDWRITING_FONTS += [WINDOWS_FONTS / name for name in ["segoesc.ttf", "segoepr.ttf", "Inkfree.ttf"]]
PRINT_FONTS = [f for f in PRINT_FONTS if f.exists()]
HANDWRITING_FONTS = [f for f in HANDWRITING_FONTS if f.exists()]
# The bold font for the "received" stamp.
BOLD_FONT = next((f for f in [SYSTEM_FONTS / "Supplemental" / "Arial Bold.ttf", WINDOWS_FONTS / "arialbd.ttf"]
                  if f.exists()), None)
# Pen colors for handwriting: black, blue, dark blue.
INK_COLORS = [(0.05, 0.05, 0.05), (0.1, 0.2, 0.6), (0.05, 0.1, 0.35)]

# Design, "App design decisions": 5 to 30 days to respond. (The real MC 355
# gave 12.) The app reads the date off the letter instead of assuming.
MC355_DAYS_TO_RESPOND = (5, 30)

# Not in the design, and no source found yet. Assumption: 60 days to return
# the renewal form. Check this against a real MC 210 RV.
RENEWAL_DAYS_TO_RESPOND = 60

# Design: a discontinuance notice is mailed at least 10 days before it takes
# effect.
MIN_DAYS_NOTICE_BEFORE_EFFECTIVE = 10

# The answer key columns. Design, "What the app should check for". The last
# four (layout, photo_effect, hard_case, writing) are extra: they let the accuracy
# tables in week 3 say which kinds of letters the app gets wrong.
LABEL_COLUMNS = [
    "filename", "letter_type", "due_date", "discontinuance_month", "notice_date",
    "case_number", "worker_name", "worker_id", "worker_fax", "worker_phone",
    "office_hours", "notice_for", "layout", "photo_effect", "hard_case", "writing",
]

LETTER_TYPES = ["MC_239A", "MC355", "MC210_RV", "OTHER"]

# Design, "Fourth type": the OTHER pile is anything that is not one of the
# three letters. Numbers are from the design, out of 800, based on how often
# each would really get photographed.
OTHER_SPLIT = [
    ("approval", 200),        # fake approval notices, modeled on a real one
    ("mc355_inner", 150),     # pages 2 and 3 of the MC 355
    ("mc210rv_inner", 150),   # pages 2 onward of the MC 210 RV
    ("na_back_9", 100),       # the hearing rights page on the back of notices
    ("mc216", 60),
    ("mc217", 40),
    ("mc382", 40),
    ("mc380", 30),
    ("hearing_form", 30),     # DHCS 8249, the state hearing request
]
# One kind per OTHER letter, in a fixed shuffled order, so 800 letters get
# exactly the design's numbers.
OTHER_SCHEDULE = [kind for kind, count in OTHER_SPLIT for _ in range(count)]
random.Random("other-schedule").shuffle(OTHER_SCHEDULE)

# Which template file each blank-page kind comes from, and which pages count.
# None means "any page, but mostly page 1", since page 1 is what people
# photograph.
OTHER_TEMPLATES = {
    "mc355_inner": ("mc355_eng.pdf", "inner"),
    "mc210rv_inner": ("mc210rv_eng.pdf", "inner"),
    "na_back_9": ("na_back_9_eng.pdf", None),
    "mc216": ("mc216_eng.pdf", None),
    "mc217": ("mc217_eng.pdf", None),
    "mc382": ("mc382.pdf", None),
    "mc380": ("mc380.pdf", None),
    "hearing_form": ("state_hearing_request.pdf", None),
}

# ----------------------------------------------------------------------------
# Lists of fake values to pick from
# ----------------------------------------------------------------------------

FIRST_NAMES = [
    "Maria", "Jose", "Linh", "Wei", "Priya", "James", "Rosa", "Nguyen", "Carmen",
    "Robert", "Mei", "Arturo", "Esperanza", "Thanh", "Mohammed", "Patricia",
    "Ramon", "Hoa", "Gloria", "David", "Sunita", "Manuel", "Lorraine", "Anh",
    "Teresa", "William", "Guadalupe", "Jun", "Fatima", "Harold",
]
LAST_NAMES = [
    "Garcia", "Nguyen", "Chen", "Lopez", "Tran", "Patel", "Smith", "Hernandez",
    "Wong", "Martinez", "Le", "Johnson", "Ramirez", "Pham", "Singh", "Reyes",
    "Kim", "Flores", "Huang", "Torres", "Davis", "Morales", "Castillo", "Lee",
    "Gonzalez", "Vu", "Santos", "Cruz", "Liu", "Brown",
]
# Hard case (MC 210 RV): names long enough to wrap or get cut off.
LONG_NAMES = [
    "Maria Guadalupe Hernandez-Villalobos",
    "Nguyen Thi Thanh Huong Tran-Pham",
    "Esperanza Concepcion Rodriguez de la Cruz",
    "Venkatasubramanian Ramachandran Iyer",
]

# Design: the two counties in the district.
COUNTIES = {
    "Santa Clara": {"code": "43", "cities": {
        "San Jose": "95112", "Mountain View": "94040", "Sunnyvale": "94086",
        "Santa Clara": "95050", "Palo Alto": "94301", "Milpitas": "95035",
        "Cupertino": "95014", "Gilroy": "95020"}},
    "San Mateo": {"code": "41", "cities": {
        "Redwood City": "94063", "San Mateo": "94401", "Daly City": "94014",
        "East Palo Alto": "94303", "South San Francisco": "94080",
        "Menlo Park": "94025"}},
}
STREETS = ["Main St", "El Camino Real", "Alameda Ave", "Monroe St", "Castro St",
           "Bayshore Rd", "Miramonte Ave", "Story Rd", "King Rd", "Middlefield Rd",
           "Oak St", "Mission St", "Broadway", "Tully Rd"]

# Design: worker phone is usually 650, 669 or 408.
LOCAL_AREA_CODES = ["408", "650", "669"]
# Hard case (MC 355): a worker phone from somewhere else.
OTHER_AREA_CODES = ["916", "510", "415", "209", "831"]

# Design, MC 239 A reasons, with the Title 22 sections from ACWDL 25-14.
MISSING_ITEMS = [
    "proof of income", "bank statements for the last 3 months",
    "proof of your home address", "life insurance policy",
    "vehicle registration", "proof of Medicare premium",
    "retirement account statement", "property tax statement",
]
PROPERTY_ITEMS = ["bank accounts", "vehicles", "real estate", "life insurance"]
TITLE_22_SECTIONS = "50175 and 50179"


# ----------------------------------------------------------------------------
# Small helpers that make one fake value each
# ----------------------------------------------------------------------------

def fake_name(rng):
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def fake_phone(rng, area_codes):
    area = rng.choice(area_codes)
    return f"({area}) {rng.randint(200, 999)}-{rng.randint(0, 9999):04d}"


LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"  # no I, O or Q, which look like digits


def fake_case_number(rng, county=None):
    # Design, "What the real letters look like": digit, letter, digit,
    # letter, then 3 digits (#L#L###), with no county code.
    d = lambda: rng.choice("0123456789")
    l = lambda: rng.choice(LETTERS)
    return d() + l() + d() + l() + d() + d() + d()


def fake_worker_id(rng):
    # Design, real letters: one letter then 3 digits (L###).
    return rng.choice(LETTERS) + f"{rng.randint(0, 999):03d}"


def fake_office_hours(rng, use_24_hour=False):
    start = rng.choice([7, 8, 8, 8, 9])
    end = rng.choice([4, 5, 5, 5, 6])
    if use_24_hour:
        # Hard case (MC 239 A): office hours in 24-hour time.
        return f"{start:02d}:00 - {end + 12:02d}:00"
    # Design, real letters: a morning block and an afternoon block, with the
    # office closed for lunch. Most letters use that; some a single block.
    if rng.random() < 0.75:
        return f"{start}:00 AM- 12:00 PM, 1:00 PM - {end}:00 PM"
    return f"{start}:00 AM - {end}:00 PM"


def fake_address(rng, county):
    city, zip_code = rng.choice(list(COUNTIES[county]["cities"].items()))
    street = f"{rng.randint(10, 9999)} {rng.choice(STREETS)}"
    if rng.random() < 0.3:
        street += f" Apt {rng.randint(1, 40)}"
    # Design, real letters: 9-digit ZIP codes. One real letter had a comma
    # after the city and the other did not, so both appear.
    comma = "," if rng.random() < 0.5 else ""
    return street, f"{city}{comma} CA {zip_code}-{rng.randint(0, 9999):04d}"


def last_day_of_month(year, month):
    return date(year, month, calendar.monthrange(year, month)[1])


def first_allowed_discontinuance(notice_date):
    """The earliest month-end that is at least 10 days after the notice."""
    earliest = notice_date + timedelta(days=MIN_DAYS_NOTICE_BEFORE_EFFECTIVE)
    return last_day_of_month(earliest.year, earliest.month)


# Date styles. Design: MC 239 A and MC 355 use month-day-year numbers; the
# MC 210 RV writes the month as a word ("Month day, Year").
def date_numbers(d):
    return d.strftime("%m/%d/%Y")


def date_words(d):
    return f"{d.strftime('%B')} {d.day}, {d.year}"


# ----------------------------------------------------------------------------
# Step 1: pick the facts for one letter (this becomes its row in labels.csv)
# ----------------------------------------------------------------------------

def make_facts(letter_type, rng, index=0):
    county = rng.choice(list(COUNTIES))
    person = fake_name(rng)
    hard_case = ""
    if rng.random() < HARD_CASE_SHARE:
        hard_case = {
            "MC_239A": rng.choice(["office_hours_24h", "effective_exactly_10_days", "five_plus_reasons"]),
            "MC355": rng.choice(["out_of_area_phone", "shifted_page", "exactly_30_days"]),
            "MC210_RV": rng.choice(["long_name", "big_due_date", "diagonal_lines"]),
            "OTHER": "",  # the design gives no hard cases for the OTHER pile
        }[letter_type]

    # Design: notice date is any day in the past month or two.
    notice = BASE_DATE - timedelta(days=rng.randint(0, 60))

    facts = {
        "letter_type": letter_type,
        "county": county,
        "notice_for": person,
        "address": fake_address(rng, county),
        "notice_date": notice,
        "case_number": fake_case_number(rng, county),
        "worker_name": fake_name(rng),
        "worker_id": fake_worker_id(rng),
        "worker_phone": fake_phone(rng, LOCAL_AREA_CODES),
        "worker_fax": "",
        "office_hours": fake_office_hours(rng, use_24_hour=(hard_case == "office_hours_24h")),
        "due_date": None,
        "discontinuance_date": None,
        "layout": "",
        "hard_case": hard_case,
    }

    if letter_type == "MC_239A":
        facts["layout"] = "calsaws" if rng.random() < CALSAWS_SHARE else "2007"
        if hard_case == "effective_exactly_10_days":
            # Move the notice date so the month ends exactly 10 days later.
            month_end = first_allowed_discontinuance(notice)
            facts["notice_date"] = month_end - timedelta(days=MIN_DAYS_NOTICE_BEFORE_EFFECTIVE)
            facts["discontinuance_date"] = month_end
        else:
            facts["discontinuance_date"] = first_allowed_discontinuance(notice)
        facts["reason"] = make_reason(rng, many=(hard_case == "five_plus_reasons"))
        # CalSAWS notices carry more ID numbers than the 2007 form.
        # Design, real letters: the CalHEERS number was blank, so half are.
        facts["calheers_number"] = str(rng.randint(10_000_000, 99_999_999)) if rng.random() < 0.5 else ""
        facts["customer_id"] = str(rng.randint(1_000_000, 9_999_999))

    elif letter_type == "MC355":
        facts["layout"] = "mc355"
        days = 30 if hard_case == "exactly_30_days" else rng.randint(*MC355_DAYS_TO_RESPOND)
        facts["due_date"] = notice + timedelta(days=days)
        area_codes = OTHER_AREA_CODES if hard_case == "out_of_area_phone" else LOCAL_AREA_CODES
        facts["worker_phone"] = fake_phone(rng, area_codes)
        # Design: the fax usually shares the office's area code.
        facts["worker_fax"] = fake_phone(rng, [facts["worker_phone"][1:4]])

    elif letter_type == "OTHER":
        kind = OTHER_SCHEDULE[index % len(OTHER_SCHEDULE)]
        facts["layout"] = kind
        if kind == "approval":
            # Coverage starts on the 1st of the notice month or the month
            # before (the real approval started before its notice date).
            first = notice.replace(day=1)
            facts["start_date"] = first if rng.random() < 0.5 else (first - timedelta(days=1)).replace(day=1)
            facts["office_address"] = fake_address(rng, county)
            facts["calheers_number"] = ""
        else:
            file_name, pages = OTHER_TEMPLATES[kind]
            count = len(pymupdf.open(TEMPLATES / file_name))
            if pages == "inner":
                facts["page"] = rng.randint(1, count - 1)
            else:
                facts["page"] = 0 if rng.random() < 0.7 else rng.randint(0, count - 1)

    else:  # MC210_RV
        facts["layout"] = "mc210rv"
        facts["due_date"] = notice + timedelta(days=RENEWAL_DAYS_TO_RESPOND)
        if hard_case == "long_name":
            facts["notice_for"] = rng.choice(LONG_NAMES)
        # Everyone on the renewal. Mostly one or two people in a senior home.
        household = [facts["notice_for"]] + [fake_name(rng) for _ in range(rng.choice([0, 0, 1, 1, 2]))]
        facts["household"] = [(name, fake_birthday(rng)) for name in household]
        facts["office_name"] = f"{county} County Medi-Cal Office"
        facts["office_address"] = fake_address(rng, county)
        facts["office_phone"] = fake_phone(rng, LOCAL_AREA_CODES)

    # CalSAWS and approval notices are printed whole by the county computer,
    # and blank pages have nothing to fill in, so none of them are handwritten.
    facts["pen"] = pick_pen(rng, can_handwrite=(facts["layout"] != "calsaws" and letter_type != "OTHER"))
    # The name and address show through the envelope window, so they are
    # printed on a label even when a worker filled in the rest by hand.
    facts["label_pen"] = pick_pen(rng, can_handwrite=False)
    return facts


def pick_pen(rng, can_handwrite):
    """How this letter's blanks are filled in: printed or by hand."""
    if can_handwrite and HANDWRITING_FONTS and rng.random() < HANDWRITTEN_SHARE:
        return {"writing": "handwritten", "font": rng.choice(HANDWRITING_FONTS),
                "color": rng.choice(INK_COLORS), "scale": rng.uniform(1.0, 1.2)}
    font = rng.choice(PRINT_FONTS) if PRINT_FONTS else None
    return {"writing": "printed", "font": font, "color": (0, 0, 0), "scale": 1.0}


def make_reason(rng, many=False):
    """The reason text on a discontinuance. Design, MC 239 A reason list."""
    if many:
        # Hard case: five or more missing items, so the text runs long.
        items = rng.sample(MISSING_ITEMS, rng.randint(5, 7))
        return "You did not send the following information we asked for: " + "; ".join(items) + "."
    kind = rng.choice(["renewal", "papers", "property"])
    if kind == "renewal":
        return "You did not return your annual renewal form (MC 210 RV) by the due date."
    if kind == "papers":
        items = rng.sample(MISSING_ITEMS, rng.randint(1, 2))
        return "You did not send the following information we asked for: " + "; ".join(items) + "."
    items = rng.sample(PROPERTY_ITEMS, rng.randint(1, 3))
    return ("You did not send information about your property, which is now required "
            "for your renewal: " + ", ".join(items) + ".")


def fake_birthday(rng):
    # Senior track: mostly 65 to 95, some younger people with disabilities.
    age = rng.randint(65, 95) if rng.random() < 0.8 else rng.randint(25, 64)
    return BASE_DATE - timedelta(days=age * 365 + rng.randint(0, 364))


# ----------------------------------------------------------------------------
# Step 2: draw the letter
# ----------------------------------------------------------------------------

def page_to_image(page):
    pix = page.get_pixmap(dpi=DPI)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def printed_together(image, rng):
    """Make the form's words and the filled-in values look like one printout.

    A computer draws both perfectly sharp, which is what makes the values look
    pasted on. Real paper softens every edge the same way and has a little
    grain. So soften the whole page slightly and add faint grain to all of it.
    """
    soft = image.filter(ImageFilter.GaussianBlur(rng.uniform(0.4, 0.8)))
    grain = Image.frombytes("L", image.size, rng.randbytes(image.width * image.height)).convert("RGB")
    paper = Image.new("RGB", image.size, (rng.randint(238, 250),) * 3)
    soft = Image.blend(soft, grain, rng.uniform(0.03, 0.06))
    # Multiply by a slightly off-white paper color, so white is never pure white.
    return ImageChops.multiply(soft, paper)


def write(page, x, y, text, size=9, bold=False, color=(0, 0, 0)):
    """Put one line of text on the page. (x, y) is where the line sits."""
    page.insert_text((x, y), text, fontsize=size, fontname="hebo" if bold else "helv", color=color)


def write_box(page, rect, text, size=9, bold=False, color=(0, 0, 0)):
    """Put wrapped text inside a rectangle (x0, y0, x1, y1)."""
    page.insert_textbox(pymupdf.Rect(rect), text, fontsize=size,
                        fontname="hebo" if bold else "helv", color=color)


# The next three helpers write FILLED-IN values (names, dates, numbers) using
# the letter's pen: one of several print fonts, or a handwriting font. The
# form's own printed words are left alone.

def load_pen(page, pen):
    """Register the pen's font on this page. Returns (font name, font object)."""
    if pen["font"] is None:
        return "helv", pymupdf.Font("helv")
    page.insert_font(fontname="pen", fontfile=str(pen["font"]))
    return "pen", pymupdf.Font(fontfile=str(pen["font"]))


def fill(page, x, y, text, size, pen, rng):
    """Write one filled-in value. Handwriting wobbles a little and is a bit
    bigger, like real writing on a line."""
    fontname, _ = load_pen(page, pen)
    size *= pen["scale"]
    morph = None
    if pen["writing"] == "handwritten":
        y += rng.uniform(-1.5, 1.0)
        x += rng.uniform(-1.0, 3.0)
        # Tilt the word by up to 2 degrees around its starting point.
        morph = (pymupdf.Point(x, y), pymupdf.Matrix(rng.uniform(-2, 2)))
    opacity = rng.uniform(0.8, 0.95) if pen["writing"] == "handwritten" else 1.0
    page.insert_text((x, y), text, fontsize=size, fontname=fontname, color=pen["color"],
                     morph=morph, fill_opacity=opacity)


def fill_box(page, rect, text, size, pen):
    """Write a filled-in value that may need several lines.

    If the text does not fit, PyMuPDF writes nothing at all, so shrink the
    text until it fits rather than losing it.
    """
    fontname, _ = load_pen(page, pen)
    size *= pen["scale"]
    while page.insert_textbox(pymupdf.Rect(rect), text, fontsize=size,
                              fontname=fontname, color=pen["color"]) < 0:
        size -= 0.5
        if size < 4:
            raise ValueError(f"text does not fit in {rect}: {text[:40]}")


def printed_words(page):
    """Every piece of printed text on the page, with where it sits."""
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if span["text"].strip():
                    yield span


def label_for(box, spans):
    """The printed label just left of a form box, on the same line.

    Real printers put a value on the same line as its label, at about the same
    size. Returns (baseline y, size), or None if there is no label there.
    """
    best = None
    for span in spans:
        x0, y0, x1, y1 = span["bbox"]
        baseline = span["origin"][1]
        same_line = box.y0 + box.height * 0.3 <= baseline <= box.y1 + 1
        just_left = box.x0 - 60 <= x1 <= box.x0 + 6
        if same_line and just_left and (best is None or x1 > best["bbox"][2]):
            best = span
    if best is None:
        return None
    # The height of the printed words, turned into a font size.
    size = (best["bbox"][3] - best["bbox"][1]) / 1.15
    return best["origin"][1], min(size, box.height * 0.9, 11)


# These boxes have other text beside them that is not their label.
NO_LABEL_BOXES = {"Date to respond by", "Office start time"}


def fill_form_boxes(page, values, pen, rng, big_fields=(), label_pen=None):
    """Write values into a fillable PDF's boxes, using the pen's font.

    PDF form boxes can only show a few built-in fonts, so instead of typing
    into them, this writes the text on top of each box and then removes the
    empty box. values maps each box's name to its text.
    """
    _, font = load_pen(page, pen)
    spans = list(printed_words(page))
    for widget in list(page.widgets()):
        name, box = widget.field_name, widget.rect
        text = values.get(name, "")
        page.delete_widget(widget)
        if not text:
            continue
        if "\n" in text:
            # Multi-line boxes hold the mailing address, which is printed.
            fill_box(page, box, text, 10, label_pen or pen)
            continue
        label = None if name in NO_LABEL_BOXES else label_for(box, spans)
        if label:
            baseline, size = label
        else:
            baseline, size = box.y1 - box.height * 0.25, min(10.0, box.height * 0.7)
        # Shrink the text until it fits the box. Hard case: some boxes keep a
        # size that is too big, so the text runs past the edge.
        if name in big_fields:
            size = 14.0
        while name not in big_fields and size > 5 and \
                font.text_length(text, size * pen["scale"]) > box.width - 4:
            size -= 0.5
        fill(page, box.x0 + 2, baseline, text, size, pen, rng)


def stamp_png(county, notice_date, rng):
    """A rubber stamp as a see-through PNG: bold lines of text, maybe a
    border, in blue, purple or red ink that is patchy the way stamp ink is,
    and a little crooked."""
    font = ImageFont.truetype(str(BOLD_FONT), 46)
    lines = [f"COUNTY OF {county.upper()}", "SOCIAL SERVICES AGENCY", "MEDI-CAL PROGRAM"]
    if rng.random() < 0.5:
        lines.append(notice_date.strftime("%b %d %Y").upper())
    ink = rng.choice([(30, 50, 160), (90, 40, 130), (170, 30, 40), (20, 60, 140)])
    img = Image.new("RGBA", (960, 90 + 62 * len(lines)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rng.random() < 0.7:
        draw.rectangle([18, 18, img.width - 18, img.height - 18], outline=ink + (255,), width=7)
    for i, line in enumerate(lines):
        width = draw.textlength(line, font=font)
        draw.text(((img.width - width) / 2, 40 + i * 62), line, font=font, fill=ink + (255,))
    # Patchy ink: fade the stamp through blurred noise.
    noise = Image.frombytes("L", img.size, rng.randbytes(img.width * img.height))
    noise = noise.filter(ImageFilter.GaussianBlur(2)).point(lambda v: 90 + v * 165 // 255)
    img.putalpha(ImageChops.multiply(img.split()[3], noise))
    img = img.filter(ImageFilter.GaussianBlur(0.8)).rotate(rng.uniform(-5, 5), resample=Image.BICUBIC, expand=True)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def build_mc239a_2007(facts):
    """Fill in the 2007 blank MC 239 A. Positions measured from the PDF."""
    doc = pymupdf.open(TEMPLATES / "mc239a.pdf")
    page = doc[0]
    street, city = facts["address"]
    pen = facts["pen"]
    rng = random.Random(facts["case_number"])  # for handwriting wobble

    # Header blanks: each value goes on the same line as its printed label,
    # just to the right of it, at the label's size.
    header = {
        "Notice date:": date_numbers(facts["notice_date"]),
        "Case number:": facts["case_number"],
        "Worker name:": facts["worker_name"],
        "Worker number:": facts["worker_id"],
        "Worker telephone number:": facts["worker_phone"],
        "Office hours:": facts["office_hours"],
        "Notice for:": facts["notice_for"],
    }
    spans = list(printed_words(page))
    for label, value in header.items():
        where = page.search_for(label)[0]  # the label's exact position
        # The printed line holding the label tells us its baseline and size.
        line = next(sp for sp in spans if pymupdf.Rect(sp["bbox"]).contains(where.tl + (1, 1)))
        size = (line["bbox"][3] - line["bbox"][1]) / 1.15
        _, font = load_pen(page, pen)
        while size > 4 and where.x1 + 3 + font.text_length(value, size * pen["scale"]) > 562:
            size -= 0.25
        fill(page, where.x1 + 3, line["origin"][1], value, size, pen, rng)

    # Name and address in the window-envelope box on the left.
    fill_box(page, (80, 150, 330, 215), f"{facts['notice_for']}\n{street}\n{city}", 10, facts["label_pen"])

    # County stamp, stamped a little crooked over the bracket box.
    page.insert_image(pymupdf.Rect(398, 44, 572, 120), stream=stamp_png(facts["county"], facts["notice_date"], rng),
                      keep_proportion=True)

    # Design: only discontinuances, so only the second box is ever checked.
    fill(page, 49.5, 347, "X", 10, pen, rng)
    month = facts["discontinuance_date"].strftime("%B")
    fill(page, 462, 347, month, 10, pen, rng)

    # Reason and regulations.
    fill_box(page, (48, 440, 564, 486), facts["reason"], 9, pen)
    fill(page, 48, 513, f"Title 22, Sections {TITLE_22_SECTIONS}", 9, pen, rng)

    # Design: the Medicare month is the same as the discontinuance month.
    fill(page, 52, 562, month, 10, pen, rng)
    return doc


def build_mc239_calsaws(facts):
    """Draw a CalSAWS-style discontinuance notice.

    The CalSAWS example PDF mixes denial and discontinuance text and has a
    DRAFT watermark, so it cannot be filled in directly. This rebuilds its
    layout using only the discontinuance sentences, copied word for word from
    data/templates/calsaws_noa_example_nonmagi_disc.pdf.
    """
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    street, city = facts["address"]
    county = facts["county"]
    effective = facts["discontinuance_date"].strftime("%m/%d/%Y")
    office_street, office_city = fake_address(random.Random(facts["case_number"]), county)

    # Top of the page: return address, county name, state agency.
    write_box(page, (40, 32, 230, 70), f"{county} County Social Services\n{office_street}\n{office_city}", size=7)
    write(page, 245, 44, f"COUNTY OF {county.upper()}", size=11, bold=True)
    write_box(page, (400, 32, 580, 70),
              "STATE OF CALIFORNIA\nHEALTH AND WELFARE AGENCY\nDEPARTMENT OF SOCIAL SERVICES", size=8)

    # The ID block on the right. Two case numbers and a customer ID.
    fields = [
        ("NOTICE DATE:", facts["notice_date"].strftime("%m/%d/%Y")),
        ("CASE NAME:", facts["notice_for"]),
        ("CALHEERS CASE NUMBER:", facts["calheers_number"]),
        ("SAWS CASE NUMBER:", facts["case_number"]),
        ("WORKER NAME:", facts["worker_name"]),
        ("WORKER ID:", facts["worker_id"]),
        ("TELEPHONE NUMBER:", facts["worker_phone"]),
        ("CUSTOMER ID:", facts["customer_id"]),
    ]
    for i, (label, value) in enumerate(fields):
        y = 88 + i * 9
        write(page, 330, y, label, size=6.5, bold=label in ("WORKER NAME:", "WORKER ID:", "CUSTOMER ID:"))
        write(page, 440, y, value, size=6.5)

    # Title on the left, recipient address on the right.
    write(page, 40, 172, "NOTICE OF ACTION", size=12, bold=True)
    write(page, 40, 185, "MEDI-CAL DENIAL AND", size=8.5, bold=True)
    write(page, 40, 195, "DISCONTINUANCE", size=8.5, bold=True)
    write_box(page, (330, 165, 580, 205), f"{facts['notice_for']}\n{street}\n{city}", size=9)

    # Left column.
    left = (
        "We have reviewed your eligibility for health coverage. We used the information "
        "you gave us and state and federal data to make this decision.\n\n"
        f"As of {effective}, Medi-Cal eligibility has been discontinued for the following "
        "member(s) of your family:\n\n"
        f"Name(s):\n{facts['notice_for']}\n\n"
        f"{facts['reason']}\n\n"
        "We asked you for the information, but we have not received it and it is essential "
        "in determining your Medi-Cal eligibility."
    )
    write_box(page, (40, 240, 300, 640), left, size=8.5)
    write_box(page, (40, 650, 300, 680),
              f"Rules: These rules apply; you may review them at your local welfare office: "
              f"California Code of Regulations, Title 22, sections {TITLE_22_SECTIONS}.", size=6.5)

    # Right column, starting with the boxed hearing notice.
    hearing = ("State Hearing: If you think this action is wrong, you can ask for a hearing. "
               "The back page tells you how. Your benefits may not be changed if you ask for a "
               "hearing before this action takes place. You have only 90 days to ask for a "
               "hearing. The 90 days started the day after the county sent you this notice.")
    page.draw_rect(pymupdf.Rect(318, 236, 575, 298), color=(0.4, 0.4, 0.4), width=0.6)
    write_box(page, (322, 239, 572, 296), hearing, size=7)
    right = (
        f"Your eligibility to receive Medi-Cal will be discontinued effective {effective}.\n\n"
        f"Medi-Cal benefits will be discontinued for:\n{facts['notice_for']}\n\n"
        "Keep your plastic Benefits Identification Card (BIC). Please do not throw it away. "
        "You can use it again if you get Medi-Cal again.\n\n"
        "We used the information you gave us and our records to make our decision. If you have "
        "questions or think we made a mistake, or if you have more information to give us, "
        "call or write to your worker right away."
    )
    write_box(page, (320, 310, 575, 640), right, size=8.5)

    # Footer: form ID and page count.
    write(page, 40, 752, "MC 239/MC-MAGI-D (11/2015)", size=8)
    write(page, 520, 752, "Page 1 of 3", size=8)
    return doc


def build_mc355(facts):
    doc = pymupdf.open(TEMPLATES / "mc355_eng.pdf")
    page = doc[0]
    street, city = facts["address"]
    rng = random.Random(facts["case_number"])
    fill_form_boxes(page, {
        "Address Field": f"{facts['notice_for']}\n{street}\n{city}",
        "Notice Date": date_numbers(facts["notice_date"]),
        "Case Number": facts["case_number"],
        "Worker Name": facts["worker_name"],
        "Worker ID Number": facts["worker_id"],
        "Worker Fax Number": facts["worker_fax"],
        "Worker Telephone Number": facts["worker_phone"],
        "Office Hours": facts["office_hours"],
        "Notice For": facts["notice_for"],
        "Due Date": date_numbers(facts["due_date"]),
    }, facts["pen"], rng, label_pen=facts["label_pen"])
    return doc


def build_mc210rv(facts):
    doc = pymupdf.open(TEMPLATES / "mc210rv_eng.pdf")
    page = doc[0]
    street, city = facts["address"]
    office_street, office_city = facts["office_address"]
    due = date_words(facts["due_date"])
    values = {
        "Date to respond by": due,
        "Date to respond by1": due,
        "Notice date": date_words(facts["notice_date"]),
        "Case number": facts["case_number"],
        "Case name": facts["notice_for"],
        "Worker name": facts["worker_name"],
        "Worker phone number": facts["worker_phone"],
        "County office phone number (TTY number)": f"{facts['office_phone']} (TTY: 711)",
        "SAWS online portal web address": "BenefitsCal.com",
        "County office phone number": facts["office_phone"],
        "(County office TTY number)": "(TTY: 711)",
        "Name of county office": facts["office_name"],
        "County office address": f"{office_street}, {office_city}",
        "Office start time": "8:00",
        "Office close time": "5:00",
        "County office phone number1": facts["office_phone"],
    }
    # Design, MC 210 RV: names and birthdays in the table, month/day/year.
    for i, (name, birthday) in enumerate(facts["household"][:4], start=1):
        values[f"Recipient {i}"] = name
        values[f"Recipient {i}: Date of birth"] = date_numbers(birthday)
    big = ("Date to respond by",) if facts["hard_case"] == "big_due_date" else ()
    fill_form_boxes(page, values, facts["pen"], random.Random(facts["case_number"]), big_fields=big)

    # The address box on this form is a tiny one-line field, so the name and
    # address are written in the empty space around it instead.
    fill_box(page, (50, 172, 290, 240), f"{facts['notice_for']}\n{street}\n{city}", 10, facts["label_pen"])
    return doc


def build_approval(facts):
    """A fake approval notice, laid out like the real one Neil collected
    (data/real/, which is never used for training). Only the form's printed
    wording is copied; every name and number is fake."""
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    street, city = facts["address"]
    office_street, office_city = facts["office_address"]
    county = facts["county"]
    start = facts["start_date"].strftime("%m/%d/%Y")

    write(page, 40, 52, "NOTICE OF ACTION", size=13, bold=True)
    write(page, 232, 52, f"COUNTY OF  {county.upper()}", size=11)
    write_box(page, (430, 38, 580, 70),
              "STATE OF CALIFORNIA\nHEALTH AND HUMAN SERVICES AGENCY\nCALIFORNIA DEPARTMENT OF SOCIAL SERVICES",
              size=5.5)
    fields = [
        ("Notice Date", date_numbers(facts["notice_date"])),
        ("Case Name", facts["notice_for"]),
        ("SAWS Case Number", facts["case_number"]),
        ("CalHEERS Case Number", facts["calheers_number"]),
        ("Worker Name", facts["worker_name"]),
        ("Worker Number", facts["worker_id"]),
        ("Telephone", facts["worker_phone"]),
        ("Worker Hours", facts["office_hours"]),
        ("24Hour Information", facts["worker_phone"]),
        ("Address", office_street),
        ("", office_city),
    ]
    for i, (label, value) in enumerate(fields):
        y = 80 + i * 10
        write(page, 322, y, label, size=7.5)
        write(page, 428, y, f": {value}" if label else f"  {value}", size=7.5)
    write_box(page, (60, 178, 300, 220), f"{facts['notice_for']}\n{street}\n{city}", size=9)
    write(page, 322, 206, "Questions?  Ask your Worker.", size=9)
    write_box(page, (322, 214, 580, 262),
              "State Hearing: If you think this action is wrong, you can ask for a state hearing. "
              "The back of this page tells you how. Your benefits may not be changed if you ask "
              "for a hearing before this action takes place.", size=8.5)
    body = (
        "Thank you for applying for health insurance for you and your household members. We used "
        "the information you gave us and state and federal data to make this decision.\n\n"
        "Your health care eligibility has been determined for the following member(s) of your family.\n\n"
        f"This notice applies to:\n{facts['notice_for']}\n\n"
        "The individual health care eligibility determinations are detailed below:\n\n"
        f"This notice applies to: {facts['notice_for']}\n\n"
        f"Beginning {start}, you are eligible to receive Medi-Cal benefits without a share-of-cost "
        "under the Aged and Disabled Federal Poverty Level Program.\n\n"
        f"For {facts['notice_for']}, under this program you will receive full Medi-Cal benefits.\n\n"
        "You will receive a Benefits Identification Card (BIC) if you do not already have one. "
        "DO NOT THROW AWAY YOUR PLASTIC BIC.\n\n"
        "Rules: These rules apply. You may review them at your welfare office. Welfare & Inst. Code: 14005.40"
    )
    write_box(page, (40, 272, 575, 560), body, size=9.5)
    page.draw_line((40, 566), (575, 566), width=0.8)
    write(page, 40, 580, "MC 239 A&D (05/07)  MC Approval - Aged & Disabled FPL Program", size=8)
    page.draw_line((40, 745), (575, 745), width=0.8)
    write(page, 520, 757, "PAGE 1 OF 2", size=7)
    return doc


def build_other_page(facts):
    """One page of a form that is not one of the three letters, left blank."""
    file_name, _ = OTHER_TEMPLATES[facts["layout"]]
    doc = pymupdf.open(TEMPLATES / file_name)
    doc.select([facts["page"]])
    page = doc[0]
    # Empty form boxes would show up as grey rectangles, which paper does not have.
    for widget in list(page.widgets()):
        page.delete_widget(widget)
    return doc


def build_letter(facts):
    """The filled-in letter as a one-page PDF."""
    if facts["letter_type"] == "OTHER":
        return build_approval(facts) if facts["layout"] == "approval" else build_other_page(facts)
    if facts["letter_type"] == "MC_239A":
        return build_mc239_calsaws(facts) if facts["layout"] == "calsaws" else build_mc239a_2007(facts)
    if facts["letter_type"] == "MC355":
        return build_mc355(facts)
    return build_mc210rv(facts)


def draw_letter(facts):
    """The filled-in letter as a picture."""
    return page_to_image(build_letter(facts)[0])


# ----------------------------------------------------------------------------
# Step 3: make the clean page look like a phone photo
# ----------------------------------------------------------------------------
# The order for every effect except "clean":
#   1. the page gets any paper damage (a fold)
#   2. it is laid on a table, with a shadow under it, maybe tilted
#   3. anything in front of it is added (a thumb, a hand shadow)
#   4. the camera adds perspective, uneven light, color, and noise
# "clean" skips all of this, since the design says 20% are perfect.

def gradient_mask(size, angle, rng=None):
    """A grey image fading from black to white across the picture, at any
    angle. Used for light, shadows, and the table surface."""
    w, h = size
    big = int(max(w, h) * 1.6)
    grad = Image.linear_gradient("L").resize((big, big)).rotate(angle, resample=Image.BILINEAR)
    left, top = (big - w) // 2, (big - h) // 2
    return grad.crop((left, top, left + w, top + h))


def dither(mask, rng):
    """Add a little random up-and-down to a grey mask.

    A mask only has 256 shades, so a smooth fade across a big picture makes
    a step every few pixels, and on plain paper those steps show up as faint
    rings or stripes. A little noise breaks the steps up so the eye cannot
    follow them."""
    noise = Image.frombytes("L", mask.size, rng.randbytes(mask.width * mask.height)).point(lambda v: v * 6 // 255)
    return ImageChops.add(mask, noise, 1.0, -3)


def make_table(size, rng):
    """A table surface: two shades of one color fading into each other, with
    a little grain. Wood, grey desk, white cloth, or dark laminate."""
    kinds = [((150, 105, 70), (95, 62, 38)),    # wood
             ((175, 175, 178), (120, 120, 125)),  # grey desk
             ((235, 230, 220), (200, 195, 185)),  # cream tablecloth
             ((70, 68, 66), (40, 38, 36)),        # dark laminate
             ((190, 150, 110), (150, 110, 75))]   # light wood
    light, dark = rng.choice(kinds)
    a = Image.new("RGB", size, light)
    b = Image.new("RGB", size, dark)
    table = Image.composite(b, a, gradient_mask(size, rng.uniform(0, 360)))
    grain = Image.frombytes("L", size, rng.randbytes(size[0] * size[1])).convert("RGB")
    return Image.blend(table, grain, rng.uniform(0.04, 0.08))


def soft_shadow(size, shape_alpha, offset, rng, strength=None):
    """A blurred dark copy of a shape, shifted a little: the shadow it casts."""
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    dark = Image.new("RGBA", shape_alpha.size, (0, 0, 0, strength or rng.randint(90, 150)))
    shadow.paste(dark, offset, shape_alpha)
    return shadow.filter(ImageFilter.GaussianBlur(rng.uniform(8, 16)))


def on_table(page, rng, angle=0.0, margin=0.08, shift=0.0):
    """Lay the page on a table. angle tilts it; shift slides it sideways as a
    fraction of the page width (the design's off-center hard case)."""
    pad = int(page.width * margin)
    sprite = page.convert("RGBA").rotate(angle, resample=Image.BICUBIC, expand=True)
    size = (sprite.width + 2 * pad, sprite.height + 2 * pad)
    x = pad + int(shift * page.width)
    x = max(0, min(x, size[0] - sprite.width))
    scene = make_table(size, rng).convert("RGBA")
    scene.alpha_composite(soft_shadow(size, sprite.split()[3], (x + rng.randint(4, 12), pad + rng.randint(6, 16)), rng))
    scene.alpha_composite(sprite, (x, pad))
    return scene.convert("RGB")


def add_fold(page, rng):
    """A crease across the page: a soft dark line with a bright edge, and
    the two halves lit slightly differently."""
    w, h = page.size
    y = int(h * rng.uniform(0.3, 0.7))
    slope = rng.randint(-20, 20)
    top = page.crop((0, 0, w, y))
    page.paste(ImageEnhance.Brightness(top).enhance(rng.uniform(0.94, 0.98)), (0, 0))
    draw = ImageDraw.Draw(page)
    for i, shade in enumerate((225, 205, 195, 215, 240, 250)):
        draw.line([(0, y + i), (w, y + i + slope)], fill=(shade, shade, shade), width=2)
    return page


def thumb_sprite(length, rng):
    """A thumb, drawn: a long rounded shape, darker toward its edges, with a
    smaller lighter nail near the tip. Pointing up; rotated later."""
    width = int(length * 0.5)
    pad = 24
    size = (width + 2 * pad, length + 2 * pad)
    skin = rng.choice([(226, 178, 148), (208, 152, 118), (176, 120, 86), (134, 86, 58), (241, 204, 176)])
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([pad, pad, pad + width, pad + length * 2], radius=width // 2, fill=skin + (255,))
    alpha = img.split()[3]
    # Rounded shading: darkest at the two long edges, light down the middle.
    edge = Image.new("L", size, 0)
    ImageDraw.Draw(edge).rounded_rectangle([pad + width * 0.22, pad + width * 0.2, pad + width * 0.78, pad + length * 2],
                                           radius=int(width * 0.28), fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(width * 0.18))
    darker = Image.new("RGBA", size, tuple(int(c * 0.68) for c in skin) + (255,))
    img.paste(darker, (0, 0), ImageChops.multiply(ImageChops.invert(edge), alpha))
    if rng.random() < 0.65:
        nail = tuple(min(255, int(c * 1.1 + 12)) for c in skin)
        nw, nh = int(width * 0.42), int(length * 0.2)
        nx, ny = pad + (width - nw) // 2, pad + int(length * 0.07)
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([nx, ny, nx + nw, ny + nh], radius=nw // 3, fill=nail + (255,))
    # Close to the lens, so out of focus.
    return img.filter(ImageFilter.GaussianBlur(rng.uniform(2.5, 5)))


def add_thumb(scene, rng):
    """A thumb holding the page down, coming in from an edge."""
    w, h = scene.size
    thumb = thumb_sprite(int(h * rng.uniform(0.3, 0.45)), rng)
    edge = rng.choice(["left", "right", "bottom"])
    angle = {"left": -90, "right": 90, "bottom": 0}[edge] + rng.uniform(-25, 25)
    thumb = thumb.rotate(angle, resample=Image.BICUBIC, expand=True)
    tw, th = thumb.size
    if edge == "bottom":
        pos = (rng.randint(int(w * 0.1), int(w * 0.7)), h - int(th * rng.uniform(0.35, 0.6)))
    elif edge == "left":
        pos = (-int(tw * rng.uniform(0.35, 0.55)), rng.randint(int(h * 0.2), int(h * 0.8)))
    else:
        pos = (w - int(tw * rng.uniform(0.45, 0.65)), rng.randint(int(h * 0.2), int(h * 0.8)))
    out = scene.convert("RGBA")
    out.alpha_composite(paste_anywhere(soft_shadow(thumb.size, thumb.split()[3], (0, 0), rng, strength=110), (w, h), (pos[0] + 6, pos[1] + 10)))
    out.alpha_composite(paste_anywhere(thumb, (w, h), pos))
    return out.convert("RGB")


def paste_anywhere(sprite, size, pos):
    """Return a full-size transparent layer with the sprite at pos, even when
    pos is partly off the edge (alpha_composite itself refuses that)."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.paste(sprite, pos, sprite)
    return layer


def add_hand_shadow(scene, rng):
    """A soft dark blob over part of the picture, like the shadow of the
    phone or the hand holding it."""
    w, h = scene.size
    mask = Image.new("L", scene.size, 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = rng.randint(0, w), rng.randint(0, h)
    rx, ry = int(w * rng.uniform(0.35, 0.7)), int(h * rng.uniform(0.3, 0.6))
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    mask = dither(mask.filter(ImageFilter.GaussianBlur(w * 0.08)), rng)
    dark = ImageEnhance.Brightness(scene).enhance(rng.uniform(0.5, 0.72))
    return Image.composite(dark, scene, mask)


def perspective_coeffs(output_corners, source_corners):
    """The 8 numbers Pillow needs to warp a picture so that each output corner
    shows what was at the matching source corner. Solved by elimination, since
    this project does not use numpy."""
    rows = []
    for (x, y), (u, v) in zip(output_corners, source_corners):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    for i in range(8):
        pivot = max(range(i, 8), key=lambda r: abs(rows[r][i]))
        rows[i], rows[pivot] = rows[pivot], rows[i]
        rows[i] = [v / rows[i][i] for v in rows[i]]
        for r in range(8):
            if r != i and rows[r][i]:
                f = rows[r][i]
                rows[r] = [a - f * b for a, b in zip(rows[r], rows[i])]
    return [rows[i][8] for i in range(8)]


def add_perspective(photo, rng, strength):
    """The camera is never exactly above the page, so the page's corners
    are pulled around a little. strength is the biggest pull, as a fraction
    of the width. The edges are then trimmed so no blank border shows."""
    w, h = photo.size
    pull = lambda: rng.uniform(-strength, strength)
    corners = [(0, 0), (w, 0), (w, h), (0, h)]
    moved = [(x + pull() * w, y + pull() * w) for x, y in corners]
    warped = photo.transform(photo.size, Image.PERSPECTIVE, perspective_coeffs(moved, corners),
                             resample=Image.BICUBIC)
    trim = int(strength * w) + 2
    return warped.crop((trim, trim, w - trim, h - trim))


def camera_finish(photo, rng, perspective=0.03):
    """What a phone camera does to any picture: perspective, light that is
    stronger on one side, darker corners, a color tint, and grain."""
    photo = add_perspective(photo, rng, perspective)
    # Light from one side.
    bright = ImageEnhance.Brightness(photo).enhance(rng.uniform(1.0, 1.08))
    dim = ImageEnhance.Brightness(photo).enhance(rng.uniform(0.8, 0.92))
    photo = Image.composite(bright, dim, dither(gradient_mask(photo.size, rng.uniform(0, 360)), rng))
    # Darker corners (a lens does this).
    # Pick the strength once. (point() calls the function 256 times, so a
    # random number inside it would give every shade a different strength.)
    strength = rng.uniform(0.2, 0.45)
    corners = Image.radial_gradient("L").resize(photo.size, Image.BILINEAR)
    corners = dither(corners.point(lambda v: int(v * strength)), rng)
    photo = Image.composite(ImageEnhance.Brightness(photo).enhance(0.6), photo, corners)
    # Indoor light is a little warm; some phones a little cool.
    tint = rng.choice([(255, 246, 232), (255, 250, 240), (244, 248, 255), (250, 250, 250)])
    photo = ImageChops.multiply(photo, Image.new("RGB", photo.size, tint))
    # Sensor grain.
    grain = Image.frombytes("L", photo.size, rng.randbytes(photo.width * photo.height)).convert("RGB")
    return Image.blend(photo, grain, rng.uniform(0.02, 0.045))


def make_photo(page, effect, facts, rng):
    if effect == "clean":
        return page
    shift = rng.uniform(0.06, 0.1) * rng.choice([-1, 1]) if facts["hard_case"] == "shifted_page" else 0.0
    perspective = rng.uniform(0.07, 0.11) if facts["hard_case"] == "diagonal_lines" else rng.uniform(0.01, 0.04)

    picks = []
    if effect == "blur_shadow_fold":
        # Design groups these three. Each letter gets at least one.
        picks = [p for p in ("blur", "shadow", "fold") if rng.random() < 0.5] or [rng.choice(["blur", "shadow", "fold"])]
    if "fold" in picks:
        page = add_fold(page, rng)

    # Design: up to 5 degrees of tilt. Everything else gets a tiny tilt too,
    # because nobody lays a page down perfectly straight.
    angle = rng.uniform(1, 5) * rng.choice([-1, 1]) if effect == "tilt" else rng.uniform(-0.8, 0.8)
    scene = on_table(page, rng, angle=angle, margin=rng.uniform(0.05, 0.11), shift=shift)

    if effect == "thumb":
        scene = add_thumb(scene, rng)
    if "shadow" in picks:
        scene = add_hand_shadow(scene, rng)
    if effect == "bottom_cut":
        # Design: the bottom is cut off, so the page runs out of the frame.
        # That hides the form ID in the footer.
        pad = (scene.height - page.height) // 2
        scene = scene.crop((0, 0, scene.width, pad + int(page.height * rng.uniform(0.78, 0.92))))

    scene = camera_finish(scene, rng, perspective)
    if "blur" in picks:
        scene = scene.filter(ImageFilter.GaussianBlur(rng.uniform(0.9, 2.0)))
    return scene


# ----------------------------------------------------------------------------
# Putting it together
# ----------------------------------------------------------------------------

def label_row(filename, facts, effect):
    """One row of labels.csv. Dates are written YYYY-MM-DD so they sort and
    compare easily. Anything not printed on this letter is left blank."""
    iso = lambda d: d.isoformat() if d else ""
    disc = facts["discontinuance_date"]
    if facts["letter_type"] == "OTHER" and facts["layout"] != "approval":
        # A blank page has nothing printed on it but the form itself.
        facts = {**facts, "notice_date": None, "case_number": "", "worker_name": "", "worker_id": "",
                 "worker_phone": "", "office_hours": "", "notice_for": ""}
    shows_office_hours = facts["layout"] in ("2007", "mc355", "approval")
    return {
        "filename": filename,
        "letter_type": facts["letter_type"],
        "due_date": iso(facts["due_date"]),
        "discontinuance_month": disc.strftime("%Y-%m") if disc else "",
        "notice_date": iso(facts["notice_date"]),
        "case_number": facts["case_number"],
        "worker_name": facts["worker_name"],
        "worker_id": "" if facts["letter_type"] == "MC210_RV" else facts["worker_id"],
        "worker_fax": facts["worker_fax"],
        "worker_phone": facts["worker_phone"],
        "office_hours": facts["office_hours"] if shows_office_hours else "",
        "notice_for": facts["notice_for"],
        "layout": facts["layout"],
        "photo_effect": effect,
        "hard_case": facts["hard_case"],
        "writing": facts["pen"]["writing"],
    }


def generate(per_type, seed, out_dir=OUT_DIR):
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for letter_type in LETTER_TYPES:
        for i in range(per_type):
            # Each letter gets its own random generator, so letter 57 always
            # comes out the same no matter how many letters are made.
            rng = random.Random(f"{seed}-{letter_type}-{i}")
            facts = make_facts(letter_type, rng, index=i)
            # Design: photo effects split evenly, 20% each.
            effect = PHOTO_EFFECTS[i % len(PHOTO_EFFECTS)]
            image = make_photo(printed_together(draw_letter(facts), rng), effect, facts, rng)
            filename = f"{letter_type.lower()}_{i:04d}.jpg"
            image.save(images_dir / filename, quality=rng.randint(68, 92))
            rows.append(label_row(filename, facts, effect))
        print(f"{letter_type}: {per_type} letters")

    with open(out_dir / "labels.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=LABEL_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} images and labels.csv to {out_dir}")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Make fake Medi-Cal letters.")
    parser.add_argument("--per-type", type=int, default=800, help="letters of each type (default 800)")
    parser.add_argument("--seed", type=int, default=1, help="change this to get a different set")
    args = parser.parse_args()
    generate(args.per_type, args.seed)
