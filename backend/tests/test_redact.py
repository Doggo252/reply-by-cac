"""The same checks as app/src/redact.test.ts, so the two stay in step."""

from backend.redact import redact


def test_ssn_and_long_numbers():
    assert redact("SSN: 123-45-6789 id 1234567")[0] == "SSN: [ssn] id [number]"


def test_short_numbers_dates_and_phones_are_kept():
    kept = "Notice date: 08/12/2026 Worker telephone number: (408) 758-3862 ZIP 94024-5804"
    assert redact(kept)[0] == kept


def test_case_number_pattern_and_labels():
    text, counts = redact("write 0B5P177 on papers\nCase Number: OB5P1?7\nCALHEERS CASE NUMBER:\nCUSTOMER ID: 3556107")
    assert text == "write [case] on papers\nCase Number: [case]\nCALHEERS CASE NUMBER:\nCUSTOMER ID: [case]"
    assert counts["case"] == 2  # the customer ID was counted as a long number
    assert counts["number"] == 1


def test_names_after_labels_and_on_the_next_line():
    text, _ = redact("Notice For: Maria Garcia\nName(s):\nMaria Garcia\nWorker Name: Tong K")
    assert text == "Notice For: [name]\nName(s):\n[name]\nWorker Name: Tong K"


def test_address_lines():
    text, counts = redact("506 Alameda Ave\nGilroy CA 95020-0903\nWe have reviewed")
    assert text == "[address]\n[address]\nWe have reviewed"
    assert counts["address"] == 2


def test_merged_columns_do_not_leak_the_case_number_or_name():
    # A real OCR line from a fake letter: two columns joined together.
    text, _ = redact("Robert Ramirez Case number: _1C6T512\nNotice for: Robert Ramirez")
    assert "1C6T512" not in text
    assert "Robert Ramirez" not in text


def test_case_number_with_junk_attached():
    assert redact("write _1C6T512| now")[0] == "write _[case]| now"


def test_worker_name_is_still_kept_mid_line():
    text, _ = redact("Office: A12 Worker Name: Tong K")
    assert "Tong K" in text


def test_name_glued_to_a_label_and_name_with_junk():
    text, _ = redact("Harold Lopez Case number: 1C6T512\ni Wei Le 4\nLinh Johnson 2 i es")
    assert "Harold" not in text and "Wei Le" not in text and "Linh Johnson" not in text


def test_titles_and_form_lines_are_not_mistaken_for_names():
    kept = "MEDI-CAL REQUEST FOR INFORMATION\nNOTICE OF ACTION\nSocial Services Agency\n1867 Senter Rd"
    assert "REQUEST FOR INFORMATION" in redact(kept)[0]
    assert "NOTICE OF ACTION" in redact(kept)[0]
    assert "Social Services Agency" in redact(kept)[0]


def test_case_number_misread_by_the_text_reader():
    # From a real letter: 1B7P329 came out of the text reader as 187P329.
    assert redact("CalHEERS\n187P329\nWorker ID: A579")[0] == "CalHEERS\n[case]\nWorker ID: A579"


def test_city_line_with_junk_after_the_zip():
    assert redact("Los Altos, CA 94024-5804 oie")[0] == "[address]"


def test_ordinary_words_or_a_date_after_a_name_label_are_not_hidden_everywhere():
    # From a phone photo of the printed test letter (Oct 18).
    text = "\n".join([
        "Name(s): 10/31/2026.",
        "Medi-Cal benefits will be discontinued for:",
        "Keep your plastic card. Please do not throw the card away.",
        "We asked you for the information, but we have not received it and it is essential in determining your Medi-Cal eligibility.",
    ])
    clean, _ = redact(text)
    assert "We asked you for the information, but we have not received it" in clean
    assert "determining your Medi-Cal eligibility" in clean
