#!/usr/bin/env bash
# =============================================================================
# mirror-base-images.sh
#
# Run this on the Harbor server (K8SREGLVP01) which has Podman and internet
# access. Pulls base images from Docker Hub and pushes them into Harbor.
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
# --tls-verify=false only skips cert checks but still uses HTTPS.
# The registry must be declared insecure to force plain HTTP.
if [ "${CLI}" = "podman" ]; then
  REGISTRIES_CONF="/etc/containers/registries.conf"
  if ! grep -q "${HARBOR_URL}" "${REGISTRIES_CONF}" 2>/dev/null; then
    echo "Adding ${HARBOR_URL} as insecure registry in ${REGISTRIES_CONF}..."
    cat >> "${REGISTRIES_CONF}" <<EOF

[[registry]]
location = "${HARBOR_URL}"
insecure = true
EOF
    echo "  Done."
  else
    echo "  ${HARBOR_URL} already in ${REGISTRIES_CONF}."
  fi
else
  # Docker
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
    echo "  Done."
  else
    echo "  ${HARBOR_URL} already in ${DAEMON_JSON}."
  fi
fi

# ── Login ─────────────────────────────────────────────────────────────────────
echo ""
echo "Logging in to ${HARBOR_URL}..."
echo "${HARBOR_PASSWORD}" | ${CLI} login \
  --tls-verify=false \
  "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin

# ── Mirror each image ─────────────────────────────────────────────────────────
for IMAGE in "${IMAGES[@]}"; do
  SRC="docker.io/${IMAGE}"
  DEST="${HARBOR_URL}/${HARBOR_PROJECT}/${IMAGE}"

  echo ""
  echo "──────────────────────────────────────────────"
  echo "  Pull : ${SRC}"
  echo "  Push : ${DEST}"
  echo "──────────────────────────────────────────────"

  ${CLI} pull --tls-verify=false "${SRC}"
  ${CLI} tag "${SRC}" "${DEST}"
  ${CLI} push --tls-verify=false "${DEST}"

  echo "  ✓ Done"
done

echo ""
echo "All base images mirrored to Harbor."
echo ""
echo "Verify:"
echo "  curl -u ${HARBOR_USER}:'***' http://${HARBOR_URL}/v2/${HARBOR_PROJECT}/python/tags/list"
