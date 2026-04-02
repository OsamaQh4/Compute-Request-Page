from sqlalchemy import (
    Column, Integer, String, Boolean, Float, DateTime, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class VCenter(Base):
    __tablename__ = "vcenters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    url = Column(String(512), nullable=False)
    username = Column(String(256), nullable=False)
    password = Column(Text, nullable=False)
    ignore_ssl = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    vms = relationship("VirtualMachine", back_populates="vcenter", cascade="all, delete-orphan")


class VirtualMachine(Base):
    __tablename__ = "virtual_machines"

    id = Column(Integer, primary_key=True, index=True)
    vm_id = Column(String(256), nullable=False)        # vCenter moref / vm id
    name = Column(String(256), nullable=False)
    vcenter_id = Column(Integer, ForeignKey("vcenters.id"), nullable=False)
    vcenter_name = Column(String(128))
    cpu_count = Column(Integer, default=0)
    memory_mb = Column(Integer, default=0)
    storage_gb = Column(Float, default=0.0)
    power_state = Column(String(32), default="UNKNOWN")
    guest_os = Column(String(256))
    ip_addresses = Column(Text, default="[]")          # JSON list
    datacenter = Column(String(256))
    cluster = Column(String(256))
    datastore = Column(String(256))
    network = Column(String(256))
    snapshots = Column(Text, default="[]")             # JSON list
    last_updated = Column(DateTime, default=utcnow, onupdate=utcnow)

    vcenter = relationship("VCenter", back_populates="vms")


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    request_type = Column(String(32), nullable=False)    # "provision" | "edit"
    status = Column(String(32), default="pending")       # pending | approved | denied | completed | failed | auto_approved

    # Requester info (from LDAP)
    requester_email = Column(String(256), nullable=False)
    requester_name = Column(String(256), nullable=False)
    requester_department = Column(String(256))

    # ── Provision-only fields ────────────────────────────────────────────────
    vm_name = Column(String(256))
    cpu_count = Column(Integer)
    memory_mb = Column(Integer)
    storage_gb = Column(Float)
    os_template = Column(String(256))
    datacenter = Column(String(256))
    cluster = Column(String(256))
    datastore = Column(String(256))
    network = Column(String(256))
    description = Column(Text)
    additional_notes = Column(Text)

    # ── Edit-only fields ─────────────────────────────────────────────────────
    target_vm_id = Column(Integer, ForeignKey("virtual_machines.id"), nullable=True)
    target_vm_name = Column(String(256))
    requested_cpu = Column(Integer)
    requested_memory_mb = Column(Integer)
    requested_storage_gb = Column(Float)
    snapshot_action = Column(String(16))    # "add" | "delete" | None
    snapshot_name = Column(String(256))
    snapshot_id = Column(String(256))

    # ── Approval metadata ────────────────────────────────────────────────────
    justification = Column(Text)
    admin_notes = Column(Text)
    denial_reason = Column(Text)
    approved_by = Column(String(256))
    auto_approved = Column(Boolean, default=False)

    # ── Agent response ───────────────────────────────────────────────────────
    agent_response = Column(Text)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class LDAPConfig(Base):
    __tablename__ = "ldap_config"

    id = Column(Integer, primary_key=True, index=True)
    server = Column(String(512), nullable=False)
    port = Column(Integer, default=389)
    use_ssl = Column(Boolean, default=False)
    ignore_ssl = Column(Boolean, default=False)
    base_dn = Column(String(512), nullable=False)
    user_search_base = Column(String(512))
    group_search_base = Column(String(512))
    admin_group_dn = Column(String(512))
    requester_group_dn = Column(String(512))
    bind_dn = Column(String(512))           # service account for group lookup
    bind_password = Column(Text)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SMTPConfig(Base):
    __tablename__ = "smtp_config"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String(512), nullable=False)
    port = Column(Integer, default=587)
    use_tls = Column(Boolean, default=True)
    ignore_ssl = Column(Boolean, default=False)
    username = Column(String(256))
    password = Column(Text)
    from_address = Column(String(256), nullable=False)
    from_name = Column(String(256), default="VM Request Portal")
    admin_email = Column(String(512))       # comma-separated for multiple
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AIAgentConfig(Base):
    __tablename__ = "ai_agent_config"

    id = Column(Integer, primary_key=True, index=True)
    base_url = Column(String(512), nullable=False)
    api_key = Column(Text)
    model = Column(String(256), default="gpt-4")
    ignore_ssl = Column(Boolean, default=False)
    system_prompt = Column(Text, default="You are a VMware automation agent. Execute the requested VM operations and respond with the result status.")
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
