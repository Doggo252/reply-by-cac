"""Talks to the AI model (Google Gemini) for Reader A.

This is the only file that sends anything to an AI company. By the time text
gets here it has been scrubbed twice: once on the phone (app/src/redact.ts)
and once more in main.py (backend/redact.py).

It uses plain web requests (httpx) rather than Google's own library, to keep
the project's list of add-ons short.
"""

import json
import os

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


class LLMError(Exception):
    """Something went wrong talking to the model. The app shows a friendly
    message and carries on with Reader B alone."""


def ask_for_json(prompt):
    """Sends the prompt and returns the model's answer as a Python dict."""
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
