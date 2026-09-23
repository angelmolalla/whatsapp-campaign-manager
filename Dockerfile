FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    AUTH_DIR=/data/whatsapp \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation fonts-noto-color-emoji tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci --omit=dev --no-audit --no-fund
COPY src/ ./src/
RUN mkdir -p /data/whatsapp

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
