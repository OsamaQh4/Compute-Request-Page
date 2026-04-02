#!/usr/bin/env bash
# =============================================================================
# setup-harbor-secret.sh
#
# Creates the Kubernetes imagePullSecret so the cluster can pull images
# from Harbor at k8sreglvp01.gosi.ins:8080.
#
# Run this ONCE after the vm-portal namespace exists.
#
# Usage:
#   export HARBOR_USER=admin           # your Harbor username
#   export HARBOR_PASSWORD=yourpassword
#   bash scripts/setup-harbor-secret.sh
# =============================================================================
set -euo pipefail

HARBOR_URL="k8sreglvp01.gosi.ins:8080"
NAMESPACE="vm-portal"
SECRET_NAME="harbor-registry-secret"

HARBOR_USER="${HARBOR_USER:?ERROR: set HARBOR_USER before running this script}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:?ERROR: set HARBOR_PASSWORD before running this script}"

echo "Creating namespace ${NAMESPACE} if it does not exist..."
kubectl get namespace "${NAMESPACE}" &>/dev/null || kubectl create namespace "${NAMESPACE}"

echo "Creating imagePullSecret '${SECRET_NAME}' in namespace '${NAMESPACE}'..."

# Delete existing secret if present so we can recreate cleanly
kubectl delete secret "${SECRET_NAME}" -n "${NAMESPACE}" --ignore-not-found

kubectl create secret docker-registry "${SECRET_NAME}" \
  --namespace "${NAMESPACE}" \
  --docker-server="http://${HARBOR_URL}" \
  --docker-username="${HARBOR_USER}" \
  --docker-password="${HARBOR_PASSWORD}"

echo ""
echo "✓ Secret created. Verifying..."
kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" -o jsonpath='{.metadata.name}' && echo " exists."

echo ""
echo "Also log Docker into Harbor on this build machine..."
echo "${HARBOR_PASSWORD}" | docker login "http://${HARBOR_URL}" \
  -u "${HARBOR_USER}" --password-stdin 2>/dev/null \
  && echo "✓ Docker login successful." \
  || echo "  (Docker login skipped — not required if only using kubectl)"
