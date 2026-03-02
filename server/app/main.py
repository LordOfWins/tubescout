"""
app/main.py
─────────────
TubeScout FastAPI 서버 진입점.
uvicorn app.main:app --reload 로 실행.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
import sentry_sdk
from app.config import Settings, get_settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

logger = logging.getLogger("tubescout")


def _init_sentry(settings: Settings) -> None:
    if not settings.SENTRY_DSN:
        logger.warning("SENTRY_DSN이 비어 있어 Sentry를 초기화하지 않습니다.")
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        release=f"tubescout@{settings.APP_VERSION}",
        send_default_pii=False,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )
    logger.info("Sentry 초기화 완료 (env=%s)", settings.ENVIRONMENT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # ── startup ──────────────────────────────────────────────
    _init_sentry(settings)

    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        headers={"User-Agent": f"TubeScout/{settings.APP_VERSION}"},
    )

    app.state.credits_cache: dict[str, dict] = {}

    # AI 서비스 싱글턴
    from app.ai.service import AIService
    app.state.ai_service = AIService(settings=settings)

    logger.info(
        "%s v%s 시작 (env=%s)",
        settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT,
    )

    yield

    # ── shutdown ─────────────────────────────────────────────
    ai_svc: AIService = app.state.ai_service
    if ai_svc._gemini_client:
        ai_svc._gemini_client.close()
    if ai_svc._openai_client:
        await ai_svc._openai_client.close()

    await app.state.http_client.aclose()
    logger.info("리소스 정리 완료")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    from app.exceptions import register_exception_handlers
    register_exception_handlers(app)

    from app.ai.router import router as ai_router
    from app.auth.router import router as auth_router
    from app.credits.router import router as credits_router
    from app.webhooks.router import router as webhooks_router

    app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
    app.include_router(credits_router, prefix="/api/credits", tags=["Credits"])
    app.include_router(ai_router, prefix="/api", tags=["AI Analysis"])
    app.include_router(webhooks_router, prefix="/webhook", tags=["Webhooks"])

    @app.get("/health", tags=["System"])
    async def health_check():
        return {
            "status": "ok",
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        }

    return app


app = create_app()
