from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import json
from datetime import datetime, timezone

from ..database import get_db
from ..models import VirtualMachine, VCenter
from ..schemas import VMOut
from ..dependencies import get_current_user, require_admin
from ..services.vcenter_service import VCenterService

router = APIRouter(prefix="/vms", tags=["vms"])


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _sync_vcenter(vcenter, db: Session):
    """Pull VMs from a vCenter and upsert into the database."""
    svc = VCenterService(vcenter)
    vms = svc.list_vms()

    existing = {vm.vm_id: vm for vm in db.query(VirtualMachine).filter(
        VirtualMachine.vcenter_id == vcenter.id
    ).all()}

    for vm_data in vms:
        vm_id = vm_data["vm_id"]
        obj = existing.get(vm_id)
        if not obj:
            obj = VirtualMachine(vm_id=vm_id, vcenter_id=vcenter.id)
            db.add(obj)

        obj.name = vm_data.get("name", "")
        obj.vcenter_name = vcenter.name
        obj.cpu_count = vm_data.get("cpu_count", 0)
        obj.memory_mb = vm_data.get("memory_mb", 0)
        obj.storage_gb = vm_data.get("storage_gb", 0.0)
        obj.power_state = vm_data.get("power_state", "UNKNOWN")
        obj.guest_os = vm_data.get("guest_os", "")
        obj.ip_addresses = json.dumps(vm_data.get("ip_addresses", []))
        obj.datacenter = vm_data.get("datacenter", "")
        obj.cluster = vm_data.get("cluster", "")
        obj.datastore = vm_data.get("datastore", "")
        obj.network = vm_data.get("network", "")
        obj.snapshots = json.dumps(vm_data.get("snapshots", []))
        obj.last_updated = utcnow()

    vcenter.last_sync = utcnow()
    db.commit()


@router.get("/", response_model=List[VMOut])
def list_vms(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    vms = db.query(VirtualMachine).order_by(VirtualMachine.name).all()
    return vms


@router.post("/sync")
def sync_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    vcenters = db.query(VCenter).filter(VCenter.is_active == True).all()
    if not vcenters:
        raise HTTPException(status_code=404, detail="No active vCenters configured")

    errors = []
    for vc in vcenters:
        try:
            _sync_vcenter(vc, db)
        except Exception as e:
            errors.append({"vcenter": vc.name, "error": str(e)})

    return {
        "synced": len(vcenters) - len(errors),
        "errors": errors,
        "message": "Sync completed",
    }


@router.post("/sync/{vcenter_id}")
def sync_one(
    vcenter_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    vc = db.query(VCenter).filter(VCenter.id == vcenter_id).first()
    if not vc:
        raise HTTPException(status_code=404, detail="vCenter not found")
    try:
        _sync_vcenter(vc, db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sync failed: {e}")
    return {"message": f"Sync completed for {vc.name}"}


@router.get("/{vm_id}", response_model=VMOut)
def get_vm(
    vm_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    vm = db.query(VirtualMachine).filter(VirtualMachine.id == vm_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    return vm
