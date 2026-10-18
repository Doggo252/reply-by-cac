"""Talks to the AI model (Google Gemini) for Reader A.

This is the only file that sends anything to an AI company. By the time text
gets here it has been scrubbed twice: once on the phone (app/src/redact.ts)
and once more in main.py (backend/redact.py).

It uses plain web requests (httpx) rather than Google's own library, to keep
the project's list of add-ons short.
"""

import json
import os
from datetime import date

import httpx

# Pinned to an exact name so it cannot change underneath the accuracy numbers.
# Chosen by timing 12 letters (2026-10-07): gemini-3.5-flash with "low"
# thinking got the letter type right on 10 of 12 in about 3 seconds each.
# gemini-3.8-flash with full thinking was right but took up to 34 seconds,
# too slow for someone standing in their kitchen; with low thinking it was
# fast but less accurate (9 of 12).
MODEL = "gemini-3.5-flash"
THINKING = {"thinkingLevel": "low"}
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


# Once the app is online, anyone with the address could make it call the AI.
# This caps the calls per day so the credit cannot be used up in one go.
# Set MAX_AI_CALLS_PER_DAY in the server's settings to change it.
MAX_CALLS_PER_DAY = int(os.getenv("MAX_AI_CALLS_PER_DAY", "300"))
_today = {"day": None, "calls": 0}


class LLMError(Exception):
    """Something went wrong talking to the model. The app shows a friendly
    message and carries on with Reader B alone."""


def count_call(day=None):
    """Counts one call to the model, and refuses once today's cap is reached."""
    day = day or date.today().isoformat()
    if _today["day"] != day:
        _today["day"], _today["calls"] = day, 0
    if _today["calls"] >= MAX_CALLS_PER_DAY:
        raise LLMError("the app reached its AI limit for today")
    _today["calls"] += 1


def ask_for_json(prompt):
    """Sends the prompt and returns the model's answer as a Python dict."""
    count_call()
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY is not set in backend/.env")
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        # JSON only, and temperature 0 so the same letter gets the same answer.
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "thinkingConfig": THINKING},
    }
    try:
        response = httpx.post(URL, json=body, headers={"x-goog-api-key": key}, timeout=60)
    except httpx.HTTPError as error:
        raise LLMError(f"could not reach the model: {error}") from error
    if response.status_code != 200:
        raise LLMError(f"model returned {response.status_code}")
    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError) as error:
        raise LLMError("model did not return valid JSON") from error


def ask_with_tools(instructions, contents, tools):
    """For the AI helper: sends the conversation and the tool list, and returns
    the parts of the model's answer (text and tool calls)."""
    count_call()
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY is not set in backend/.env")
    body = {
        "systemInstruction": {"parts": [{"text": instructions}]},
        "contents": contents,
        "tools": [{"functionDeclarations": tools}],
        "generationConfig": {"thinkingConfig": THINKING},
    }
    try:
        response = httpx.post(URL, json=body, headers={"x-goog-api-key": key}, timeout=60)
    except httpx.HTTPError as error:
        raise LLMError(f"could not reach the model: {error}") from error
    if response.status_code != 200:
        raise LLMError(f"model returned {response.status_code}")
    try:
        return response.json()["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, ValueError) as error:
        raise LLMError("model gave no answer") from error
