#!/bin/sh
# ----------------------------------------------------------------------------
# TeslaMateFix entrypoint — bootstrap "grand public".
#
# Au premier démarrage (volume /data vide), génère un secret de session
# aléatoire, un username par défaut ("admin"), un hash bcrypt du mot de
# passe par défaut ("admin"), et un flag qui force l'utilisateur à changer
# son mot de passe dès le premier login (pattern Grafana).
#
# Les secrets sont persistés en mode 600 dans /data. Au redémarrage, on
# les re-lit (rien n'est régénéré si le fichier existe).
#
# Reconstruit aussi DATABASE_URL si l'utilisateur a uniquement fourni
# DATABASE_USER / DATABASE_PASS / DATABASE_NAME (variables conventionnelles
# du compose TeslaMate).
# ----------------------------------------------------------------------------
set -eu

DATA_DIR="${TMFIX_SECRETS_DIR:-/data}"
DB_HOST="${DATABASE_HOST:-database}"
DB_PORT="${DATABASE_PORT:-5432}"

log() {
  printf '[entrypoint] %s\n' "$*"
}

# ---------------------------------------------------------------------------
# 1. Reconstruction DATABASE_URL si absente.
# ---------------------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${DATABASE_USER:-}" ] && [ -n "${DATABASE_PASS:-}" ] && [ -n "${DATABASE_NAME:-}" ]; then
    DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASS}@${DB_HOST}:${DB_PORT}/${DATABASE_NAME}?schema=public"
    export DATABASE_URL
    log "DATABASE_URL reconstruite depuis DATABASE_USER/PASS/NAME (host=${DB_HOST}, db=${DATABASE_NAME})."
  else
    log "ERREUR : ni DATABASE_URL ni DATABASE_USER+DATABASE_PASS+DATABASE_NAME fournies."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 2. Bootstrap des secrets persistants dans /data.
# ---------------------------------------------------------------------------
mkdir -p "$DATA_DIR"

# AUTH_SECRET : 32 octets base64 (clé iron-session).
if [ -z "${AUTH_SECRET:-}" ]; then
  if [ ! -f "$DATA_DIR/auth_secret" ]; then
    log "Génération AUTH_SECRET → $DATA_DIR/auth_secret"
    # node fournit crypto.randomBytes ; pas besoin d'openssl.
    node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))' \
      > "$DATA_DIR/auth_secret"
    chmod 600 "$DATA_DIR/auth_secret"
  fi
  AUTH_SECRET="$(cat "$DATA_DIR/auth_secret")"
  export AUTH_SECRET
fi

# AUTH_USERNAME : "admin" par défaut.
if [ -z "${AUTH_USERNAME:-}" ]; then
  if [ ! -f "$DATA_DIR/username" ]; then
    log "Username par défaut → admin"
    printf 'admin' > "$DATA_DIR/username"
    chmod 600 "$DATA_DIR/username"
  fi
  AUTH_USERNAME="$(cat "$DATA_DIR/username")"
  export AUTH_USERNAME
fi

# AUTH_PASSWORD_HASH : si non défini en env, et si le fichier n'existe pas,
# génère un hash de "admin" et pose le flag force_password_change.
if [ -z "${AUTH_PASSWORD_HASH:-}" ]; then
  if [ ! -f "$DATA_DIR/password_hash" ]; then
    log "Mot de passe par défaut admin/admin → $DATA_DIR/password_hash"
    node -e 'process.stdout.write(require("bcryptjs").hashSync("admin", 12))' \
      > "$DATA_DIR/password_hash"
    chmod 600 "$DATA_DIR/password_hash"
    : > "$DATA_DIR/force_password_change"
    chmod 600 "$DATA_DIR/force_password_change"
    log "Flag force_password_change posé. Le premier login redirigera vers /change-password."
  fi
  # Note : on n'exporte PAS AUTH_PASSWORD_HASH dans env. C'est le code Next
  # (auth.ts:getCurrentPasswordHash) qui relit le fichier à chaque login.
  # Sinon l'env "fige" la valeur et empêche la rotation à chaud.
fi

# ---------------------------------------------------------------------------
# 3. Exec final — passe au CMD défini dans le Dockerfile.
# ---------------------------------------------------------------------------
exec "$@"
