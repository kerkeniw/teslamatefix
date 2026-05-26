#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# teslamate-restore.sh — restore automatisé d'un dump TeslaMate.
#
# Implémente la procédure officielle :
#   https://docs.teslamate.org/docs/maintenance/backup_restore/
#
# Usage :
#   ./teslamate-restore.sh <fichier.bck>          # restaure ce fichier
#   ./teslamate-restore.sh <répertoire>           # prend le dernier teslamate*.bck
#   ./teslamate-restore.sh <chemin> --yes         # sans confirmation (CI/cron)
#
# Le script doit être lancé depuis le répertoire qui contient le
# `docker-compose.yml` de TeslaMate (il appelle `docker compose` sans `-f`).
#
# Variables d'env honorées (sinon valeurs du `.env` puis defaults TeslaMate) :
#   DATABASE_USER  (défaut : teslamate)
#   DATABASE_NAME  (défaut : teslamate)
#
# Le service Postgres est supposé s'appeler `database` (compose officiel
# TeslaMate). Pour un nom différent : éditer PG_SERVICE ci-dessous.
# ----------------------------------------------------------------------------
set -euo pipefail

PG_SERVICE="database"
TM_SERVICE="teslamate"
DUMP_GLOB="teslamate*.bck"

show_help() {
  sed -n '2,21p' "$0" | sed 's/^# \?//'
}

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

TARGET="$1"
shift || true

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

# ---- Résolution du fichier de dump --------------------------------------------
if [[ -d "$TARGET" ]]; then
  # find au lieu de `ls`/glob pour gérer espaces et résultats vides proprement.
  DUMP_FILE="$(find "$TARGET" -maxdepth 1 -type f -name "$DUMP_GLOB" \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
  if [[ -z "${DUMP_FILE:-}" ]]; then
    echo "❌ Aucun fichier '$DUMP_GLOB' trouvé dans : $TARGET" >&2
    exit 1
  fi
  echo "→ Dernier dump détecté : $DUMP_FILE"
elif [[ -f "$TARGET" ]]; then
  DUMP_FILE="$TARGET"
else
  echo "❌ '$TARGET' n'est ni un fichier ni un répertoire." >&2
  exit 1
fi

# Chemin absolu — psql lit via stdin donc le fichier peut être n'importe où.
DUMP_FILE="$(readlink -f "$DUMP_FILE")"

# ---- Pré-requis ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable dans le PATH." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "❌ 'docker compose' (plugin v2) requis." >&2
  exit 1
fi
if [[ ! -f docker-compose.yml && ! -f compose.yml && ! -f docker-compose.yaml ]]; then
  echo "❌ Aucun docker-compose.yml dans $(pwd). Copier ce script à côté du compose TeslaMate." >&2
  exit 1
fi

# ---- Récupère DATABASE_USER / DATABASE_NAME -----------------------------------
# Priorité : env exporté > .env > default TeslaMate ("teslamate").
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi
DB_USER="${DATABASE_USER:-teslamate}"
DB_NAME="${DATABASE_NAME:-teslamate}"

# ---- Confirmation -------------------------------------------------------------
SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
cat <<EOF

⚠️  RESTORE TESLAMATE — opération destructive
   Compose dir : $(pwd)
   Service DB  : $PG_SERVICE  (user=$DB_USER, db=$DB_NAME)
   Dump        : $DUMP_FILE  ($SIZE)
   Le schéma 'public' et 'private' de la base $DB_NAME seront DROP CASCADE.

EOF

if [[ "$ASSUME_YES" != true ]]; then
  read -r -p "Continuer ? [y/N] " ans
  [[ "$ans" =~ ^[yY]$ ]] || { echo "Annulé."; exit 0; }
fi

# ---- Procédure ----------------------------------------------------------------
echo "→ [1/4] Stop $TM_SERVICE…"
# Non bloquant : si le service n'est pas déclaré dans le compose, on saute.
# `|| true` couvre aussi le cas où il est déjà arrêté.
if docker compose config --services 2>/dev/null | grep -qx "$TM_SERVICE"; then
  docker compose stop "$TM_SERVICE" || echo "  (stop a échoué, on continue)"
else
  echo "  ($TM_SERVICE absent du compose — skip)"
fi

echo "→ [2/4] Reset schémas public/private…"
# IF EXISTS pour rester idempotent si 'private' n'a pas encore été créé
# (cas d'une base fraîchement initialisée). Sinon strictement conforme à
# la doc TeslaMate.
docker compose exec -T "$PG_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION cube WITH SCHEMA public;
CREATE EXTENSION earthdistance WITH SCHEMA public;
SQL

echo "→ [3/4] Restore du dump (stream via stdin)…"
docker compose exec -T "$PG_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" < "$DUMP_FILE"

echo "→ [4/4] Restart $TM_SERVICE…"
if docker compose config --services 2>/dev/null | grep -qx "$TM_SERVICE"; then
  docker compose start "$TM_SERVICE" || echo "  (start a échoué — à relancer manuellement)"
else
  echo "  ($TM_SERVICE absent du compose — skip)"
fi

echo
echo "✅ Restore terminé depuis : $DUMP_FILE"
