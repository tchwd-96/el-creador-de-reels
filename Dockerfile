# Stage 1: Build frontend assets
FROM node:22-slim AS frontend-builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

# Stage 2: Production Python + FFmpeg + Pillow + FastAPI runtime for Cloud Run
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8770

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend-builder /build/dist ./dist

RUN mkdir -p /tmp/jewelry_promo_studio/uploads /tmp/jewelry_promo_studio/outputs

EXPOSE 8770

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8770}"]
