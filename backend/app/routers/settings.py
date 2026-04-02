from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import VCenter, LDAPConfig, SMTPConfig, AIAgentConfig
from ..schemas import (
    VCenterCreate, VCenterUpdate, VCenterOut,
    LDAPConfigCreate, LDAPConfigOut,
    SMTPConfigCreate, SMTPConfigOut,
    AIAgentConfigCreate, AIAgentConfigOut,
    TestConnectionRequest,
)
from ..dependencies import require_admin
from ..services.vcenter_service import VCenterService
from ..services.ldap_service import LDAPService
from ..services.smtp_service import SMTPService
from ..services.ai_agent_service import AIAgentService

router = APIRouter(prefix="/settings", tags=["settings"])


# ── vCenter ────────────────────────────────────────────────────────────────────
@router.get("/vcenters", response_model=List[VCenterOut])
def list_vcenters(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(VCenter).all()


@router.post("/vcenters", response_model=VCenterOut, status_code=201)
def add_vcenter(body: VCenterCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    vc = VCenter(**body.model_dump())
    db.add(vc)
    db.commit()
    db.refresh(vc)
    return vc


@router.put("/vcenters/{vc_id}", response_model=VCenterOut)
def update_vcenter(vc_id: int, body: VCenterUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    vc = db.query(VCenter).filter(VCenter.id == vc_id).first()
    if not vc:
        raise HTTPException(status_code=404, detail="vCenter not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(vc, k, v)
    db.commit()
    db.refresh(vc)
    return vc


@router.delete("/vcenters/{vc_id}", status_code=204)
def delete_vcenter(vc_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    vc = db.query(VCenter).filter(VCenter.id == vc_id).first()
    if not vc:
        raise HTTPException(status_code=404, detail="vCenter not found")
    db.delete(vc)
    db.commit()


@router.post("/vcenters/{vc_id}/test")
def test_vcenter(vc_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    vc = db.query(VCenter).filter(VCenter.id == vc_id).first()
    if not vc:
        raise HTTPException(status_code=404, detail="vCenter not found")
    return VCenterService(vc).test_connection()


# ── LDAP ───────────────────────────────────────────────────────────────────────
@router.get("/ldap", response_model=LDAPConfigOut)
def get_ldap(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(LDAPConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="LDAP not configured")
    return cfg


@router.put("/ldap", response_model=LDAPConfigOut)
def upsert_ldap(body: LDAPConfigCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(LDAPConfig).first()
    if cfg:
        for k, v in body.model_dump().items():
            setattr(cfg, k, v)
    else:
        cfg = LDAPConfig(**body.model_dump())
        db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/ldap/test")
def test_ldap(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(LDAPConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="LDAP not configured")
    return LDAPService(cfg).test_connection()


# ── SMTP ───────────────────────────────────────────────────────────────────────
@router.get("/smtp", response_model=SMTPConfigOut)
def get_smtp(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(SMTPConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="SMTP not configured")
    return cfg


@router.put("/smtp", response_model=SMTPConfigOut)
def upsert_smtp(body: SMTPConfigCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(SMTPConfig).first()
    if cfg:
        for k, v in body.model_dump().items():
            setattr(cfg, k, v)
    else:
        cfg = SMTPConfig(**body.model_dump())
        db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/smtp/test")
async def test_smtp(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(SMTPConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="SMTP not configured")
    return await SMTPService(cfg).test_connection()


# ── AI Agent ──────────────────────────────────────────────────────────────────
@router.get("/ai-agent", response_model=AIAgentConfigOut)
def get_ai_agent(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(AIAgentConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="AI Agent not configured")
    return cfg


@router.put("/ai-agent", response_model=AIAgentConfigOut)
def upsert_ai_agent(body: AIAgentConfigCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(AIAgentConfig).first()
    if cfg:
        for k, v in body.model_dump().items():
            setattr(cfg, k, v)
    else:
        cfg = AIAgentConfig(**body.model_dump())
        db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/ai-agent/test")
def test_ai_agent(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = db.query(AIAgentConfig).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="AI Agent not configured")
    return AIAgentService(cfg).test_connection()
