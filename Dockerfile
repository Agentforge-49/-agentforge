FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    AGENT_ENGINE_URL="http://127.0.0.1:8000" \
    ENGINE_INTERNAL_PORT="8000"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY engine/requirements.txt ./engine/requirements.txt
RUN python3 -m venv /opt/venv \
    && pip install --no-cache-dir --upgrade -r ./engine/requirements.txt

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY engine ./engine
COPY backend ./backend
COPY deploy/start-combined.sh ./deploy/start-combined.sh

RUN chmod +x ./deploy/start-combined.sh

EXPOSE 10000

CMD ["./deploy/start-combined.sh"]
