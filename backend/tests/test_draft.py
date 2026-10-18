"""Tests for /draft. The AI model is replaced by a fake."""

from fastapi.testclient import TestClient

from backend import llm, main

client = TestClient(main.app)
FACTS = {"letter_type": "MC_239A", "notice_date": "2026-10-01", "effective_date": "2026-10-31",
         "case_number": "1C6T512"}
FINDINGS = [{"rule": 1, "date": "2026-10-20", "needs_proof": False,
             "citation": "MEDIL I15-22, ACWDL 11-23", "reason": "Coverage was denied even though papers were sent in time."}]
TIMELINE = [{"date": "2026-10-20", "type": "papers_received", "description": "Dropped off at the office, case 1C6T512",
             "subject": "Rosa Flores", "proof": "receipt.jpg"},
            {"date": "2026-11-02", "type": "coverage_denied", "description": "Card stopped working", "subject": "", "proof": ""}]
GOOD = {"rescission_letter": "I turned in my papers on October 20, 2026, before October 31, 2026.",
        "hearing_reason": "My coverage stopped on November 2, 2026 even though my papers were in."}


def fake_model(answers, seen):
    def ask_for_json(prompt):
        seen.append(prompt)
        return answers[min(len(seen), len(answers)) - 1]
    return ask_for_json


def post(**body):
    return client.post("/draft", json={"facts": FACTS, "findings": FINDINGS, "timeline": TIMELINE, **body})


def test_a_grounded_draft_is_returned(monkeypatch):
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model([GOOD], seen))
    response = post()
    assert response.status_code == 200
    assert response.json() == GOOD
    assert "{facts}" not in seen[0] and "{findings}" not in seen[0] and "{timeline}" not in seen[0]


def test_no_case_number_name_or_proof_is_sent(monkeypatch):
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model([GOOD], seen))
    post()
    assert "1C6T512" not in seen[0]
    assert "Rosa Flores" not in seen[0]
    assert "receipt.jpg" not in seen[0]


def test_an_invented_date_is_rejected(monkeypatch):
    bad = {**GOOD, "hearing_reason": "Please fix this by December 29, 2026."}
    monkeypatch.setattr(llm, "ask_for_json", fake_model([bad], []))
    response = post()
    assert response.status_code == 502
    assert "2026-12-29" in response.json()["detail"]


def test_a_second_try_can_fix_it(monkeypatch):
    bad = {**GOOD, "rescission_letter": "Due December 29, 2026."}
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model([bad, GOOD], seen))
    assert post().json() == GOOD
    assert len(seen) == 2


def test_both_parts_are_required(monkeypatch):
    monkeypatch.setattr(llm, "ask_for_json", fake_model([{"rescission_letter": "Hi."}], []))
    assert post().status_code == 502


def test_nothing_to_draft_without_a_finding(monkeypatch):
    monkeypatch.setattr(llm, "ask_for_json", fake_model([GOOD], []))
    assert client.post("/draft", json={"facts": FACTS, "findings": []}).status_code == 400


def test_prompt_has_its_three_blanks():
    text = (main.PROMPTS / "draft.md").read_text(encoding="utf-8")
    assert "{facts}" in text and "{findings}" in text and "{timeline}" in text
