"""Tests for /extract. The AI model is replaced by a fake, so these tests
never use the internet or the API key."""

from fastapi.testclient import TestClient

from backend import llm, main

client = TestClient(main.app)


def fake_model(answer, seen):
    def ask_for_json(prompt):
        seen.append(prompt)
        return answer
    return ask_for_json


def test_extract_returns_the_prompts_fields(monkeypatch):
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model({"letter_type": "MC-355", "due_date": "2022-12-20"}, seen))
    body = client.post("/extract", json={"text": "MEDI-CAL REQUEST FOR INFORMATION"}).json()
    assert body["facts"]["letter_type"] == "MC-355"
    assert body["facts"]["due_date"] == "2022-12-20"
    # Anything the model left out comes back as null.
    assert body["facts"]["notice_date"] is None
    assert set(body["facts"]) == set(main.EXTRACT_FIELDS)


def test_the_model_never_sees_the_case_number_or_name(monkeypatch):
    seen = []
    monkeypatch.setattr(llm, "ask_for_json", fake_model({}, seen))
    letter = "Case Number: 1B7P329\nNotice For: Maria Garcia\nWe must receive this by 12/20/2022"
    body = client.post("/extract", json={"text": letter}).json()
    assert "1B7P329" not in seen[0]
    assert "Maria Garcia" not in seen[0]
    assert "12/20/2022" in seen[0]
    assert body["redacted"]["case"] == 1


def test_extra_fields_from_the_model_are_dropped(monkeypatch):
    monkeypatch.setattr(llm, "ask_for_json", fake_model({"letter_type": "MC-355", "secret": "x"}, []))
    body = client.post("/extract", json={"text": "hi"}).json()
    assert "secret" not in body["facts"]


def test_model_trouble_gives_a_clean_error(monkeypatch):
    def broken(prompt):
        raise llm.LLMError("could not reach the model")
    monkeypatch.setattr(llm, "ask_for_json", broken)
    response = client.post("/extract", json={"text": "hi"})
    assert response.status_code == 503


def test_prompt_has_a_place_for_the_letter():
    # prompts/extract.md must contain {text}, or the letter would never be sent.
    assert "{text}" in (main.PROMPTS / "extract.md").read_text(encoding="utf-8")
