# POST /api/auth/verify
"""
app/auth/router.py
──────────────────
POST /api/auth/verify
"""

from __future__ import annotations

from app.auth.schemas import VerifyLicenseRequest, VerifyLicenseResponse
from app.auth.service import AuthService
from app.config import Settings, get_settings
from fastapi import APIRouter, Depends, Request

router = APIRouter()


@router.post("/verify", response_model=VerifyLicenseResponse)
async def verify_license(
    body: VerifyLicenseRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> VerifyLicenseResponse:
    """
    라이선스 키를 검증하고 요금제/크레딧 정보를 반환한다.
    클라이언트는 이 응답으로 UI 상태를 초기화한다.
    """
    http_client = request.app.state.http_client
    credits_cache = request.app.state.credits_cache

    auth_service = AuthService(http_client=http_client, settings=settings)
    return await auth_service.verify_license(
        license_key=body.license_key,
        credits_cache=credits_cache,
    )
