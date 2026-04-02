from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from ..database import get_db
from ..models import Request, VirtualMachine, SMTPConfig, AIAgentConfig
from ..schemas import (
    ProvisionRequestCreate, EditRequestCreate, RequestOut, ApproveRequest, DenyRequest
)
from ..dependencies import get_current_user, require_admin
from ..services.smtp_service import SMTPService
from ..services.ai_agent_service import AIAgentService

router = APIRouter(prefix="/requests", tags=["requests"])


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


AUTO_APPROVE_THRESHOLD = 0.10  # 10%


def _is_auto_approvable(request: Request, vm: VirtualMachine) -> bool:
    """Return True if all requested changes are ≤ 10% increase."""
    if request.request_type != "edit":
        return False

    # Snapshot-only changes are always auto-approved
    resource_change = any([
        request.requested_cpu,
        request.requested_memory_mb,
        request.requested_storage_gb,
    ])
    if not resource_change:
        return True

    checks = []
    if request.requested_cpu and vm.cpu_count:
        checks.append(request.requested_cpu <= vm.cpu_count * (1 + AUTO_APPROVE_THRESHOLD))
    if request.requested_memory_mb and vm.memory_mb:
        checks.append(request.requested_memory_mb <= vm.memory_mb * (1 + AUTO_APPROVE_THRESHOLD))
    if request.requested_storage_gb and vm.storage_gb:
        checks.append(request.requested_storage_gb <= vm.storage_gb * (1 + AUTO_APPROVE_THRESHOLD))

    return all(checks) if checks else True


def _get_smtp(db: Session) -> Optional[SMTPService]:
    cfg = db.query(SMTPConfig).filter(SMTPConfig.is_active == True).first()
    return SMTPService(cfg) if cfg else None


def _get_agent(db: Session) -> Optional[AIAgentService]:
    cfg = db.query(AIAgentConfig).filter(AIAgentConfig.is_active == True).first()
    return AIAgentService(cfg) if cfg else None


async def _process_approved_request(request_id: int, db: Session):
    """Run agent + send completion emails after approval."""
    request = db.query(Request).filter(Request.id == request_id).first()
    if not request:
        return

    agent = _get_agent(db)
    smtp = _get_smtp(db)

    try:
        if agent:
            vm = None
            if request.target_vm_id:
                vm = db.query(VirtualMachine).filter(VirtualMachine.id == request.target_vm_id).first()

            if request.request_type == "provision":
                response = agent.execute_provision(request)
            else:
                response = agent.execute_edit(request, vm)

            request.agent_response = response
            request.status = "completed"
        else:
            request.agent_response = "No AI agent configured – action logged only."
            request.status = "completed"
    except Exception as e:
        request.agent_response = f"Agent error: {e}"
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
