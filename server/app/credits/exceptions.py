# InsufficientCredits
"""
app/credits/exceptions.py
─────────────────────────
크레딧 모듈 전용 예외. 전역 예외를 re-export.
"""

from app.exceptions import InsufficientCreditsError

__all__ = ["InsufficientCreditsError"]
