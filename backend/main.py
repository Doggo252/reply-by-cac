"""ReplyBy backend.

This exists for one reason: some things cannot happen on the phone. The
AI model's API key must never ship inside the app, because anyone can read an
app's code. So the phone talks to this server, and this server is the only
thing that holds the key.

Endpoints arrive over the next few weeks:
  /extract     redacted letter text in, structured facts out   (week 2)
  /explain     confirmed facts in, plain-language summary out  (week 3)
  /draft       findings and timeline in, draft letters out     (week 4)
  /agent       the AI helper's conversation in, its next step out (week 5)

Run it from the repository root:
    .venv/bin/uvicorn backend.main:app --reload
"""

import json
import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import agent, llm
from backend.grounding import invented_dates
from backend.redact import redact

# Read backend/.env into environment variables. Doing it by explicit path means
# it works no matter which folder the server was started from.
load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="ReplyBy backend")

# The app runs on a different address than this server (the phone loads it from
# the Vite dev server), and browsers block those calls unless the server says
# they are allowed. In development that means the local network. Before the app
# is deployed, ALLOWED_ORIGINS gets set to the real address.
allowed = os.getenv("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Says the server is up, and whether it found its keys.

    It reports only whether each key is present, never the key itself.
    """
    return {
        "status": "ok",
        "service": "replyby-backend",
        "llm_key_loaded": bool(os.getenv("GEMINI_API_KEY")),
        "fax_key_loaded": bool(os.getenv("FAX_API_KEY")),
    }


# Reader A ------------------------------------------------------------------

PROMPTS = Path(__file__).parent.parent / "prompts"

# The fields Neil's prompt (prompts/extract.md) asks the model for. Keep this
# list the same as the JSON shape in that file. Anything the model leaves out
# comes back as null, and anything extra is dropped.
EXTRACT_FIELDS = [
    "letter_type", "notice_date", "effective_date", "ask", "appeal_language",
    "case_number", "worker_name", "worker_phone", "due_date", "certainty",
]


class LetterText(BaseModel):
    text: str


@app.post("/extract")
def extract(letter: LetterText):
    """Reader A: the AI reads the letter text and returns its facts."""
    # The phone already scrubbed the text. Scrub it again here, in case of a
    # bug in the app.
    clean, blanked = redact(letter.text)
    prompt = (PROMPTS / "extract.md").read_text(encoding="utf-8").replace("{text}", clean)
    try:
        answer = llm.ask_for_json(prompt)
    except llm.LLMError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not isinstance(answer, dict):
        raise HTTPException(status_code=503, detail="model did not return an object")
    facts = {field: answer.get(field) for field in EXTRACT_FIELDS}
    return {"facts": facts, "redacted": blanked}


# Plain-language explanation ---------------------------------------------------

LANGUAGES = ["english", "spanish"]
URGENCY_LEVELS = ["low", "med", "high", "already passed", "no due date"]
# How many times to ask the model before giving up on a grounded answer.
EXPLAIN_TRIES = 2


class ExplainRequest(BaseModel):
    facts: dict
    language: str = "english"


def today():
    """Today's date. A function of its own so tests can set the date."""
    return date.today()


@app.post("/explain")
def explain(request: ExplainRequest):
    """Writes a short plain-language explanation of the letter from the facts
    the user confirmed, using Neil's prompt (prompts/explain.md)."""
    if request.language not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"language must be one of {LANGUAGES}")
    # The case number is never needed to explain a letter, so it is not sent.
    facts = {**request.facts, "case_number": None}
    prompt = ((PROMPTS / "explain.md").read_text(encoding="utf-8")
              .replace("{facts}", json.dumps(facts, indent=2))
              .replace("{language}", request.language)
              .replace("{date}", today().isoformat()))

    problem = "the model gave no usable answer"
    for _ in range(EXPLAIN_TRIES):
        try:
            answer = llm.ask_for_json(prompt)
        except llm.LLMError as error:
            raise HTTPException(status_code=503, detail=str(error))
        text = answer.get("simplification") if isinstance(answer, dict) else None
        urgency = answer.get("urgency") if isinstance(answer, dict) else None
        if not isinstance(text, str) or urgency not in URGENCY_LEVELS:
            problem = "the model did not follow the answer format"
            continue
        # The safety rule: no date that is not in the confirmed facts.
        invented = invented_dates(text, facts)
        if invented:
            problem = f"the explanation mentioned a date that is not in the letter: {invented}"
            continue
        return {"explanation": text, "urgency": urgency, "language": request.language}
    raise HTTPException(status_code=502, detail=problem)


