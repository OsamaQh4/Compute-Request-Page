import httpx
import json
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class VCenterService:
    """
    Wraps the vSphere REST API (vCenter 6.7+).
    Authenticates with username/password to get a session token,
    then uses it for all subsequent calls.
    """

    def __init__(self, vcenter):
        self.vcenter = vcenter
        self.base_url = vcenter.url.rstrip("/")
        self.verify_ssl = not vcenter.ignore_ssl

    def _client(self, session_token: Optional[str] = None) -> httpx.Client:
        headers = {"Content-Type": "application/json"}
        if session_token:
            headers["vmware-api-session-id"] = session_token
        return httpx.Client(
            verify=self.verify_ssl,
            headers=headers,
            timeout=30.0,
        )

    def _get_session(self, client: httpx.Client) -> str:
        resp = client.post(
            f"{self.base_url}/rest/com/vmware/cis/session",
            auth=(self.vcenter.username, self.vcenter.password),
        )
        resp.raise_for_status()
        return resp.json()["value"]

    def list_vms(self) -> List[Dict[str, Any]]:
        with self._client() as client:
            token = self._get_session(client)
            client.headers["vmware-api-session-id"] = token
            try:
                resp = client.get(f"{self.base_url}/rest/vcenter/vm")
                resp.raise_for_status()
                vms = resp.json().get("value", [])
                enriched = []
                for vm in vms:
                    try:
                        detail = self._get_vm_detail(client, vm["vm"])
                        detail["vm_id"] = vm["vm"]
                        detail["name"] = vm.get("name", "")
                        detail["power_state"] = vm.get("power_state", "UNKNOWN")
                        enriched.append(detail)
                    except Exception as e:
                        logger.warning("Failed to enrich VM %s: %s", vm.get("vm"), e)
                        enriched.append({
                            "vm_id": vm["vm"],
                            "name": vm.get("name", ""),
                            "power_state": vm.get("power_state", "UNKNOWN"),
                            "cpu_count": 0,
                            "memory_mb": 0,
                            "storage_gb": 0.0,
                            "guest_os": "",
                            "ip_addresses": [],
                            "datacenter": "",
                            "cluster": "",
                            "datastore": "",
                            "network": "",
                            "snapshots": [],
                        })
                return enriched
            finally:
                try:
                    client.delete(f"{self.base_url}/rest/com/vmware/cis/session")
                except Exception:
                    pass

    def _get_vm_detail(self, client: httpx.Client, vm_id: str) -> Dict[str, Any]:
        resp = client.get(f"{self.base_url}/rest/vcenter/vm/{vm_id}")
        resp.raise_for_status()
        v = resp.json().get("value", {})

        cpu = v.get("cpu", {})
        memory = v.get("memory", {})
        guest = v.get("guest_OS", "")

        # Aggregate storage
        storage_gb = 0.0
        for disk in v.get("disks", {}).values():
            cap = disk.get("capacity", 0)
            storage_gb += cap / (1024 ** 3)

        # IPs
        ips = []
        for nic in v.get("nics", {}).values():
            for ip in nic.get("ip", {}).get("ip_addresses", []):
                if ip.get("ip_address"):
                    ips.append(ip["ip_address"])

        # Network names
        networks = [n.get("network", "") for n in v.get("nics", {}).values()]

        # Snapshots
        snapshots = self._get_snapshots(client, vm_id)

        return {
            "cpu_count": cpu.get("count", 0),
            "memory_mb": memory.get("size_MiB", 0),
            "storage_gb": round(storage_gb, 2),
            "guest_os": guest,
            "ip_addresses": ips,
            "datacenter": "",   # requires additional REST call; populated from placement
            "cluster": "",
            "datastore": "",
            "network": ", ".join(set(networks)),
            "snapshots": snapshots,
        }

    def _get_snapshots(self, client: httpx.Client, vm_id: str) -> List[Dict]:
        try:
            resp = client.get(f"{self.base_url}/rest/vcenter/vm/{vm_id}/snapshot")
            if resp.status_code == 200:
                snaps = resp.json().get("value", [])
                return [{"id": s.get("snapshot", ""), "name": s.get("name", ""), "created": s.get("creation_time", "")} for s in snaps]
        except Exception:
            pass
        return []

    # ── Write operations ──────────────────────────────────────────────────────

    def _resolve_cluster(self, client: httpx.Client, name: str) -> str:
        resp = client.get(f"{self.base_url}/rest/vcenter/cluster")
        resp.raise_for_status()
        for c in resp.json().get("value", []):
            if c.get("name", "").lower() == name.lower():
                return c["cluster"]
        raise ValueError(f"Cluster '{name}' not found in vCenter")

    def _resolve_datastore(self, client: httpx.Client, name: str) -> str:
        resp = client.get(f"{self.base_url}/rest/vcenter/datastore")
        resp.raise_for_status()
        for d in resp.json().get("value", []):
            if d.get("name", "").lower() == name.lower():
                return d["datastore"]
        raise ValueError(f"Datastore '{name}' not found in vCenter")

    def _resolve_folder(self, client: httpx.Client) -> str:
        resp = client.get(
            f"{self.base_url}/rest/vcenter/folder",
            params={"filter.type": "VIRTUAL_MACHINE"},
        )
        resp.raise_for_status()
        folders = resp.json().get("value", [])
        if not folders:
            raise ValueError("No VM folder found in vCenter")
        return folders[0]["folder"]

    def provision_vm(self, request) -> str:
        with self._client() as client:
            token = self._get_session(client)
            client.headers["vmware-api-session-id"] = token
            try:
                cluster_id = self._resolve_cluster(client, request.cluster)
                datastore_id = self._resolve_datastore(client, request.datastore)
                folder_id = self._resolve_folder(client)

                spec = {
                    "spec": {
                        "name": request.vm_name,
                        "guest_OS": "OTHER_64",
                        "placement": {
                            "cluster": cluster_id,
                            "datastore": datastore_id,
                            "folder": folder_id,
                        },
                        "cpu": {
                            "count": request.cpu_count,
                            "cores_per_socket": 1,
                        },
                        "memory": {
                            "size_MiB": request.memory_mb,
                        },
                        "disks": [
                            {
                                "type": "SCSI",
                                "new_vmdk": {
                                    "capacity": int(request.storage_gb * (1024 ** 3)),
                                },
                            }
                        ],
                    }
                }

                resp = client.post(f"{self.base_url}/rest/vcenter/vm", json=spec)
                resp.raise_for_status()
                vm_id = resp.json().get("value", "unknown")
                return f"VM '{request.vm_name}' provisioned successfully (ID: {vm_id})."
            finally:
                try:
                    client.delete(f"{self.base_url}/rest/com/vmware/cis/session")
                except Exception:
                    pass

    def edit_vm(self, vm_id: str, request) -> str:
        results = []
        with self._client() as client:
            token = self._get_session(client)
            client.headers["vmware-api-session-id"] = token
            try:
                if request.requested_cpu:
                    resp = client.patch(
                        f"{self.base_url}/rest/vcenter/vm/{vm_id}/hardware/cpu",
                        json={"spec": {"count": request.requested_cpu}},
                    )
                    resp.raise_for_status()
                    results.append(f"CPU set to {request.requested_cpu} vCPU(s)")

                if request.requested_memory_mb:
                    resp = client.patch(
                        f"{self.base_url}/rest/vcenter/vm/{vm_id}/hardware/memory",
                        json={"spec": {"size_MiB": request.requested_memory_mb}},
                    )
                    resp.raise_for_status()
                    results.append(f"Memory set to {request.requested_memory_mb} MB")

                if request.requested_storage_gb:
                    # Resize the first disk found on the VM
                    disk_resp = client.get(f"{self.base_url}/rest/vcenter/vm/{vm_id}/hardware/disk")
                    disk_resp.raise_for_status()
                    disks = disk_resp.json().get("value", [])
                    if disks:
                        disk_id = disks[0]["disk"]
                        resp = client.patch(
                            f"{self.base_url}/rest/vcenter/vm/{vm_id}/hardware/disk/{disk_id}",
                            json={"spec": {"capacity": int(request.requested_storage_gb * (1024 ** 3))}},
                        )
                        resp.raise_for_status()
                        results.append(f"Storage set to {request.requested_storage_gb} GB")
                    else:
                        results.append("Storage resize skipped: no disks found on VM")

                if request.snapshot_action == "add" and request.snapshot_name:
                    resp = client.post(
                        f"{self.base_url}/rest/vcenter/vm/{vm_id}/snapshot",
                        json={"spec": {"name": request.snapshot_name, "memory": False, "quiesce": False}},
                    )
                    resp.raise_for_status()
                    results.append(f"Snapshot '{request.snapshot_name}' created")

                elif request.snapshot_action == "delete" and request.snapshot_id:
                    resp = client.delete(
                        f"{self.base_url}/rest/vcenter/vm/{vm_id}/snapshot/{request.snapshot_id}"
                    )
                    resp.raise_for_status()
                    results.append(f"Snapshot '{request.snapshot_name}' deleted")

                return "Changes applied: " + "; ".join(results) if results else "No changes were specified."
            finally:
                try:
                    client.delete(f"{self.base_url}/rest/com/vmware/cis/session")
                except Exception:
                    pass

    def test_connection(self) -> Dict:
        try:
            with self._client() as client:
                token = self._get_session(client)
                client.delete(f"{self.base_url}/rest/com/vmware/cis/session",
                              headers={"vmware-api-session-id": token})
            return {"success": True, "message": f"Connected to {self.vcenter.url}"}
        except Exception as e:
            return {"success": False, "message": str(e)}
