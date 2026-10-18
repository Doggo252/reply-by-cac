"""Blanks out private details in letter text. Backup for app/src/redact.ts.

The app scrubs the text on the phone before sending it. This runs the same
rules again on the server, so that even a bug in the app cannot leak a case
number or a name to the AI. Keep the rules in step with the TypeScript file.
"""

import re

# Not a bare "name" label: that would also catch "Worker name", and the
# worker's name is kept on purpose.
NAME_LABELS = r"notice for|case name|names?\(s\)|this notice applies to|for"
ID_LABELS = r"saws case number|calheers case number|case number|customer id"

# Labels are found anywhere on a line, not just at the start: the text reader
# often joins two columns into one line ("Robert Ramirez Case number: ...").
# The rules use [ \t] rather than \s so that a label with nothing after it
# does not swallow the next line.
RULES = [
    # (pattern, kind, replacement, remember the value to blank it everywhere)
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "ssn", "[ssn]", False),
    (re.compile(r"\d{6,}"), "number", "[number]", False),
    # A case number: a 6 to 9 character code of capital letters and at least
    # 3 digits. The real pattern is #L#L###, but the text reader swaps look-
    # alike characters (it read 1B7P329 as 187P329), so any mix counts. Junk
    # like an underscore stuck to it does not stop the match.
    (re.compile(r"(?<![A-Za-z0-9])(?=(?:[A-Z]*\d){3})(?=\d*[A-Z])[A-Z0-9]{6,9}(?![A-Za-z0-9])"), "case", "[case]", False),
    (re.compile(rf"(?P<keep>\b(?:{ID_LABELS})[ \t]*:?[ \t]*)[^\s:].*$", re.I | re.M), "case", "[case]", True),
    (re.compile(rf"(?P<keep>\b(?:{NAME_LABELS})[ \t]*:[ \t]*)[^\s:].*$", re.I | re.M), "name", "[name]", True),
    (re.compile(rf"(?P<keep>\b(?:{NAME_LABELS})[ \t]*:[ \t]*\n)[ \t]*\S.*$", re.I | re.M), "name", "[name]", True),
    (re.compile(r"^\s*\d{1,6}\s+[\w.'\s-]+\b(st|ave|rd|blvd|dr|way|ln|ct|real|pl|cir|apt|#)\b.*$", re.I | re.M), "address", "[address]", False),
    # A city line, even with a scrap of junk after the ZIP code.
    (re.compile(r"^.*\bCA\s+\d{5}(-\d{4})?\b.*$", re.I | re.M), "address", "[address]", False),
]

BLANK = re.compile(r"\[\w+\]")


def redact(text):
    """Returns (clean text, counts of what was blanked, by kind)."""
    counts = {"ssn": 0, "number": 0, "case": 0, "name": 0, "address": 0}
    found = []  # (value, kind) seen after a label, to blank everywhere
    for pattern, kind, blank, remember in RULES:
        def swap(match):
            keep = match.groupdict().get("keep") or ""
            value = match.group(0)[len(keep):].strip()
            # Something an earlier rule already blanked is not counted twice.
            if not BLANK.fullmatch(value):
                counts[kind] += 1
                # A value after a name label is blanked here either way, but
                # only remembered (and blanked everywhere, word by word) if it
                # looks like a name. Otherwise a misread line of ordinary words
                # ("the", "not", "your") or a date would vanish all over the page.
                if remember and (kind != "name" or looks_like_a_name(value)):
                    found.append((strip_junk(value) if kind == "name" else value, kind))
            return keep + blank
        text = pattern.sub(swap, text)

    # Names with no label next to them:
    # 1. The address block: the line just above a street line is the name.
    lines = text.split("\n")
    for i, raw in enumerate(lines):
        # 1. A line that is only a name (the address block, or a column the
        #    text reader split off), maybe with a scrap of junk at either end.
        line = strip_junk(raw)
        if LOOKS_LIKE_NAME.fullmatch(line) and not has_form_words(line):
            found.append((line, "name"))
            lines[i] = "[name]"
            counts["name"] += 1
            continue
        # 2. A name glued to the front of a header label, when the text reader
        #    joins two columns: "Harold Lopez Case number: ...".
        label = HEADER_LABEL.search(raw)
        if label:
            front = strip_junk(raw[:label.start()])
            if LOOKS_LIKE_NAME.fullmatch(front) and not has_form_words(front):
                found.append((front, "name"))
                lines[i] = "[name] " + raw[label.start():]
                counts["name"] += 1
    text = "\n".join(lines)
    # 3. The renewal's table: a name followed by a date of birth.
    for match in NAME_THEN_BIRTHDAY.finditer(text):
        found.append((match.group("name").strip(), "name"))
    text, n = NAME_THEN_BIRTHDAY.subn(r"[name] \g<date>", text)
    counts["name"] += n

    # The same name or number often appears again elsewhere on the page (a
    # second column, a misread copy). Blank every copy, and for names every
    # word of the name, since the text reader often misspells one copy.
    for value, kind in found:
        value = value.strip("_| \t")
        if len(value) < 4:
            continue
        pieces = [value] + (value.split() if kind == "name" else [])
        for piece in pieces:
            if len(piece) >= 3 and not BLANK.fullmatch(piece):
                pattern = re.compile(rf"(?<![A-Za-z0-9]){re.escape(piece)}(?![A-Za-z0-9])")
                text, n = pattern.subn(f"[{kind}]", text)
                counts[kind] += n
    return text, counts


# A line that is just a name: two to four capitalized words, no digits.
LOOKS_LIKE_NAME = re.compile(r"[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){1,3}")

# Words printed on the forms themselves. A short capitalized line holding one
# of these is part of the form ("Social Services Agency"), not a name.
FORM_WORDS = set("""
medi cal program services agency department county health california state
human social notice action benefits request information renewal form case
worker office hours name names date stamp denial discontinuance attention
important page questions number read first online mail phone person step
household members birth care covered steps hearing rights back mc rv
""".split())


# Header labels that a name can get glued in front of.
HEADER_LABEL = re.compile(r"\b(notice date|case number|case name|notice for|worker|office hours)\b", re.I)

# Scraps the text reader leaves at the ends of a line: 1 or 2 lowercase
# letters, digits, or symbols. (Not capitalized scraps: "Le" is a real name.)
JUNK = re.compile(r"[a-z]{1,2}|\d{1,2}|[^A-Za-z0-9]+")


def strip_junk(line):
    words = line.split()
    while words and JUNK.fullmatch(words[0]):
        words.pop(0)
    while words and JUNK.fullmatch(words[-1]):
        words.pop()
    return " ".join(words)


def has_form_words(line):
    words = re.split(r"[^a-z]+", line.lower())
    return any(word in FORM_WORDS for word in words)


def looks_like_a_name(value):
    line = strip_junk(value)
    return bool(LOOKS_LIKE_NAME.fullmatch(line)) and not has_form_words(line)
# "Maria Garcia   05/23/1950" at the end of a line (no colon, so it is not a
# label like "Notice date:").
NAME_THEN_BIRTHDAY = re.compile(r"^(?P<name>[A-Za-z][A-Za-z.' -]{2,}?)\s+(?P<date>\d{1,2}/\d{1,2}/\d{4})\s*$", re.M)
