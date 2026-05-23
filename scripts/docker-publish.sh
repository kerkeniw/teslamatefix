#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# docker-publish.sh — build (et push) de l'image Docker `wkerkeni/teslamatefix`.
#
# Usage :
#   ./scripts/docker-publish.sh <tag>          # build local single-archi (amd64)
#   ./scripts/docker-publish.sh <tag> --push   # build multi-archi + push Docker Hub
#
# Exemples :
#   ./scripts/docker-publish.sh v0.1.0
#   ./scripts/docker-publish.sh v0.1.0 --push
#
# Pré-requis :
#   - Docker Engine ≥ 24 avec plugin buildx.
#   - Pour `--push` : `docker login docker.io` au préalable (le script vérifie).
#
# Note registry : namespace Docker Hub = `wkerkeni` (≠ namespace GitHub
# `kerkeniw`). Voir docs/INSTALL.md §10.
# ----------------------------------------------------------------------------
set -euo pipefail

IMAGE_NAME="wkerkeni/teslamatefix"
BUILDER_NAME="teslamatefix-builder"
DOCKERFILE="docker/Dockerfile"
PLATFORMS_MULTI="linux/amd64,linux/arm64"
PLATFORMS_LOCAL="linux/amd64"

show_help() {
  sed -n '2,18p' "$0" | sed 's/^# \?//'
}

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

TAG="$1"
shift || true

PUSH=false
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

# Validation tag : "v" + semver (avec suffixe optionnel) — relâchée pour
# permettre des tags ad-hoc (ex. nightly). Avertit sans bloquer.
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-.+)?$ ]]; then
  echo "⚠️  Tag '$TAG' ne suit pas le format vMAJOR.MINOR.PATCH[-suffix] — build quand même." >&2
fi

# Sans le préfixe "v" pour l'image (cohérent avec metadata-action côté GHA).
TAG_NO_V="${TAG#v}"

# Vérif buildx
if ! docker buildx version >/dev/null 2>&1; then
  echo "❌ docker buildx requis. Installer le plugin buildx puis recommencer." >&2
  exit 1
fi

# Vérif authentification Docker Hub uniquement en mode push.
if [[ "$PUSH" == true ]]; then
  if ! docker info --format '{{.Username}}' 2>/dev/null | grep -q .; then
    echo "❌ Pas connecté à Docker Hub. Lancer 'docker login' puis relancer ce script." >&2
    exit 1
  fi
fi

# Crée le builder dédié si absent. `--driver docker-container` est requis
# pour buildx multi-archi.
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  echo "→ Création du builder buildx '$BUILDER_NAME'…"
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --use
else
  docker buildx use "$BUILDER_NAME"
fi

if [[ "$PUSH" == true ]]; then
  PLATFORMS="$PLATFORMS_MULTI"
  OUTPUT_FLAG="--push"
  echo "→ Build multi-archi ($PLATFORMS) + push vers Docker Hub…"
else
  # `--load` ne supporte qu'une seule plateforme à la fois.
  PLATFORMS="$PLATFORMS_LOCAL"
  OUTPUT_FLAG="--load"
  echo "→ Build local ($PLATFORMS) chargé dans le daemon (pas de push)…"
fi

docker buildx build \
  -f "$DOCKERFILE" \
  --platform "$PLATFORMS" \
  -t "${IMAGE_NAME}:${TAG_NO_V}" \
  -t "${IMAGE_NAME}:latest" \
  $OUTPUT_FLAG \
  .

echo
echo "✅ Image construite : ${IMAGE_NAME}:${TAG_NO_V}"
if [[ "$PUSH" == true ]]; then
  echo "✅ Pushée sur Docker Hub. Vérifier : docker pull ${IMAGE_NAME}:${TAG_NO_V}"
else
  echo "→ Image disponible localement : docker images ${IMAGE_NAME}"
  echo "→ Pour pousser : ./scripts/docker-publish.sh ${TAG} --push"
fi
