#!/usr/bin/env bash
# =============================================================================
# build-push.sh
#
# Builds both app images and pushes them to Harbor.
# Run this on the Harbor server (K8SREGLVP01) which has Podman.
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

# ── Detect CLI ────────────────────────────────────────────────────────────────
if command -v podman &>/dev/null; then
  CLI="podman"
elif command -v docker &>/dev/null; then
  CLI="docker"
else
  echo "ERROR: Neither podman nor docker found."
  exit 1
fi
echo "Using: ${CLI}"

# ── Configure insecure registry (HTTP) ───────────────────────────────────────
if [ "${CLI}" = "podman" ]; then
  REGISTRIES_CONF="/etc/containers/registries.conf"
  if ! grep -q "${HARBOR_URL}" "${REGISTRIES_CONF}" 2>/dev/null; then
    echo "Adding ${HARBOR_URL} as insecure registry in ${REGISTRIES_CONF}..."
    cat >> "${REGISTRIES_CONF}" <<EOF

[[registry]]
location = "${HARBOR_URL}"
insecure = true
EOF
  fi
else
  DAEMON_JSON="/etc/docker/daemon.json"
  if ! grep -q "${HARBOR_URL}" "${DAEMON_JSON}" 2>/dev/null; then
    echo "Adding ${HARBOR_URL} to Docker insecure-registries..."
    mkdir -p /etc/docker
    cat > "${DAEMON_JSON}" <<EOF
{
  "insecure-registries": ["${HARBOR_URL}"]
}
EOF
    systemctl restart docker && sleep 3
  fi
fi

# ── Login ─────────────────────────────────────────────────────────────────────
echo ""
echo "Logging in to ${HARBOR_URL}..."
echo "${HARBOR_PASSWORD}" | ${CLI} login \
  --tls-verify=false \
  "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "Building backend → ${BACKEND_IMAGE}"
${CLI} build \
  --tls-verify=false \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${BACKEND_IMAGE}" \
  ./backend

echo "Pushing ${BACKEND_IMAGE}..."
${CLI} push --tls-verify=false "${BACKEND_IMAGE}"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "Building frontend → ${FRONTEND_IMAGE}"
${CLI} build \
  --tls-verify=false \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${FRONTEND_IMAGE}" \
  ./frontend

echo "Pushing ${FRONTEND_IMAGE}..."
${CLI} push --tls-verify=false "${FRONTEND_IMAGE}"

echo ""
echo "════════════════════════════════════════════════"
echo " Build & push complete!"
echo "   Backend : ${BACKEND_IMAGE}"
echo "   Frontend: ${FRONTEND_IMAGE}"
echo ""
echo " Next: kubectl apply -f k8s/"
echo "════════════════════════════════════════════════"
