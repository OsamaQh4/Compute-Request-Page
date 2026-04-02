from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str   # user@domain.com
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    email: str
    name: str
    department: Optional[str] = None
    role: str   # "admin" | "requester"


# ── vCenter ───────────────────────────────────────────────────────────────────
class VCenterCreate(BaseModel):
    name: str
    url: str
    username: str
    password: str
    ignore_ssl: bool = False
    is_active: bool = True


class VCenterUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ignore_ssl: Optional[bool] = None
    is_active: Optional[bool] = None


class VCenterOut(BaseModel):
    id: int
    name: str
    url: str
    username: str
    ignore_ssl: bool
    is_active: bool
    last_sync: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Virtual Machine ───────────────────────────────────────────────────────────
class VMOut(BaseModel):
    id: int
    vm_id: str
    name: str
    vcenter_id: int
    vcenter_name: Optional[str] = None
    cpu_count: int
    memory_mb: int
    storage_gb: float
    power_state: str
    guest_os: Optional[str] = None
    ip_addresses: str       # raw JSON string; parsed on frontend
    datacenter: Optional[str] = None
    cluster: Optional[str] = None
    datastore: Optional[str] = None
    network: Optional[str] = None
    snapshots: str          # raw JSON string
    last_updated: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Requests ──────────────────────────────────────────────────────────────────
class ProvisionRequestCreate(BaseModel):
    vm_name: str
    cpu_count: int
    memory_mb: int
    storage_gb: float
    os_template: str
    datacenter: str
    cluster: str
    datastore: str
    network: str
    description: Optional[str] = None
    additional_notes: Optional[str] = None
    justification: Optional[str] = None


class EditRequestCreate(BaseModel):
    target_vm_id: int
    requested_cpu: Optional[int] = None
    requested_memory_mb: Optional[int] = None
    requested_storage_gb: Optional[float] = None
    snapshot_action: Optional[str] = None  # "add" | "delete"
    snapshot_name: Optional[str] = None
    snapshot_id: Optional[str] = None
    justification: Optional[str] = None


class RequestOut(BaseModel):
    id: int
    request_type: str
    status: str
    requester_email: str
    requester_name: str
    requester_department: Optional[str] = None
    # provision
    vm_name: Optional[str] = None
    cpu_count: Optional[int] = None
    memory_mb: Optional[int] = None
    storage_gb: Optional[float] = None
    os_template: Optional[str] = None
    datacenter: Optional[str] = None
    cluster: Optional[str] = None
    datastore: Optional[str] = None
    network: Optional[str] = None
    description: Optional[str] = None
    additional_notes: Optional[str] = None
    # edit
    target_vm_id: Optional[int] = None
    target_vm_name: Optional[str] = None
    requested_cpu: Optional[int] = None
    requested_memory_mb: Optional[int] = None
    requested_storage_gb: Optional[float] = None
    snapshot_action: Optional[str] = None
    snapshot_name: Optional[str] = None
    snapshot_id: Optional[str] = None
    # meta
    justification: Optional[str] = None
    admin_notes: Optional[str] = None
    denial_reason: Optional[str] = None
    approved_by: Optional[str] = None
    auto_approved: bool = False
    agent_response: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApproveRequest(BaseModel):
    admin_notes: Optional[str] = None


class DenyRequest(BaseModel):
    denial_reason: str


# ── Settings ──────────────────────────────────────────────────────────────────
class LDAPConfigCreate(BaseModel):
    server: str
    port: int = 389
    use_ssl: bool = False
    ignore_ssl: bool = False
    base_dn: str
    user_search_base: Optional[str] = None
    group_search_base: Optional[str] = None
    admin_group_dn: Optional[str] = None
    requester_group_dn: Optional[str] = None
    bind_dn: Optional[str] = None
    bind_password: Optional[str] = None
    is_active: bool = True


class LDAPConfigOut(BaseModel):
    id: int
    server: str
    port: int
    use_ssl: bool
    ignore_ssl: bool
    base_dn: str
    user_search_base: Optional[str] = None
    group_search_base: Optional[str] = None
    admin_group_dn: Optional[str] = None
    requester_group_dn: Optional[str] = None
    bind_dn: Optional[str] = None
    is_active: bool
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SMTPConfigCreate(BaseModel):
    host: str
    port: int = 587
    use_tls: bool = True
    ignore_ssl: bool = False
    username: Optional[str] = None
    password: Optional[str] = None
    from_address: str
    from_name: str = "VM Request Portal"
    admin_email: Optional[str] = None
    is_active: bool = True


class SMTPConfigOut(BaseModel):
    id: int
    host: str
    port: int
    use_tls: bool
    ignore_ssl: bool
    username: Optional[str] = None
    from_address: str
    from_name: str
    admin_email: Optional[str] = None
    is_active: bool
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AIAgentConfigCreate(BaseModel):
    base_url: str
    api_key: Optional[str] = None
    model: str = "gpt-4"
    ignore_ssl: bool = False
    system_prompt: Optional[str] = None
    is_active: bool = True


class AIAgentConfigOut(BaseModel):
    id: int
    base_url: str
    model: str
    ignore_ssl: bool
    system_prompt: Optional[str] = None
    is_active: bool
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TestConnectionRequest(BaseModel):
    type: str   # "ldap" | "smtp" | "vcenter" | "ai_agent"
    config_id: Optional[int] = None
