"""The whole app at one https address, for hosting (Render).

On the Mac, two servers run: Vite serves the app and passes /api to the
backend. Online, this one server does both:
  /api/...   the backend (backend/main.py)
  /...       the built app (app/dist), including the offline files

Run it after building the app:
    npm --prefix app run build
    .venv/bin/uvicorn backend.serve:site
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.main import app as backend

site = FastAPI(title="ReplyBy")
site.mount("/api", backend)
# html=True serves index.html for "/", like Vite does.
site.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "app" / "dist", html=True), name="app")
