import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, UTC

logger = logging.getLogger(__name__)

from ..database import get_db
from ..models import Request, VirtualMachine, VCenter, SMTPConfig, AIAgentConfig
from ..schemas import (
    ProvisionRequestCreate, EditRequestCreate, RequestOut, ApproveRequest, DenyRequest
)
from ..dependencies import get_current_user, require_admin
from ..services.smtp_service import SMTPService
from ..services.ai_agent_service import AIAgentService
from ..services.vcenter_service import VCenterService

router = APIRouter(prefix="/requests", tags=["requests"])


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_auto_approvable(request: Request, vm: VirtualMachine) -> bool:
    """Auto-approve only snapshot-only changes. Any resource change requires admin approval."""
    if request.request_type != "edit":
        return False
    resource_change = any([
        request.requested_cpu,
        request.requested_memory_mb,
        request.requested_storage_gb,
        request.add_disk_gb,
    ])
    return not resource_change


def _get_smtp(db: Session) -> Optional[SMTPService]:
    cfg = db.query(SMTPConfig).filter(SMTPConfig.is_active == True).first()
    return SMTPService(cfg) if cfg else None


def _get_agent(db: Session) -> Optional[AIAgentService]:
    cfg = db.query(AIAgentConfig).filter(AIAgentConfig.is_active == True).first()
    return AIAgentService(cfg) if cfg else None


def _format_edit_report(result: dict, request: Request) -> str:
    """Build a human-readable report from a real vCenter apply_edit result."""
    lines = [
        f"VM: {request.target_vm_name}",
        f"Requested by: {request.requester_name} ({request.requester_email})",
        "",
    ]
    if result["applied"]:
        lines.append("Changes applied:")
        for item in result["applied"]:
            lines.append(f"  - {item}")
    if result["errors"]:
        lines.append("Errors:")
        for err in result["errors"]:
            lines.append(f"  - {err}")
    status = "SUCCESS" if result["success"] else "PARTIAL FAILURE" if result["applied"] else "FAILED"
    lines.append(f"\nStatus: {status}")
    return "\n".join(lines)


async def _process_approved_request(request_id: int, db: Session):
    """Execute vCenter changes (edit) or call the AI agent (provision), then send emails."""
    request = db.query(Request).filter(Request.id == request_id).first()
    if not request:
        return

    # Mark as processing immediately so users see live status
    request.status = "processing"
    db.commit()

    smtp = _get_smtp(db)

    try:
        if request.request_type == "edit":
            # ── Real vCenter execution ───────────────────────────────────────
            vm = db.query(VirtualMachine).filter(
                VirtualMachine.id == request.target_vm_id
            ).first()

            if not vm:
                request.agent_response = "Error: target VM not found in database."
                request.status = "failed"
            else:
                vcenter = db.query(VCenter).filter(VCenter.id == vm.vcenter_id).first()
                if not vcenter:
                    request.agent_response = "Error: vCenter not found for this VM."
                    request.status = "failed"
                else:
                    svc = VCenterService(vcenter)

                    # Auto-snapshot before hardware changes (CPU/memory/new disk)
                    has_hw_change = any([
                        request.requested_cpu,
                        request.requested_memory_mb,
                        request.add_disk_gb,
                    ])
                    if has_hw_change:
                        snap_name = f"pre-edit-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
                        try:
                            svc.create_snapshot(vm.vm_id, snap_name)
                            logger.info("Auto-snapshot '%s' created for VM %s", snap_name, vm.vm_id)
                        except Exception as snap_err:
                            logger.warning("Auto-snapshot failed for VM %s: %s", vm.vm_id, snap_err)

                    result = svc.apply_edit(
                        vm_id=vm.vm_id,
                        cpu_count=request.requested_cpu,
                        memory_mb=request.requested_memory_mb,
                        add_disk_gb=request.add_disk_gb,
                        snapshot_action=request.snapshot_action,
                        snapshot_name=request.snapshot_name,
                        snapshot_id=request.snapshot_id,
                    )
                    request.agent_response = _format_edit_report(result, request)
                    request.status = "completed" if result["applied"] else "failed"

                    # Sync the local VM record with whatever was successfully applied
                    if result["success"] or result["applied"]:
                        if request.requested_cpu and any("CPU" in s for s in result["applied"]):
                            vm.cpu_count = request.requested_cpu
                        if request.requested_memory_mb and any("Memory" in s for s in result["applied"]):
                            vm.memory_mb = request.requested_memory_mb

        else:
            # ── Provision: delegate to the AI agent ──────────────────────────
            agent = _get_agent(db)
            if agent:
                response = agent.execute_provision(request)
                request.agent_response = response
                request.status = "completed"
            else:
                request.agent_response = "No AI agent configured – provision logged only."
                request.status = "completed"

    except Exception as e:
        logger.exception("Failed to process request %s", request_id)
        request.agent_response = f"Execution error: {e}"
        request.status = "failed"

    db.commit()

    if smtp:
        if request.request_type == "provision":
            await smtp.notify_provision_completed(request)
        else:
            await smtp.notify_edit_completed(request)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/provision", response_model=RequestOut, status_code=201)
