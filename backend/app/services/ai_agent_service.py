import httpx
import json
import ssl
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AIAgentService:
    """
    OpenAI-compatible agent client.
    Sends natural-language prompts and returns the agent's text response.
    """

    def __init__(self, config):
        self.config = config
        self.base_url = config.base_url.rstrip("/")

    def _client(self) -> httpx.Client:
        headers = {
            "Content-Type": "application/json",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        verify = not self.config.ignore_ssl
        return httpx.Client(verify=verify, headers=headers, timeout=120.0)

    def _build_provision_prompt(self, request) -> str:
        return (
            f"Please provision a new virtual machine with the following specifications:\n"
            f"- VM Name: {request.vm_name}\n"
            f"- CPU: {request.cpu_count} vCPU(s)\n"
            f"- Memory: {request.memory_mb} MB\n"
            f"- Storage: {request.storage_gb} GB\n"
            f"- OS Template: {request.os_template}\n"
            f"- Datacenter: {request.datacenter}\n"
            f"- Cluster: {request.cluster}\n"
            f"- Datastore: {request.datastore}\n"
            f"- Network: {request.network}\n"
            f"- Description: {request.description or 'N/A'}\n"
            f"- Requester: {request.requester_name} ({request.requester_email})\n\n"
            f"Execute the provisioning and report the result status."
        )

    def _build_edit_prompt(self, request, current_vm) -> str:
        lines = [
            f"Please modify the virtual machine '{request.target_vm_name}' (ID: {current_vm.vm_id if current_vm else 'unknown'}) with the following changes:"
        ]
        if request.requested_cpu:
            lines.append(f"- CPU: change to {request.requested_cpu} vCPU(s)")
        if request.requested_memory_mb:
            lines.append(f"- Memory: change to {request.requested_memory_mb} MB")
        if request.requested_storage_gb:
            lines.append(f"- Storage: change to {request.requested_storage_gb} GB")
        if request.snapshot_action == "add":
            lines.append(f"- Snapshot: create a new snapshot named '{request.snapshot_name}'")
        elif request.snapshot_action == "delete":
            lines.append(f"- Snapshot: delete snapshot with ID '{request.snapshot_id}' / name '{request.snapshot_name}'")
        lines.append(f"\nRequested by: {request.requester_name} ({request.requester_email})")
        lines.append("Execute the changes and report the result status.")
        return "\n".join(lines)

    def execute_provision(self, request) -> str:
        prompt = self._build_provision_prompt(request)
        return self._call_agent(prompt)

    def execute_edit(self, request, current_vm=None) -> str:
        prompt = self._build_edit_prompt(request, current_vm)
        return self._call_agent(prompt)

    def _call_agent(self, user_message: str) -> str:
        system_prompt = self.config.system_prompt or (
            "You are a VMware automation agent. Execute the requested VM operations and respond with the result status."
        )
        payload = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }

        with self._client() as client:
            resp = client.post(f"{self.base_url}/v1/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    def test_connection(self) -> dict:
        try:
            with self._client() as client:
                resp = client.get(f"{self.base_url}/v1/models")
                if resp.status_code in (200, 404):   # 404 is OK – endpoint may not exist
                    return {"success": True, "message": "AI Agent reachable"}
                resp.raise_for_status()
                return {"success": True, "message": "AI Agent reachable"}
        except Exception as e:
            return {"success": False, "message": str(e)}
