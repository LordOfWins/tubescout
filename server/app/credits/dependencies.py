"""
app/credits/dependencies.py
───────────────────────────
크레딧 차감 의존성.
"""

from __future__ import annotations

from typing import Callable

from app.auth.dependencies import get_license_key, verify_license
from app.credits.service import CreditsService
from fastapi import Depends, Request


def require_credits(amount: int) -> Callable:
    async def _dependency(
        request: Request,
        license_key: str = Depends(get_license_key),
        credit_info: dict = Depends(verify_license),
    ) -> dict:
        credits_cache = request.app.state.credits_cache

        new_remaining = await CreditsService.consume_credits(
            license_key=license_key,
            credits_cache=credits_cache,
            amount=amount,
        )

        return {
            "credit_info": credit_info,
            "credits_remaining": new_remaining,
            "license_key": license_key,
        }

    return _dependency
