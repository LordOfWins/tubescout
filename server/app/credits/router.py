# GET /api/credits/check
"""
app/credits/router.py
─────────────────────
GET /api/credits/check
"""

from __future__ import annotations

from app.auth.dependencies import verify_license
from app.credits.schemas import CreditsCheckResponse
from app.credits.service import CreditsService
from fastapi import APIRouter, Depends

router = APIRouter()


@router.get("/check", response_model=CreditsCheckResponse)
async def check_credits(
    credit_info: dict = Depends(verify_license),
) -> CreditsCheckResponse:
    """
    현재 크레딧 잔여/총량/리셋일/요금제를 반환한다.
    Authorization: Bearer <license_key> 헤더 필요.
    """
    result = await CreditsService.check_credits(credit_info)
    return CreditsCheckResponse(**result)
