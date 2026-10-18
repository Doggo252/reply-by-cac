"""The daily cap on AI calls, so a public address cannot use up the credit."""

import pytest

from backend import llm


def test_calls_stop_at_the_cap_and_start_again_the_next_day(monkeypatch):
    monkeypatch.setattr(llm, "MAX_CALLS_PER_DAY", 2)
    monkeypatch.setattr(llm, "_today", {"day": None, "calls": 0})
    llm.count_call("2026-10-18")
    llm.count_call("2026-10-18")
    with pytest.raises(llm.LLMError):
        llm.count_call("2026-10-18")
    llm.count_call("2026-10-19")  # a new day, a new count
