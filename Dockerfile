# The recipe Render uses to put ReplyBy online at one https address.
# Step 1 builds the app; step 2 runs the backend, which also serves the app.

# Step 1: build the app (React) into plain files in app/dist.
FROM node:22-slim AS app
WORKDIR /repo
COPY app/package.json app/package-lock.json app/
RUN npm --prefix app ci
COPY app app
COPY core/rules core/rules
RUN npm --prefix app run build

# Step 2: the Python server. Only what it needs, so the photos, real letters
# and fake-letter images never go online.
FROM python:3.13-slim
WORKDIR /repo
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY prompts prompts
COPY --from=app /repo/app/dist app/dist
# Render tells the server which port to use. The API key is set in Render's
# settings, never in this file.
CMD uvicorn backend.serve:site --host 0.0.0.0 --port ${PORT:-8000}
