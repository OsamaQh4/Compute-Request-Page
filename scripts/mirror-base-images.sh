#!/usr/bin/env bash
# =============================================================================
# mirror-base-images.sh
#
# Run this ONCE from a machine that has internet access AND can reach Harbor.
# It pulls the required Docker Hub base images and re-pushes them to your
# Harbor instance so the air-gapped build machines can use them.
#
# Usage:
#   export HARBOR_URL=k8sreglvp01.gosi.ins:8080
#   export HARBOR_PROJECT=dockerhub      # the Harbor project to push to
#   export HARBOR_USER=admin
#   export HARBOR_PASSWORD=yourpassword
#   bash scripts/mirror-base-images.sh
# =============================================================================
set -euo pipefail

HARBOR_URL="${HARBOR_URL:?Set HARBOR_URL}"
HARBOR_PROJECT="${HARBOR_PROJECT:-dockerhub}"
HARBOR_USER="${HARBOR_USER:?Set HARBOR_USER}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:?Set HARBOR_PASSWORD}"

# Base images required by the application
IMAGES=(
  "python:3.11-slim"
  "node:20-slim"
  "nginx:1.27-alpine"
)

echo "Logging in to Harbor at ${HARBOR_URL}..."
echo "${HARBOR_PASSWORD}" | docker login "${HARBOR_URL}" -u "${HARBOR_USER}" --password-stdin

for IMAGE in "${IMAGES[@]}"; do
  SRC="docker.io/${IMAGE}"
  DEST="${HARBOR_URL}/${HARBOR_PROJECT}/${IMAGE}"

  echo ""
  echo "──────────────────────────────────────────────"
  echo "  Mirroring: ${SRC}"
  echo "        → : ${DEST}"
  echo "──────────────────────────────────────────────"

  docker pull "${SRC}"
  docker tag  "${SRC}" "${DEST}"
  docker push "${DEST}"

  echo "  Done: ${DEST}"
done

echo ""
echo "All base images mirrored successfully."
echo "You can now run build-push.sh on your build server."
