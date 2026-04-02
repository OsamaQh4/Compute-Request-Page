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

# 1. DNS resolution
echo -n "  DNS resolution........... "
if getent hosts "${REGISTRY%%:*}" &>/dev/null; then
  echo "✓  $(getent hosts "${REGISTRY%%:*}" | awk '{print $1}')"
else
  echo "✗  Cannot resolve ${REGISTRY%%:*} — check /etc/hosts or DNS"
fi

# 2. TCP port reachable
echo -n "  TCP port reachable....... "
if timeout 5 bash -c "echo >/dev/tcp/${REGISTRY%%:*}/${REGISTRY##*:}" 2>/dev/null; then
  echo "✓  port ${REGISTRY##*:} open"
else
  echo "✗  Cannot reach port ${REGISTRY##*:} — check firewall / Harbor nginx"
fi

# 3. HTTP response — 401 is expected (Harbor requires auth) and means Harbor IS running
echo -n "  Harbor HTTP response..... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://${REGISTRY}/v2/" 2>/dev/null)
case "$HTTP_CODE" in
  200|401)
    echo "✓  HTTP ${HTTP_CODE} — Harbor is up (401 = auth required, that is normal)"
    ;;
  000)
    echo "✗  No response (connection refused or timeout)"
    ;;
  *)
    echo "✗  Unexpected HTTP ${HTTP_CODE}"
    ;;
esac

echo ""
echo "=== containerd config check ==="
echo -n "  hosts.toml present....... "
[ -f "/etc/containerd/certs.d/${REGISTRY}/hosts.toml" ] && echo "✓" || echo "✗  missing"

echo -n "  config_path in config.... "
grep -q 'config_path' "${CONTAINERD_CONFIG}" && echo "✓" || echo "✗  missing — re-run this script"

echo ""
echo "If all checks pass, test an actual image pull with:"
echo "  crictl pull ${REGISTRY}/vm-portal/backend:latest"
