#!/usr/bin/env bash
# =============================================================================
# mirror-base-images.sh
#
# Run this on the Harbor server (K8SREGLVP01) which has Podman and internet
# access. It pulls base images from Docker Hub and pushes them into Harbor.
#
# Usage:
#   export HARBOR_USER=admin
#   export HARBOR_PASSWORD=yourpassword
#   bash scripts/mirror-base-images.sh
# =============================================================================
set -euo pipefail

HARBOR_URL="${HARBOR_URL:-k8sreglvp01.gosi.ins:8080}"
HARBOR_PROJECT="${HARBOR_PROJECT:-vm-portal}"
HARBOR_USER="${HARBOR_USER:?ERROR: set HARBOR_USER before running}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:?ERROR: set HARBOR_PASSWORD before running}"

IMAGES=(
  "python:3.11-slim"
  "node:20-slim"
  "nginx:1.27-alpine"
)

# ── Detect available container CLI (podman preferred, docker fallback) ─────────
if command -v podman &>/dev/null; then
  CLI="podman"
  # Podman uses --tls-verify=false for HTTP registries
  PULL_OPTS="--tls-verify=false"
  PUSH_OPTS="--tls-verify=false"
  LOGIN_OPTS="--tls-verify=false"
elif command -v docker &>/dev/null; then
  CLI="docker"
  PULL_OPTS=""
  PUSH_OPTS=""
  LOGIN_OPTS=""
else
  echo "ERROR: Neither podman nor docker found. Install one and retry."
  exit 1
fi

echo "Using: ${CLI}"
echo "Target registry: http://${HARBOR_URL}/${HARBOR_PROJECT}"
echo ""

# ── Login ─────────────────────────────────────────────────────────────────────
echo "Logging in to Harbor..."
echo "${HARBOR_PASSWORD}" | ${CLI} login ${LOGIN_OPTS} \
  "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin
echo ""

# ── Mirror each image ─────────────────────────────────────────────────────────
for IMAGE in "${IMAGES[@]}"; do
  SRC="docker.io/${IMAGE}"
  DEST="${HARBOR_URL}/${HARBOR_PROJECT}/${IMAGE}"

  echo "──────────────────────────────────────────────"
  echo "  Pull : ${SRC}"
  echo "  Push : ${DEST}"
  echo "──────────────────────────────────────────────"

  ${CLI} pull ${PULL_OPTS} "${SRC}"
  ${CLI} tag "${SRC}" "${DEST}"
  ${CLI} push ${PUSH_OPTS} "${DEST}"

  echo "  ✓ Done"
  echo ""
done

echo "All base images mirrored to Harbor."
echo ""
echo "Verify with:"
echo "  curl -u ${HARBOR_USER}:*** http://${HARBOR_URL}/v2/${HARBOR_PROJECT}/python/tags/list"
