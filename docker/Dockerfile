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
# Image runtime : `node:24-bookworm-slim` (Node 24 = LTS active). Depuis Prisma 7
# (v0.8.0), plus de moteur Rust ni de binaire lié à OpenSSL : le client est du
# TypeScript généré dans `src/generated/prisma`, embarqué par `next build`, et la
# connexion passe par `@prisma/adapter-pg` + `pg` (tracés dans le standalone).
#
# Build (depuis la racine du repo, avec BuildKit activé) :
#   docker build -f docker/Dockerfile -t teslamatefix:local .
#
# Cache npm via BuildKit `--mount=type=cache` : accélère les builds successifs
# sans grossir l'image finale (le cache reste hors layer).

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Stage 1 — deps : install dépendances (full, pour disposer de la CLI Prisma).
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Certificats pour les téléchargements des postinstall (sharp).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Schéma + config Prisma avant `npm ci` car `postinstall` lance `prisma generate`
# (sortie dans src/generated/prisma, sans besoin de DATABASE_URL).
COPY package.json package-lock.json prisma.config.ts ./
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

# Placeholders pour permettre à `next build` de collecter les pages
# dynamiques. `src/lib/env.ts` exige AUTH_SECRET (≥32 chars) et DATABASE_URL
# au chargement du module. Au runtime (stage runner), l'entrypoint Docker
# fournit les vraies valeurs (lues depuis /data ou les vars d'env).
# Le stage runner n'hérite PAS de ces ENV — ils restent confinés ici.
ENV AUTH_SECRET=build-time-placeholder-min-32-chars-aaaaaaaa
ENV DATABASE_URL=postgresql://placeholder:placeholder@placeholder:5432/placeholder?schema=public

# Récupère les dépendances installées au stage deps.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/prisma ./prisma

# Copie le reste de la source. .dockerignore filtre les artefacts locaux.
COPY . .

# Génère le client Prisma (src/generated, exclu du contexte), puis build.
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
# Clé publique Tesla (Fleet API) servie sur /.well-known/appspecific/...
# Monter en lecture seule le fichier (ou le dossier) à cet emplacement.
ENV TESLA_PUBLIC_KEY_FILE=/well-known/com.tesla.3p.public-key.pem

# wget pour le HEALTHCHECK. `tini` (init PID 1) gère proprement les signaux
# (SIGTERM/SIGINT) lors d'un `docker stop`, important pour fermer les
# connexions à la base avant kill. Plus d'OpenSSL : Prisma 7 n'a plus de moteur.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget tini \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/.next /data /well-known \
 && chown -R node:node /app /data /well-known

# Sortie standalone Next.js : contient server.js + un node_modules minimal
# (runtime Prisma, adaptateur pg et pilote pg inclus par le tracing de Next).
# Le client Prisma 7 généré est du code source, compilé dans le bundle.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Assets statiques Next (chunks JS, images optimisées).
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Fichiers servis tels quels par Next (favicons, svg…).
COPY --from=builder --chown=node:node /app/public ./public

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
