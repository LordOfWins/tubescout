# 글로벌 커스텀 예외
"""
app/exceptions.py
─────────────────
TubeScout 전역 예외 클래스 + FastAPI 예외 핸들러.
모든 에러 응답을 { "error": "...", "detail": "..." } 형태로 통일한다.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# ─────────────────────────────────────────────────────────────
# 커스텀 예외 클래스
# ─────────────────────────────────────────────────────────────
class TubeScoutError(Exception):
    """모든 비즈니스 예외의 베이스 클래스."""

    def __init__(
        self,
        status_code: int = 500,
        error: str = "internal_error",
        detail: str = "알 수 없는 오류가 발생했습니다.",
    ):
        self.status_code = status_code
        self.error = error
        self.detail = detail
        super().__init__(detail)


class InvalidLicenseError(TubeScoutError):
    """라이선스 키가 유효하지 않음."""

    def __init__(self, detail: str = "유효하지 않은 라이선스 키입니다."):
        super().__init__(status_code=401, error="invalid_license", detail=detail)


class LicenseExpiredError(TubeScoutError):
    """라이선스가 만료됨."""

    def __init__(self, detail: str = "라이선스가 만료되었습니다."):
        super().__init__(status_code=403, error="license_expired", detail=detail)


class InsufficientCreditsError(TubeScoutError):
    """크레딧 부족."""

    def __init__(self, required: int, remaining: int):
        super().__init__(
            status_code=402,
            error="insufficient_credits",
            detail=f"크레딧이 부족합니다. 필요: {required}, 잔여: {remaining}",
        )
        self.required = required
        self.remaining = remaining


class ExternalAPIError(TubeScoutError):
    """외부 API(Lemon Squeezy, Gemini, OpenAI) 호출 실패."""

    def __init__(self, service: str, detail: str = ""):
        super().__init__(
            status_code=502,
            error="external_api_error",
            detail=f"{service} API 호출에 실패했습니다. {detail}".strip(),
        )


class RateLimitError(TubeScoutError):
    """요청 제한 초과."""

    def __init__(self, detail: str = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."):
        super().__init__(status_code=429, error="rate_limited", detail=detail)


# ─────────────────────────────────────────────────────────────
# FastAPI 예외 핸들러 등록
# ─────────────────────────────────────────────────────────────
def register_exception_handlers(app: FastAPI) -> None:
    """main.py의 create_app()에서 호출."""

    @app.exception_handler(TubeScoutError)
    async def tubescout_error_handler(
        request: Request, exc: TubeScoutError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error, "detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Sentry가 자동 캡처하므로 여기선 클라이언트에 안전한 메시지만 반환
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_error",
                "detail": "서버 내부 오류가 발생했습니다.",
            },
        )
