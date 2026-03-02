# LicenseVerifyRequest, LicenseVerifyResponse
"""
app/auth/schemas.py
───────────────────
인증 관련 Pydantic v2 스키마.
클라이언트가 기대하는 응답 포맷을 정확히 준수한다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────
# Request
# ─────────────────────────────────────────────────────────────
class VerifyLicenseRequest(BaseModel):
    license_key: str = Field(
        ...,
        min_length=10,
        description="Lemon Squeezy에서 발급한 라이선스 키",
        examples=["38b1460a-5104-4067-a91d-77b872934d51"],
    )


# ─────────────────────────────────────────────────────────────
# Response (클라이언트가 기대하는 형태 그대로)
# ─────────────────────────────────────────────────────────────
class VerifyLicenseResponse(BaseModel):
    valid: bool
    plan: Literal["free", "pro", "ultra"]
    credits_remaining: int
    credits_total: int
    credits_reset_at: datetime
    customer_email: str
    customer_name: str
    license_status: str  # "active" | "inactive" | "expired" | "disabled"
    instance_id: str


# ─────────────────────────────────────────────────────────────
# Lemon Squeezy API 응답 파싱용 (내부 전용)
# ─────────────────────────────────────────────────────────────
class LSLicenseKey(BaseModel):
    """Lemon Squeezy activate/validate 응답의 license_key 객체."""
    id: int
    status: str
    key: str
    activation_limit: int
    activation_usage: int
    created_at: str
    expires_at: str | None = None


class LSInstance(BaseModel):
    """Lemon Squeezy activate 응답의 instance 객체."""
    id: str
    name: str
    created_at: str


class LSMeta(BaseModel):
    """Lemon Squeezy 응답의 meta 객체."""
    store_id: int
    order_id: int
    order_item_id: int
    product_id: int
    product_name: str
    variant_id: int
    variant_name: str
    customer_id: int
    customer_name: str
    customer_email: str


class LSActivateResponse(BaseModel):
    """POST /v1/licenses/activate 응답 전체."""
    activated: bool
    error: str | None = None
    license_key: LSLicenseKey
    instance: LSInstance | None = None
    meta: LSMeta


class LSValidateResponse(BaseModel):
    """POST /v1/licenses/validate 응답 전체."""
    valid: bool
    error: str | None = None
    license_key: LSLicenseKey
    instance: LSInstance | None = None
    meta: LSMeta
