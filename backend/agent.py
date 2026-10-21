"""The AI helper's relay: passes the phone's conversation to Gemini and back.

The helper's loop runs on the phone (app/src/agentLoop.ts), because its tools
read papers, the timeline and the signature, which never leave the phone. This
server only does three things for it:

  1. adds Neil's instructions (prompts/agent.md),
  2. scrubs every tool result a second time, in case of a bug on the phone,
  3. translates between the phone's message shape and Gemini's.

The phone keeps its conversation in a simple shape (the one Anthropic's API
uses): text blocks, tool_use blocks (the AI asks for a tool) and tool_result
blocks (the answer). Gemini calls these "functionCall" and "functionResponse",
so the two functions at the bottom convert one to the other.
"""

import json
import re

from backend.redact import redact

# Exactly the tools in Neil's agent/TOOLS.md. Anything else is refused here,
# and the phone refuses it again.
AGENT_TOOLS = [
    "get_letter", "get_timeline", "list_papers", "get_paper_text", "request_photo", "fill_renewal_answers",
    "check_county_mistake", "draft_hearing_request", "draft_restore_letter",
    "propose_packet", "run_checker", "open_review_screen", "ask_user_to_sign", "build_packet",
]

# Values under these keys are IDs, dates or fixed code words made by the app,
# never anything a person wrote, so they are not scrubbed. Same list as KEEP
# in app/src/agentLoop.ts.
KEEP = re.compile(r"(_id|_ids|_date|^date|_type|^saved_at|^drafts_kept|^check|^reason)$")


def scrub(value, key=""):
    """Runs the redactor over every piece of text in a tool result."""
    if isinstance(value, str):
        return value if KEEP.search(key) else redact(value)[0]
    if isinstance(value, list):
        return [scrub(item, key) for item in value]
    if isinstance(value, dict):
        return {k: scrub(v, k) for k, v in value.items()}
    return value


def declarations(tools):
    """Turns the phone's tool list into Gemini's "function declarations".

    Each tool from the phone looks like
      {"name": "get_letter", "description": "...", "inputs": {"letter_id": "text"}}
    where an input is "text" or "list". `explanations` and `answers` are the
    lists of objects; every other list is a list of IDs.
    """
    result = []
    for tool in tools:
        properties = {}
        for field, kind in tool["inputs"].items():
            if kind == "text":
                properties[field] = {"type": "string"}
            elif field == "explanations":
                properties[field] = {"type": "array", "items": {
                    "type": "object",
                    "properties": {"yellow_box_id": {"type": "string"}, "plain_words": {"type": "string"}},
                    "required": ["yellow_box_id", "plain_words"],
                }}
            elif field == "answers":
                properties[field] = {"type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"}, "value": {"type": "string"}, "paper_id": {"type": "string"},
                    },
                    "required": ["question", "value", "paper_id"],
                }}
            else:
                properties[field] = {"type": "array", "items": {"type": "string"}}
        declaration = {"name": tool["name"], "description": tool["description"]}
        if properties:
            declaration["parameters"] = {"type": "object", "properties": properties, "required": list(properties)}
        result.append(declaration)
    return result


def to_gemini(messages):
    """Phone messages to Gemini "contents"."""
    contents = []
    names = {}  # tool_use id -> tool name, because Gemini's answers need the name
    for message in messages:
        role = "model" if message["role"] == "assistant" else "user"
        blocks = message["content"]
        if isinstance(blocks, str):
            blocks = [{"type": "text", "text": blocks}]
        parts = []
        for block in blocks:
            if block["type"] == "text":
                part = {"text": block["text"]}
            elif block["type"] == "tool_use":
                names[block["id"]] = block["name"]
                part = {"functionCall": {"id": block["id"], "name": block["name"], "args": block.get("input") or {}}}
            else:  # tool_result
                try:
                    answer = json.loads(block["content"])
                except ValueError:
                    answer = {"ok": False, "reason": "unreadable result"}
                part = {"functionResponse": {
                    "id": block["tool_use_id"],
                    "name": names.get(block["tool_use_id"], "unknown"),
                    "response": scrub(answer),
                }}
            # Gemini 3 hands back a "thought signature" with its answers and
            # needs it returned unchanged next time. The phone just carries it.
            if block.get("signature"):
                part["thoughtSignature"] = block["signature"]
            parts.append(part)
        contents.append({"role": role, "parts": parts})
    return contents


def from_gemini(parts, call_number):
    """Gemini's answer back to phone blocks. Tool calls the spec does not list
    are dropped, so the phone never even sees them."""
    blocks = []
    for part in parts:
        signature = part.get("thoughtSignature")
        if "functionCall" in part:
            call = part["functionCall"]
            if call.get("name") not in AGENT_TOOLS:
                continue
            call_number += 1
            block = {"type": "tool_use", "id": call.get("id") or f"call-{call_number}",
                     "name": call["name"], "input": call.get("args") or {}}
        elif part.get("text") and not part.get("thought"):
            block = {"type": "text", "text": part["text"]}
        else:
            continue
        if signature:
            block["signature"] = signature
        blocks.append(block)
    return blocks
