# InvalidLicense, LicenseExpired
"""
app/auth/exceptions.py
──────────────────────
인증 모듈 전용 예외. 전역 TubeScoutError를 상속한다.
"""

from app.exceptions import InvalidLicenseError, LicenseExpiredError

# 전역 예외를 re-export — auth 모듈 내부에서 import 편의성 제공
__all__ = ["InvalidLicenseError", "LicenseExpiredError"]
