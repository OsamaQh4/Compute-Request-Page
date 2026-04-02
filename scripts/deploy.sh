#!/usr/bin/env bash
# =============================================================================
# deploy.sh
#
# Applies all Kubernetes manifests to the cluster in the correct order.
# Assumes kubectl is configured and pointing at the right cluster/context.
#
# Usage:
#   bash scripts/deploy.sh
# =============================================================================
set -euo pipefail

K8S_DIR="$(cd "$(dirname "$0")/../k8s" && pwd)"

echo "Applying namespace..."
kubectl apply -f "${K8S_DIR}/namespace.yaml"

echo "Applying PVC..."
kubectl apply -f "${K8S_DIR}/pvc.yaml"

echo "Applying secrets..."
kubectl apply -f "${K8S_DIR}/secret.yaml"
# NOTE: harbor-registry-secret should be created manually via kubectl create secret
# docker-registry (see harbor-registry-secret.yaml for instructions).
# Only apply the file if you have filled in the .dockerconfigjson value.
# kubectl apply -f "${K8S_DIR}/harbor-registry-secret.yaml"

echo "Applying backend..."
kubectl apply -f "${K8S_DIR}/backend-deployment.yaml"

echo "Applying frontend..."
kubectl apply -f "${K8S_DIR}/frontend-deployment.yaml"

echo "Applying ingress..."
kubectl apply -f "${K8S_DIR}/ingress.yaml"

echo ""
echo "Waiting for deployments to become ready..."
kubectl rollout status deployment/vm-portal-backend  -n vm-portal --timeout=120s
kubectl rollout status deployment/vm-portal-frontend -n vm-portal --timeout=120s

echo ""
echo "════════════════════════════════════════════════"
echo " Deployment complete!"
kubectl get pods -n vm-portal
echo "════════════════════════════════════════════════"
