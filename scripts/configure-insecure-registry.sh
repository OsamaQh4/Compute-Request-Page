#!/usr/bin/env bash
# =============================================================================
# configure-insecure-registry.sh
#
# Configures containerd 1.6+ on each K8s node to allow the plain-HTTP
# Harbor registry at k8sreglvp01.gosi.ins:8080.
#
# Run as root on EVERY cluster node (worker + control plane).
# Tested on: containerd 1.6.32, Kubernetes 1.28, Oracle Linux.
# =============================================================================
set -euo pipefail

REGISTRY="k8sreglvp01.gosi.ins:8080"
HOSTS_DIR="/etc/containerd/certs.d/${REGISTRY}"
CONTAINERD_CONFIG="/etc/containerd/config.toml"

echo "=== Configuring containerd for insecure registry: ${REGISTRY} ==="

# ── Step 1: Create the per-registry hosts.toml ────────────────────────────────
echo "[1/3] Writing ${HOSTS_DIR}/hosts.toml..."
mkdir -p "${HOSTS_DIR}"
cat > "${HOSTS_DIR}/hosts.toml" <<EOF
server = "http://${REGISTRY}"

[host."http://${REGISTRY}"]
  capabilities = ["pull", "resolve", "push"]
  skip_verify  = true
EOF
echo "      Done."

# ── Step 2: Enable config_path in containerd's main config ───────────────────
# containerd 1.6 requires this line in config.toml for hosts.toml to be read.
echo "[2/3] Ensuring config_path is set in ${CONTAINERD_CONFIG}..."

if [ ! -f "${CONTAINERD_CONFIG}" ]; then
  echo "      config.toml not found — generating default..."
  containerd config default > "${CONTAINERD_CONFIG}"
fi

# Check if config_path is already set to our directory
if grep -q 'config_path.*containerd/certs.d' "${CONTAINERD_CONFIG}"; then
  echo "      config_path already set — skipping."
else
  # Insert config_path under the [plugins."io.containerd.grpc.v1.cri".registry] section
  if grep -q '\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\]' "${CONTAINERD_CONFIG}"; then
    sed -i '/\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\]/a\        config_path = "/etc/containerd/certs.d"' "${CONTAINERD_CONFIG}"
    echo "      config_path inserted into existing registry section."
  else
    # Section doesn't exist — append it
    cat >> "${CONTAINERD_CONFIG}" <<'EOF'

[plugins."io.containerd.grpc.v1.cri".registry]
  config_path = "/etc/containerd/certs.d"
EOF
    echo "      Registry section + config_path appended."
  fi
fi

# ── Step 3: Restart containerd ────────────────────────────────────────────────
echo "[3/3] Restarting containerd..."
systemctl restart containerd
sleep 3
systemctl is-active containerd && echo "      containerd is running." || echo "      WARNING: containerd failed to start — check journalctl -u containerd"

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Verification ==="
echo "Checking registry reachability..."
if curl -sf --max-time 5 "http://${REGISTRY}/v2/" -o /dev/null; then
  echo "  ✓ Registry is reachable at http://${REGISTRY}"
else
  echo "  ✗ Registry not reachable — check network/DNS and that Harbor is running"
fi

echo ""
echo "Run on ALL nodes before deploying. Then test a pull with:"
echo "  crictl pull ${REGISTRY}/vm-portal/backend:latest"
