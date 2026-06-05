# syntax=docker/dockerfile:1

FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build


FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite:////app/data/globalsim.sqlite3
ENV API_HOST=0.0.0.0
ENV API_PORT=8000

RUN addgroup --system globalsim && adduser --system --ingroup globalsim globalsim

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data && chown -R globalsim:globalsim /app/data
USER globalsim

VOLUME ["/app/data"]
EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
