"""Tests for /explain. The AI model is replaced by a fake."""

from datetime import date

from fastapi.testclient import TestClient

from backend import llm, main

client = TestClient(main.app)
FACTS = {"letter_type": "MC355", "notice_date": "2026-09-20", "due_date": "2026-10-04",
         "ask": "proof of income", "case_number": "1C6T512"}


def fake_model(answers, seen):
    """Gives the answers in order, one per call."""
    def ask_for_json(prompt):
        seen.append(prompt)
        return answers[min(len(seen), len(answers)) - 1]
    return ask_for_json


def test_a_grounded_explanation_is_returned(monkeypatch):
    seen = []
    good = {"simplification": "The county needs proof of income. Send it by October 4th, 2026.", "urgency": "high"}
    monkeypatch.setattr(llm, "ask_for_json", fake_model([good], seen))
    monkeypatch.setattr(main, "today", lambda: date(2026, 10, 1))
    body = client.post("/explain", json={"facts": FACTS, "language": "english"}).json()
    assert body == {"explanation": good["simplification"], "urgency": "high", "language": "english"}
    # The prompt got the language and today's date filled in.
    assert "Write your response in english" in seen[0]
    assert "2026-10-01" in seen[0]
    assert "{facts}" not in seen[0] and "{language}" not in seen[0] and "{date}" not in seen[0]


def test_the_case_number_is_never_sent(monkeypatch):
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model([{"simplification": "Ok.", "urgency": "low"}], seen))
    client.post("/explain", json={"facts": FACTS})
    assert "1C6T512" not in seen[0]


def test_an_invented_date_is_rejected(monkeypatch):
    seen = []
    bad = {"simplification": "Send your papers by October 14, 2026.", "urgency": "high"}
    monkeypatch.setattr(llm, "ask_for_json", fake_model([bad], seen))
    response = client.post("/explain", json={"facts": FACTS})
    assert response.status_code == 502
    assert "not in the letter" in response.json()["detail"]
    assert len(seen) == main.EXPLAIN_TRIES  # it asked again before giving up


def test_a_second_try_can_fix_it(monkeypatch):
    seen = []
    bad = {"simplification": "Send your papers by October 14, 2026.", "urgency": "high"}
    good = {"simplification": "Send your papers by October 4, 2026.", "urgency": "high"}
    monkeypatch.setattr(llm, "ask_for_json", fake_model([bad, good], seen))
    response = client.post("/explain", json={"facts": FACTS})
    assert response.status_code == 200
    assert response.json()["explanation"] == good["simplification"]


def test_a_made_up_urgency_is_rejected(monkeypatch):
    monkeypatch.setattr(llm, "ask_for_json", fake_model([{"simplification": "Ok.", "urgency": "very high"}], []))
    assert client.post("/explain", json={"facts": FACTS}).status_code == 502


def test_only_english_and_spanish(monkeypatch):
    monkeypatch.setattr(llm, "ask_for_json", fake_model([{"simplification": "Ok.", "urgency": "low"}], []))
    assert client.post("/explain", json={"facts": FACTS, "language": "french"}).status_code == 400


def test_prompt_has_its_three_blanks():
    text = (main.PROMPTS / "explain.md").read_text(encoding="utf-8")
    assert "{facts}" in text and "{language}" in text and "{date}" in text
