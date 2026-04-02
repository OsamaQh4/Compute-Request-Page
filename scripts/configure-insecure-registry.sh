#!/usr/bin/env bash
# =============================================================================
# configure-insecure-registry.sh
#
# Run this on EVERY node in the Kubernetes cluster (and on your build machine)
# because k8sreglvp01.gosi.ins:8080 uses plain HTTP.
# Both Docker and containerd need to be told to allow it.
#
# Run as root or with sudo.
# =============================================================================
set -euo pipefail

REGISTRY="k8sreglvp01.gosi.ins:8080"

# ── 1. Docker daemon (if Docker is the container runtime) ─────────────────────
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
if command -v docker &>/dev/null; then
  echo "Configuring Docker insecure registry..."
  mkdir -p /etc/docker

  # Merge into existing daemon.json if present, otherwise create fresh
  if [ -f "$DOCKER_DAEMON_JSON" ]; then
    # Simple approach: check if already set
    if grep -q "$REGISTRY" "$DOCKER_DAEMON_JSON"; then
      echo "  Already configured in $DOCKER_DAEMON_JSON — skipping."
    else
      echo "  WARNING: $DOCKER_DAEMON_JSON exists. Add manually:"
      echo "  { \"insecure-registries\": [\"$REGISTRY\"] }"
    fi
  else
    cat > "$DOCKER_DAEMON_JSON" <<EOF
{
  "insecure-registries": ["$REGISTRY"]
}
EOF
    echo "  Written to $DOCKER_DAEMON_JSON"
    systemctl restart docker && echo "  Docker restarted."
  fi
fi

# ── 2. containerd (if containerd is the container runtime — common on K8s) ────
CONTAINERD_CONFIG="/etc/containerd/config.toml"
HOSTS_DIR="/etc/containerd/certs.d/${REGISTRY}"

if command -v containerd &>/dev/null; then
  echo "Configuring containerd insecure registry..."
  mkdir -p "$HOSTS_DIR"
  cat > "${HOSTS_DIR}/hosts.toml" <<EOF
# Allow plain HTTP for this registry
server = "http://${REGISTRY}"

[host."http://${REGISTRY}"]
  capabilities = ["pull", "resolve", "push"]
  skip_verify = true
EOF
  echo "  Written to ${HOSTS_DIR}/hosts.toml"
  systemctl restart containerd && echo "  containerd restarted."
fi

echo ""
echo "Done. Insecure registry ${REGISTRY} is now allowed."
echo "Verify with:  curl http://${REGISTRY}/v2/_catalog"
