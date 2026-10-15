FROM node:22-bookworm-slim AS build

ENV PUPPETEER_SKIP_DOWNLOAD=true
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
# Preserve o engine de migrations antes do prune. Algumas versões do npm
# removem @prisma/engines por tratá-lo como dependência transitória opcional.
RUN install -D -m 0755 \
    /app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x \
    /opt/prisma/schema-engine
# O mesmo conjunto validado no estágio de compilação é reaproveitado na imagem
# final. Isso evita uma segunda instalação de rede e mantém apenas dependências
# necessárias em produção.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# O engine é baixado e validado no estágio de build. Em produção, o Prisma
# deve usar exclusivamente o binário empacotado, inclusive em redes isoladas.
ENV PRISMA_SCHEMA_ENGINE_BINARY=/opt/prisma/schema-engine
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

WORKDIR /app

RUN groupadd --system sagep && useradd --system --gid sagep --create-home sagep

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    curl \
    fonts-liberation \
    libreoffice-writer \
    poppler-utils \
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
    python3 \
    python3-venv \
    tar \
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

COPY scripts/signature-validation/requirements.txt /app/scripts/signature-validation/requirements.txt
RUN python3 -m venv /opt/sagep-validator \
  && /opt/sagep-validator/bin/pip install --no-cache-dir -r /app/scripts/signature-validation/requirements.txt
ENV PDF_VALIDATION_PYTHON=/opt/sagep-validator/bin/python
COPY scripts/signature-validation/validate_pdf.py /app/scripts/signature-validation/validate_pdf.py

COPY package.json package-lock.json .npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build --chown=sagep:sagep /opt/prisma/schema-engine /opt/prisma/schema-engine

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets ./src/assets
COPY --from=build /app/src/generated ./src/generated

RUN install -d -o sagep -g sagep -m 0700 \
    /app/backups \
    /app/evidence-files \
    /app/bootstrap \
    /app/pki \
    /app/tls \
  && test -x /opt/prisma/schema-engine \
  && test -x /usr/bin/chromium \
  && chromium --version

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/server.js"]
