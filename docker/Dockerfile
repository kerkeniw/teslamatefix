# syntax=docker/dockerfile:1.7
#
# TeslaMateFix — image production multi-stage.
#
# Stages :
#   1. deps    — installe les dépendances (full, devDeps incluses pour disposer
#                de la CLI Prisma et des outils de build Next).
#   2. builder — copie la source, génère le client Prisma puis lance `next build`.
#                Avec `output: 'standalone'` configuré dans next.config.ts, la
#                sortie est un répertoire `.next/standalone/` autoportant.
#   3. runner  — image runtime minimale, lance `node server.js` en USER node.
#
# Image runtime : `node:22-bookworm-slim` (et non Alpine) car le client Prisma
# 6 généré sur ce projet fournit `libquery_engine-debian-openssl-3.0.x.so.node`,
# qui est lié à glibc + OpenSSL 3 (présents sur Debian Bookworm). Utiliser
# Alpine forcerait à ajouter `linux-musl-openssl-3.0.x` aux `binaryTargets` du
# schema.prisma, ce qui sort du périmètre de cette étape.
#
# Build (depuis la racine du repo, avec BuildKit activé) :
#   docker build -f docker/Dockerfile -t teslamatefix:local .
#
# Cache npm via BuildKit `--mount=type=cache` : accélère les builds successifs
# sans grossir l'image finale (le cache reste hors layer).

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Stage 1 — deps : install dépendances (full, pour disposer de la CLI Prisma).
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Outils nécessaires aux postinstall natifs (sharp, prisma generate).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

# On copie le schéma Prisma avant `npm ci` car `postinstall` lance `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Cache npm pour les builds incrémentaux.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# ---------------------------------------------------------------------------
# Stage 2 — builder : copie la source + build Next.js (mode standalone).
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# OpenSSL requis pour le runtime Prisma au moment de `prisma generate`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

# Récupère les dépendances + le client Prisma déjà généré au stage deps.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/prisma ./prisma

# Copie le reste de la source. .dockerignore filtre les artefacts locaux.
COPY . .

# Re-génère le client Prisma au cas où la copie l'aurait écrasé, puis build.
RUN npx prisma generate \
 && npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runner : image runtime minimale.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# OpenSSL pour le binaire libquery_engine de Prisma + wget pour le HEALTHCHECK.
# `tini` (init PID 1) gère proprement les signaux (SIGTERM/SIGINT) lors d'un
# `docker stop`, important pour fermer les connexions Prisma avant kill.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl wget tini \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/.next /data \
 && chown -R node:node /app /data

# Sortie standalone Next.js : contient server.js + un node_modules minimal
# avec le client Prisma déjà inclus par le tracing automatique de Next 16.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Assets statiques Next (chunks JS, images optimisées).
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Fichiers servis tels quels par Next (favicons, svg…).
COPY --from=builder --chown=node:node /app/public ./public

# Filet de sécurité : on copie explicitement le client Prisma au cas où le
# tracing standalone n'en capture pas toutes les facettes (certaines builds
# omettent les query engines selon la résolution dynamique). Inoffensif si
# déjà présent — la copie écrase simplement à l'identique.
COPY --from=builder --chown=node:node /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client

# bcryptjs n'est pas tracé par le standalone build de Next.js (il n'est
# référencé que dans des fichiers `"use server"` que le tracer omet parfois).
# On le copie explicitement pour qu'il soit disponible :
#   - côté entrypoint (génère le hash bcrypt par défaut au premier démarrage),
#   - côté runtime (verifyCredentials + changePassword).
COPY --from=builder --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Entrypoint custom : bootstrap secrets + reconstruction DSN. Voir le commentaire
# en tête du fichier pour les détails.
COPY --chown=node:node docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER node

# Volume persistant : conserve auth_secret, username, password_hash et le flag
# force_password_change entre deux démarrages. À monter en named volume
# (`teslamatefix-data:/data`) côté compose.
VOLUME /data

EXPOSE 3001

# Healthcheck : ping de l'endpoint léger /api/health (sans accès DB).
# /api/health/db existe aussi pour vérifier la connectivité Postgres mais on
# l'évite ici pour ne pas faire dépendre la liveness du conteneur de la base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:3001/api/health || exit 1

# tini → entrypoint shell (bootstrap) → node server.js (passé via "$@").
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
