#!/usr/bin/env bash
# =============================================================================
# build-push.sh
#
# Builds both application images using base images from Harbor, then pushes
# them to your Harbor project. Run this from the repo root on your build server
# (which only needs to reach Harbor — no internet required).
#
# Usage:
#   export HARBOR_URL=k8sreglvp01.gosi.ins:8080
#   export HARBOR_PROJECT=vm-portal      # project for your app images
#   export HARBOR_BASE_PROJECT=vm-portal # project where base images were mirrored
#   export HARBOR_USER=admin
#   export HARBOR_PASSWORD=yourpassword
#   export IMAGE_TAG=1.0.0               # optional, defaults to "latest"
#   bash scripts/build-push.sh
# =============================================================================
set -euo pipefail

HARBOR_URL="${HARBOR_URL:-k8sreglvp01.gosi.ins:8080}"
HARBOR_PROJECT="${HARBOR_PROJECT:-vm-portal}"
HARBOR_BASE_PROJECT="${HARBOR_BASE_PROJECT:-vm-portal}"
HARBOR_USER="${HARBOR_USER:?Set HARBOR_USER}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:?Set HARBOR_PASSWORD}"
TAG="${IMAGE_TAG:-latest}"

BACKEND_IMAGE="${HARBOR_URL}/${HARBOR_PROJECT}/backend:${TAG}"
FRONTEND_IMAGE="${HARBOR_URL}/${HARBOR_PROJECT}/frontend:${TAG}"

# Ensure Docker allows this plain-HTTP registry on the build machine
if ! grep -q "${HARBOR_URL}" /etc/docker/daemon.json 2>/dev/null; then
  echo "Adding ${HARBOR_URL} to Docker insecure-registries on this machine..."
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<EOF
{
  "insecure-registries": ["${HARBOR_URL}"]
}
EOF
  systemctl restart docker
  sleep 3
fi

echo "Logging in to Harbor at ${HARBOR_URL}..."
echo "${HARBOR_PASSWORD}" | docker login "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "Building backend image → ${BACKEND_IMAGE}"
docker build \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${BACKEND_IMAGE}" \
  ./backend

echo "Pushing ${BACKEND_IMAGE}..."
docker push "${BACKEND_IMAGE}"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "Building frontend image → ${FRONTEND_IMAGE}"
docker build \
  --build-arg HARBOR_URL="${HARBOR_URL}" \
  --build-arg HARBOR_PROJECT="${HARBOR_BASE_PROJECT}" \
  -t "${FRONTEND_IMAGE}" \
  ./frontend

echo "Pushing ${FRONTEND_IMAGE}..."
docker push "${FRONTEND_IMAGE}"

echo ""
echo "════════════════════════════════════════════════"
echo " Build & push complete!"
echo "   Backend : ${BACKEND_IMAGE}"
echo "   Frontend: ${FRONTEND_IMAGE}"
echo ""
echo " Next: update k8s manifests with these image tags"
echo "       then run: kubectl apply -f k8s/"
echo "════════════════════════════════════════════════"
