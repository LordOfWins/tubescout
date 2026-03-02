"""
app/auth/dependencies.py
────────────────────────
재사용 가능한 인증 의존성.
"""

from __future__ import annotations

from app.auth.service import AuthService
from app.config import Settings, get_settings
from app.exceptions import InvalidLicenseError
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_license_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """Authorization 헤더에서 license_key를 추출한다."""
    if credentials is None or not credentials.credentials:
        raise InvalidLicenseError(detail="Authorization 헤더가 필요합니다.")
    return credentials.credentials


async def verify_license(
    request: Request,
    license_key: str = Depends(get_license_key),
    settings: Settings = Depends(get_settings),
) -> dict:
    http_client = request.app.state.http_client
    credits_cache = request.app.state.credits_cache

    auth_service = AuthService(http_client=http_client, settings=settings)
    return await auth_service.validate_license_only(
        license_key=license_key,
        credits_cache=credits_cache,
    )
