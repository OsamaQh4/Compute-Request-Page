from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt
from datetime import datetime, timedelta, timezone
from ..database import get_db
from ..models import LDAPConfig
from ..schemas import LoginRequest, TokenResponse, UserInfo
from ..services.ldap_service import LDAPService
from ..config import settings
from ..dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "department": user.get("department"),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    ldap_cfg = db.query(LDAPConfig).filter(LDAPConfig.is_active == True).first()

    if not ldap_cfg:
        # ── Dev / demo mode: accept any credentials ──────────────────────────
        # Remove this block when LDAP is configured
        role = "admin" if body.username.startswith("admin") else "requester"
        user = {
            "email": body.username,
            "name": body.username.split("@")[0].replace(".", " ").title(),
            "role": role,
            "department": "IT",
        }
        token = _create_token(user)
        return TokenResponse(access_token=token, user=UserInfo(**user))

    svc = LDAPService(ldap_cfg)
    user = svc.authenticate(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = _create_token(user)
    return TokenResponse(access_token=token, user=UserInfo(**user))


@router.get("/me", response_model=UserInfo)
def me(current_user: dict = Depends(get_current_user)):
    return UserInfo(**current_user)