# Draft letters ------------------------------------------------------------------

# How many times to ask the model before giving up on a grounded draft.
DRAFT_TRIES = 2
DRAFT_PARTS = ["rescission_letter", "hearing_reason"]


class DraftRequest(BaseModel):
    facts: dict
    # What Neil's county-mistake rules found (core/contradictions.py).
    findings: list[dict]
    # The user's timeline events: date, type, description.
    timeline: list[dict] = []


def allowed_dates(facts, findings, timeline):
    """Every date the draft is allowed to mention, in one dict for the
    grounding check: the confirmed facts, the finding dates, and the timeline."""
    allowed = dict(facts)
    for i, item in enumerate(findings + timeline):
        allowed[f"date_{i}"] = item.get("date")
    return allowed


@app.post("/draft")
def draft(request: DraftRequest):
    """Writes the rescission request and the hearing "here's why" text from
    Neil's prompt (prompts/draft.md). Only called when one of Neil's
    county-mistake rules fired."""
    if not request.findings:
        raise HTTPException(status_code=400, detail="there is nothing to draft without a finding")
    facts = {**request.facts, "case_number": None}
    # The user typed the descriptions, so they could hold a name or case
    # number. Scrub them, and leave out who did it and the proof file names.
    timeline = [{"date": e.get("date"), "type": e.get("type"),
                 "description": redact(str(e.get("description") or ""))[0]}
                for e in request.timeline]
    prompt = ((PROMPTS / "draft.md").read_text(encoding="utf-8")
              .replace("{facts}", json.dumps(facts, indent=2))
              .replace("{findings}", json.dumps(request.findings, indent=2))
              .replace("{timeline}", json.dumps(timeline, indent=2)))
    allowed = allowed_dates(facts, request.findings, timeline)

    problem = "the model gave no usable answer"
    for _ in range(DRAFT_TRIES):
        try:
            answer = llm.ask_for_json(prompt)
        except llm.LLMError as error:
            raise HTTPException(status_code=503, detail=str(error))
        if not isinstance(answer, dict) or not all(isinstance(answer.get(p), str) for p in DRAFT_PARTS):
            problem = "the model did not follow the answer format"
            continue
        # Same safety rule as the explanation: no date that is not ours.
        invented = invented_dates(" ".join(answer[p] for p in DRAFT_PARTS), allowed)
        if invented:
            problem = f"the draft mentioned a date that is not in the facts or timeline: {invented}"
            continue
        return {p: answer[p] for p in DRAFT_PARTS}
    raise HTTPException(status_code=502, detail=problem)


# The AI helper ------------------------------------------------------------------

class AgentRequest(BaseModel):
    # The conversation so far, in the phone's shape (see backend/agent.py).
    messages: list[dict]
    # The tools from app/src/agentTools.ts: name, description, inputs.
    tools: list[dict]


@app.post("/agent")
def agent_step(request: AgentRequest):
    """One step of the AI helper: the model reads the conversation and either
    asks for tools or says it is done. The loop itself runs on the phone."""
    unknown = [t.get("name") for t in request.tools if t.get("name") not in agent.AGENT_TOOLS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"not in agent/TOOLS.md: {unknown}")
    instructions_file = PROMPTS / "agent.md"
    if not instructions_file.exists():
        raise HTTPException(status_code=503, detail="prompts/agent.md is not written yet")
    calls_so_far = sum(1 for m in request.messages if isinstance(m["content"], list)
                       for b in m["content"] if b.get("type") == "tool_use")
    try:
        parts = llm.ask_with_tools(instructions_file.read_text(encoding="utf-8"), agent.to_gemini(request.messages),
                                   agent.declarations(request.tools))
    except llm.LLMError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return {"content": agent.from_gemini(parts, calls_so_far)}
