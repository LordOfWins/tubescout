# CreditCheckResponse
"""
app/credits/schemas.py
──────────────────────
크레딧 관련 Pydantic v2 스키마.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CreditsCheckResponse(BaseModel):
    """GET /api/credits/check 응답 — 클라이언트가 기대하는 형태 그대로."""
    credits_remaining: int
    credits_total: int
    credits_reset_at: datetime
    plan: Literal["free", "pro", "ultra"]
