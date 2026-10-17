"""Tests for /agent, the AI helper's relay. The AI model is replaced by a fake."""

import json

from fastapi.testclient import TestClient

from backend import agent, llm, main

client = TestClient(main.app)
TOOLS = [
    {"name": "get_letter", "description": "returns the letter", "inputs": {"letter_id": "text"}},
    {"name": "list_papers", "description": "lists the papers", "inputs": {}},
    {"name": "open_review_screen", "description": "shows the review screen",
     "inputs": {"packet_id": "text", "explanations": "list"}},
]
START = [{"role": "user", "content": json.dumps({"letter_id": "letter-1", "letter_type": "MC_239A"})}]


def fake_model(parts, seen):
    def ask_with_tools(instructions, contents, tools):
        seen.append({"instructions": instructions, "contents": contents, "tools": tools})
        return parts
    return ask_with_tools


def with_prompt(monkeypatch, tmp_path):
    (tmp_path / "agent.md").write_text("Help the person prepare their reply.")
    monkeypatch.setattr(main, "PROMPTS", tmp_path)


def test_a_tool_call_comes_back_in_the_phone_shape(monkeypatch, tmp_path):
    with_prompt(monkeypatch, tmp_path)
    seen = []
    monkeypatch.setattr(llm, "ask_with_tools", fake_model(
        [{"functionCall": {"name": "get_letter", "args": {"letter_id": "letter-1"}}, "thoughtSignature": "sig1"}], seen))
    response = client.post("/agent", json={"messages": START, "tools": TOOLS})
    assert response.status_code == 200
    assert response.json() == {"content": [
        {"type": "tool_use", "id": "call-1", "name": "get_letter", "input": {"letter_id": "letter-1"}, "signature": "sig1"}]}
    assert seen[0]["instructions"] == "Help the person prepare their reply."


def test_the_tool_list_becomes_gemini_declarations():
    declared = {d["name"]: d for d in agent.declarations(TOOLS)}
    assert declared["get_letter"]["parameters"]["properties"] == {"letter_id": {"type": "string"}}
    assert "parameters" not in declared["list_papers"]  # no inputs at all
    explanations = declared["open_review_screen"]["parameters"]["properties"]["explanations"]
    assert explanations["items"]["required"] == ["yellow_box_id", "plain_words"]


def test_a_finished_answer_is_plain_text(monkeypatch, tmp_path):
    with_prompt(monkeypatch, tmp_path)
    monkeypatch.setattr(llm, "ask_with_tools", fake_model(
        [{"text": "thinking...", "thought": True}, {"text": "Your packet is saved."}], []))
    response = client.post("/agent", json={"messages": START, "tools": TOOLS})
    assert response.json() == {"content": [{"type": "text", "text": "Your packet is saved."}]}


def test_a_tool_that_is_not_in_the_spec_is_dropped(monkeypatch, tmp_path):
    with_prompt(monkeypatch, tmp_path)
    monkeypatch.setattr(llm, "ask_with_tools", fake_model(
        [{"functionCall": {"name": "send_fax", "args": {}}}], []))
    response = client.post("/agent", json={"messages": START, "tools": TOOLS})
    assert response.json() == {"content": []}


def test_the_phone_cannot_offer_a_tool_that_is_not_in_the_spec(monkeypatch, tmp_path):
    with_prompt(monkeypatch, tmp_path)
    tools = TOOLS + [{"name": "send_fax", "description": "sends a fax", "inputs": {}}]
    response = client.post("/agent", json={"messages": START, "tools": tools})
    assert response.status_code == 400


def test_tool_results_are_scrubbed_again_but_ids_are_kept(monkeypatch, tmp_path):
    with_prompt(monkeypatch, tmp_path)
    seen = []
    monkeypatch.setattr(llm, "ask_with_tools", fake_model([{"text": "done"}], seen))
    result = {"ok": True, "letter_id": "letter-123456789",
              "pii_redacted_text": "Case Number: 7X4M714\nSSN 123-45-6789"}
    messages = START + [
        {"role": "assistant", "content": [
            {"type": "tool_use", "id": "call-1", "name": "get_letter", "input": {"letter_id": "letter-1"}, "signature": "sig1"}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "call-1", "content": json.dumps(result)}]},
    ]
    client.post("/agent", json={"messages": messages, "tools": TOOLS})
    contents = seen[0]["contents"]
    # The signature goes back to Gemini with the call it came with.
    assert contents[1]["parts"][0] == {"functionCall": {"id": "call-1", "name": "get_letter",
                                                        "args": {"letter_id": "letter-1"}}, "thoughtSignature": "sig1"}
    answer = contents[2]["parts"][0]["functionResponse"]
    assert answer["name"] == "get_letter"
    assert answer["response"]["letter_id"] == "letter-123456789"
    assert "7X4M714" not in answer["response"]["pii_redacted_text"]
    assert "123-45-6789" not in answer["response"]["pii_redacted_text"]


def test_no_instructions_file_means_no_call(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "PROMPTS", tmp_path)  # an empty folder
    called = []
    monkeypatch.setattr(llm, "ask_with_tools", fake_model([], called))
    response = client.post("/agent", json={"messages": START, "tools": TOOLS})
    assert response.status_code == 503
    assert called == []
