FROM node:22-bookworm-slim AS build

ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
# URL sintaticamente valida usada apenas pelo Prisma durante a geracao.
# A URL real e injetada em tempo de execucao pelo ambiente.
ENV DATABASE_URL=postgresql://localhost:5432/sagep?schema=public

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json prisma.config.ts ./
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/home/sagep/.cache/puppeteer

WORKDIR /app

RUN groupadd --system sagep && useradd --system --gid sagep --create-home sagep

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
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
    openssl \
    gosu \
    gnupg \
    wget \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets ./src/assets
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /root/.cache/puppeteer /home/sagep/.cache/puppeteer

RUN mkdir -p /app/backups \
  && chown -R sagep:sagep /app /home/sagep

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
