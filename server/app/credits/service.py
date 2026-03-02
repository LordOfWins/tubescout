"""
app/credits/service.py
──────────────────────
크레딧 조회/차감/리셋/복구 로직.
"""

from __future__ import annotations

import asyncio
import logging

from app.exceptions import InsufficientCreditsError

logger = logging.getLogger("tubescout.credits")

_locks: dict[str, asyncio.Lock] = {}


def _get_lock(license_key: str) -> asyncio.Lock:
    if license_key not in _locks:
        _locks[license_key] = asyncio.Lock()
    return _locks[license_key]


class CreditsService:

    @staticmethod
    async def check_credits(credit_info: dict) -> dict:
        return {
            "credits_remaining": credit_info["credits_remaining"],
            "credits_total": credit_info["credits_total"],
            "credits_reset_at": credit_info["credits_reset_at"],
            "plan": credit_info["plan"],
        }

    @staticmethod
    async def consume_credits(
        license_key: str,
        credits_cache: dict[str, dict],
        amount: int,
    ) -> int:
        lock = _get_lock(license_key)

        async with lock:
            credit_info = credits_cache.get(license_key)
            if credit_info is None:
                raise InsufficientCreditsError(required=amount, remaining=0)

            remaining = credit_info["credits_remaining"]

            if remaining < amount:
                raise InsufficientCreditsError(
                    required=amount, remaining=remaining
                )

            credit_info["credits_remaining"] = remaining - amount
            new_remaining = credit_info["credits_remaining"]

            logger.info(
                "크레딧 차감: key=...%s, -%d, 잔여=%d",
                license_key[-8:], amount, new_remaining,
            )

            return new_remaining

    @staticmethod
    async def refund_credits(
        license_key: str,
        credits_cache: dict[str, dict],
        amount: int,
    ) -> int:
        lock = _get_lock(license_key)

        async with lock:
            credit_info = credits_cache.get(license_key)
            if credit_info is None:
                logger.warning(
                    "크레딧 복구 실패 — 캐시 없음: key=...%s", license_key[-8:]
                )
                return 0

            credit_info["credits_remaining"] += amount

            total = credit_info["credits_total"]
            if credit_info["credits_remaining"] > total:
                credit_info["credits_remaining"] = total

            new_remaining = credit_info["credits_remaining"]

            logger.info(
                "크레딧 복구: key=...%s, +%d, 잔여=%d",
                license_key[-8:], amount, new_remaining,
            )

            return new_remaining
