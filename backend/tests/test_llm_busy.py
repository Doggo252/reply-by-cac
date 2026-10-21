"""When Google is busy for a moment, the app waits and tries again.

From the Oct 20 test run: Gemini answered 503 ("busy") once and the AI
helper stopped. No real calls here; the web request is faked.
"""

import pytest

from backend import llm


class Answer:
    def __init__(self, status_code):
        self.status_code = status_code


def fake_google(codes, sent):
    """Answers with each status code in turn, and counts the requests."""
    def post(url, json, headers, timeout):
        sent.append(url)
        return Answer(codes[len(sent) - 1])
    return post


def test_tries_again_when_google_is_busy(monkeypatch):
    sent, waits = [], []
    monkeypatch.setattr(llm.httpx, "post", fake_google([503, 503, 200], sent))
    monkeypatch.setattr(llm.time, "sleep", waits.append)
    assert llm.post({}, "test-key").status_code == 200
    assert len(sent) == 3
    assert waits == [0, 2, 5]


def test_gives_up_after_three_tries(monkeypatch):
    sent = []
    monkeypatch.setattr(llm.httpx, "post", fake_google([503, 503, 503], sent))
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    with pytest.raises(llm.LLMError):
        llm.post({}, "test-key")
    assert len(sent) == 3


def test_does_not_try_again_for_a_real_mistake(monkeypatch):
    # 400 means the request itself was wrong; trying again won't help.
    sent = []
    monkeypatch.setattr(llm.httpx, "post", fake_google([400], sent))
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    with pytest.raises(llm.LLMError):
        llm.post({}, "test-key")
    assert len(sent) == 1