async def create_provision_request(
    body: ProvisionRequestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    req = Request(
        request_type="provision",
        status="pending",
        requester_email=current_user["email"],
        requester_name=current_user["name"],
        requester_department=current_user.get("department"),
        **body.model_dump(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    smtp = _get_smtp(db)
    if smtp:
        background_tasks.add_task(smtp.notify_admins_new_request, req)

    return req


@router.post("/edit", response_model=RequestOut, status_code=201)
async def create_edit_request(
    body: EditRequestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    vm = db.query(VirtualMachine).filter(VirtualMachine.id == body.target_vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")

    req = Request(
        request_type="edit",
        requester_email=current_user["email"],
        requester_name=current_user["name"],
        requester_department=current_user.get("department"),
        target_vm_id=body.target_vm_id,
        target_vm_name=vm.name,
        requested_cpu=body.requested_cpu,
        requested_memory_mb=body.requested_memory_mb,
        requested_storage_gb=body.requested_storage_gb,
        add_disk_gb=body.add_disk_gb,
        snapshot_action=body.snapshot_action,
        snapshot_name=body.snapshot_name,
        snapshot_id=body.snapshot_id,
        justification=body.justification,
    )

    auto = _is_auto_approvable(req, vm)
    req.auto_approved = auto
    req.status = "auto_approved" if auto else "pending"

    db.add(req)
    db.commit()
    db.refresh(req)

    smtp = _get_smtp(db)

    if auto:
        # Process immediately in background
        background_tasks.add_task(_process_approved_request, req.id, db)
        if smtp:
            background_tasks.add_task(smtp.notify_edit_completed, req)
    else:
        if smtp:
            background_tasks.add_task(smtp.notify_admins_new_request, req)

    return req


@router.get("/", response_model=List[RequestOut])
def list_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(Request)
    # Requesters only see their own requests
    if current_user["role"] != "admin":
        query = query.filter(Request.requester_email == current_user["email"])
    if status:
        query = query.filter(Request.status == status)
    return query.order_by(Request.created_at.desc()).all()


@router.get("/{request_id}", response_model=RequestOut)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user["role"] != "admin" and req.requester_email != current_user["email"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return req


@router.post("/{request_id}/approve", response_model=RequestOut)
async def approve_request(
    request_id: int,
    body: ApproveRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Cannot approve a request in '{req.status}' status")

    req.status = "approved"
    req.approved_by = current_user["email"]
    req.admin_notes = body.admin_notes
    req.updated_at = utcnow()
    db.commit()
    db.refresh(req)

    smtp = _get_smtp(db)
    if smtp:
        background_tasks.add_task(smtp.notify_requester_approved, req)

    background_tasks.add_task(_process_approved_request, req.id, db)

    return req


@router.post("/{request_id}/deny", response_model=RequestOut)
async def deny_request(
    request_id: int,
    body: DenyRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Cannot deny a request in '{req.status}' status")

    req.status = "denied"
    req.approved_by = current_user["email"]
    req.denial_reason = body.denial_reason
    req.updated_at = utcnow()
    db.commit()
    db.refresh(req)

    smtp = _get_smtp(db)
    if smtp:
        background_tasks.add_task(smtp.notify_requester_denied, req)

    return req
