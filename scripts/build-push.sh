#!/usr/bin/env bash
# =============================================================================
# build-push.sh
#
# Builds both app images and pushes them to Harbor.
# Run this on the Harbor server (K8SREGLVP01) which has Podman,
# OR on any machine that has Docker and can reach Harbor.
#
# Usage:
#   export HARBOR_USER=admin
#   export HARBOR_PASSWORD=yourpassword
#   export IMAGE_TAG=1.0.0      # optional, defaults to "latest"
#   bash scripts/build-push.sh
# =============================================================================
set -euo pipefail

HARBOR_URL="${HARBOR_URL:-k8sreglvp01.gosi.ins:8080}"
HARBOR_PROJECT="${HARBOR_PROJECT:-vm-portal}"
HARBOR_BASE_PROJECT="${HARBOR_BASE_PROJECT:-vm-portal}"
HARBOR_USER="${HARBOR_USER:?ERROR: set HARBOR_USER before running}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:?ERROR: set HARBOR_PASSWORD before running}"
TAG="${IMAGE_TAG:-latest}"

BACKEND_IMAGE="${HARBOR_URL}/${HARBOR_PROJECT}/backend:${TAG}"
FRONTEND_IMAGE="${HARBOR_URL}/${HARBOR_PROJECT}/frontend:${TAG}"

# ── Detect available container CLI ────────────────────────────────────────────
if command -v podman &>/dev/null; then
  CLI="podman"
  BUILD_OPTS="--tls-verify=false"
  PUSH_OPTS="--tls-verify=false"
  LOGIN_OPTS="--tls-verify=false"
elif command -v docker &>/dev/null; then
  CLI="docker"
  BUILD_OPTS=""
  PUSH_OPTS=""
  LOGIN_OPTS=""
else
  echo "ERROR: Neither podman nor docker found."
  exit 1
fi

echo "Using: ${CLI}"
echo ""

# ── Login ─────────────────────────────────────────────────────────────────────
echo "Logging in to Harbor..."
echo "${HARBOR_PASSWORD}" | ${CLI} login ${LOGIN_OPTS} \
  "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "Building backend → ${BACKEND_IMAGE}"
${CLI} build ${BUILD_OPTS} \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${BACKEND_IMAGE}" \
  ./backend

echo "Pushing ${BACKEND_IMAGE}..."
${CLI} push ${PUSH_OPTS} "${BACKEND_IMAGE}"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "Building frontend → ${FRONTEND_IMAGE}"
${CLI} build ${BUILD_OPTS} \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${FRONTEND_IMAGE}" \
  ./frontend

echo "Pushing ${FRONTEND_IMAGE}..."
${CLI} push ${PUSH_OPTS} "${FRONTEND_IMAGE}"

echo ""
echo "════════════════════════════════════════════════"
echo " Build & push complete!"
echo "   Backend : ${BACKEND_IMAGE}"
echo "   Frontend: ${FRONTEND_IMAGE}"
echo ""
echo " Next: kubectl apply -f k8s/"
echo "════════════════════════════════════════════════"
