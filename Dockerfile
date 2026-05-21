FROM node:22-bookworm-slim AS build

ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
ENV DATABASE_URL=postgresql://sagep:sagep123@postgres:5432/sagep?schema=public

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json prisma.config.ts ./
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
ENV DATABASE_URL=postgresql://sagep:sagep123@postgres:5432/sagep?schema=public

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /root/.cache/puppeteer /root/.cache/puppeteer

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
