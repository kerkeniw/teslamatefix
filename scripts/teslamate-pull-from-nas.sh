#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# teslamate-pull-from-nas.sh — dump de la base TeslaMate du NAS + restore local.
#
# 1. se connecte au NAS (SSH), lance pg_dump via `sudo docker-compose exec`
#    et écrit le dump sur le NAS (une copie y reste) ;
# 2. rapatrie le dump en local par scp ;
# 3. enchaîne teslamate-restore.sh sur ce fichier.
#
# Usage (depuis le répertoire du docker-compose TeslaMate local) :
#   ./teslamate-pull-from-nas.sh               # dump + download + restore
#   ./teslamate-pull-from-nas.sh --no-restore  # dump + download seulement
#   ./teslamate-pull-from-nas.sh --yes         # restore sans confirmation
#
# Variables d'env honorées (sinon valeurs du `.env` puis défauts) :
#   NAS_HOST         (défaut : mynassrv — alias ~/.ssh/config)
#   NAS_COMPOSE_DIR  (défaut : /var/services/homes/Wicem/TeslaMate)
#   NAS_DUMP_DIR     (défaut : $NAS_COMPOSE_DIR/backups)
#   LOCAL_DUMP_DIR   (défaut : ./data)
#   DATABASE_USER / DATABASE_NAME (défaut : teslamate)
# ----------------------------------------------------------------------------
set -euo pipefail

NAS_PG_SERVICE="database"

show_help() {
  sed -n '2,21p' "$0" | sed 's/^# \?//'
}

DO_RESTORE=true
RESTORE_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -h|--help) show_help; exit 0 ;;
    --no-restore) DO_RESTORE=false ;;
    --yes|-y) RESTORE_ARGS+=(--yes) ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

# Le restore est cherché à côté du script réel (fonctionne via symlink).
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
RESTORE_SCRIPT="$SCRIPT_DIR/teslamate-restore.sh"

# ---- Configuration ------------------------------------------------------------
# Priorité : env exporté > .env > défauts.
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi
NAS_HOST="${NAS_HOST:-mynassrv}"
NAS_COMPOSE_DIR="${NAS_COMPOSE_DIR:-/var/services/homes/Wicem/TeslaMate}"
NAS_DUMP_DIR="${NAS_DUMP_DIR:-$NAS_COMPOSE_DIR/backups}"
LOCAL_DUMP_DIR="${LOCAL_DUMP_DIR:-./data}"
DB_USER="${DATABASE_USER:-teslamate}"
DB_NAME="${DATABASE_NAME:-teslamate}"

DUMP_NAME="teslamate-$(date +%Y%m%d-%H%M).bck"
REMOTE_FILE="$NAS_DUMP_DIR/$DUMP_NAME"
LOCAL_FILE="$LOCAL_DUMP_DIR/$DUMP_NAME"

# ---- Pré-requis ---------------------------------------------------------------
if [[ "$DO_RESTORE" == true ]]; then
  if [[ ! -x "$RESTORE_SCRIPT" ]]; then
    echo "❌ Script de restore introuvable : $RESTORE_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -f docker-compose.yml && ! -f compose.yml && ! -f docker-compose.yaml ]]; then
    echo "❌ Aucun docker-compose.yml dans $(pwd). Lancer depuis le répertoire du compose TeslaMate local." >&2
    exit 1
  fi
fi
mkdir -p "$LOCAL_DUMP_DIR"

cat <<EOF

→ Pull TeslaMate depuis le NAS
   NAS          : $NAS_HOST  (compose : $NAS_COMPOSE_DIR, service : $NAS_PG_SERVICE)
   Dump NAS     : $REMOTE_FILE
   Dump local   : $LOCAL_FILE
   Restore      : $DO_RESTORE

EOF

# ---- Connexion SSH maître (mot de passe SSH demandé une seule fois) -----------
CTL_DIR="$(mktemp -d)"
CTL_SOCKET="$CTL_DIR/ssh.sock"
SSH_OPTS=(-o ControlPath="$CTL_SOCKET")

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$NAS_HOST" >/dev/null 2>&1 || true
  rm -rf "$CTL_DIR"
  rm -f "$LOCAL_FILE.part"
}
trap cleanup EXIT

echo "→ [1/4] Connexion à $NAS_HOST…"
ssh -M "${SSH_OPTS[@]}" -o ControlPersist=10m -fN "$NAS_HOST"

# ---- Dump sur le NAS ----------------------------------------------------------
echo "→ [2/4] pg_dump sur le NAS (sudo peut demander le mot de passe)…"
# La redirection `>` s'exécute en tant qu'utilisateur SSH (pas root) : le
# fichier reste lisible par scp.
REMOTE_CMD="cd $(printf '%q' "$NAS_COMPOSE_DIR") \
  && mkdir -p $(printf '%q' "$NAS_DUMP_DIR") \
  && sudo /usr/local/bin/docker-compose exec -T $NAS_PG_SERVICE pg_dump -U $(printf '%q' "$DB_USER") $(printf '%q' "$DB_NAME") \
     > $(printf '%q' "$REMOTE_FILE")"
ssh "${SSH_OPTS[@]}" -t "$NAS_HOST" "$REMOTE_CMD"

# Un dump complet se termine par ce marqueur — sinon pg_dump a été interrompu.
if ! ssh "${SSH_OPTS[@]}" "$NAS_HOST" \
    "tail -c 200 $(printf '%q' "$REMOTE_FILE") | grep -q 'PostgreSQL database dump complete'"; then
  echo "❌ Dump incomplet sur le NAS : $REMOTE_FILE" >&2
  exit 1
fi
REMOTE_SIZE="$(ssh "${SSH_OPTS[@]}" "$NAS_HOST" "wc -c < $(printf '%q' "$REMOTE_FILE")" | tr -d '[:space:]')"
echo "  dump OK ($REMOTE_SIZE octets)"

# ---- Téléchargement -----------------------------------------------------------
echo "→ [3/4] Téléchargement…"
# Vers .part puis mv : le restore (qui prend le dernier teslamate*.bck d'un
# répertoire) ne peut jamais tomber sur un fichier tronqué.
scp -O "${SSH_OPTS[@]}" "$NAS_HOST:$REMOTE_FILE" "$LOCAL_FILE.part"
LOCAL_SIZE="$(wc -c < "$LOCAL_FILE.part" | tr -d '[:space:]')"
if [[ "$LOCAL_SIZE" != "$REMOTE_SIZE" ]]; then
  echo "❌ Taille différente (NAS : $REMOTE_SIZE, local : $LOCAL_SIZE)." >&2
  exit 1
fi
mv "$LOCAL_FILE.part" "$LOCAL_FILE"
echo "  $LOCAL_FILE ($(du -h "$LOCAL_FILE" | cut -f1))"

# ---- Restore ------------------------------------------------------------------
if [[ "$DO_RESTORE" != true ]]; then
  echo "→ [4/4] Restore ignoré (--no-restore)."
  echo
  echo "✅ Dump récupéré : $LOCAL_FILE"
  exit 0
fi

echo "→ [4/4] Restore local…"
"$RESTORE_SCRIPT" "$LOCAL_FILE" "${RESTORE_ARGS[@]}"
