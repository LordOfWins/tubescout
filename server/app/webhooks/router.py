# POST /webhook/sentry, /webhook/lemonsqueezy
"""
app/webhooks/router.py
──────────────────────
POST /webhook/sentry
POST /webhook/lemonsqueezy
"""

from __future__ import annotations

import logging

from app.config import Settings, get_settings
from app.exceptions import TubeScoutError
from app.webhooks.schemas import LSWebhookPayload, SentryWebhookPayload, WebhookResponse
from app.webhooks.service import WebhookService
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("tubescout.webhooks")

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# POST /webhook/sentry
# ─────────────────────────────────────────────────────────────
@router.post("/sentry", response_model=WebhookResponse)
async def sentry_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> WebhookResponse:
    """
    Sentry Issue Alert 웹훅 수신 → 텔레그램 알림.
    Sentry Internal Integration으로 등록한 Webhook URL.
    """
    try:
        body = await request.json()
        payload = SentryWebhookPayload.model_validate(body)
    except Exception as e:
        logger.warning("Sentry 웹훅 페이로드 파싱 실패: %s", str(e))
        return WebhookResponse(status="ignored")

    http_client = request.app.state.http_client
    service = WebhookService(http_client=http_client, settings=settings)

    try:
        await service.handle_sentry_webhook(payload)
    except Exception as e:
        # 텔레그램 발송 실패해도 Sentry에 200 반환 (무한 재시도 방지)
        logger.error("Sentry 웹훅 처리 중 오류: %s", str(e))

    return WebhookResponse(status="ok")


# ─────────────────────────────────────────────────────────────
# POST /webhook/lemonsqueezy
# ─────────────────────────────────────────────────────────────
@router.post("/lemonsqueezy", response_model=WebhookResponse)
async def lemonsqueezy_webhook(
    request: Request,
    x_signature: str | None = Header(None, alias="X-Signature"),
    settings: Settings = Depends(get_settings),
) -> JSONResponse | WebhookResponse:
    """
    Lemon Squeezy 웹훅 수신.
    1) X-Signature 검증
    2) 이벤트 처리 (텔레그램 알림 + 필요 시 캐시 갱신)
    """
    # ── raw body 읽기 (시그니처 검증에 필요) ─────────────────
    raw_body = await request.body()

    # ── 시그니처 검증 ────────────────────────────────────────
    secret = settings.LEMON_SQUEEZY_WEBHOOK_SECRET

    if secret:
        if not x_signature:
            logger.warning("LS 웹훅: X-Signature 헤더 누락")
            return JSONResponse(
                status_code=401,
                content={"error": "missing_signature",
                         "detail": "X-Signature header required"},
            )

        if not WebhookService.verify_ls_signature(raw_body, x_signature, secret):
            logger.warning("LS 웹훅: 시그니처 불일치")
            return JSONResponse(
                status_code=401,
                content={"error": "invalid_signature",
                         "detail": "Signature verification failed"},
            )
    else:
        logger.warning(
            "LEMON_SQUEEZY_WEBHOOK_SECRET 미설정 — 시그니처 검증 건너뜀 (개발 환경에서만 허용)"
        )

    # ── 페이로드 파싱 ────────────────────────────────────────
    try:
        body = await request.json()
        payload = LSWebhookPayload.model_validate(body)
    except Exception as e:
        logger.warning("LS 웹훅 페이로드 파싱 실패: %s", str(e))
        return WebhookResponse(status="ignored")

    # ── 이벤트 처리 ──────────────────────────────────────────
    http_client = request.app.state.http_client
    credits_cache = request.app.state.credits_cache
    service = WebhookService(http_client=http_client, settings=settings)

    try:
        await service.handle_ls_webhook(payload, credits_cache)
    except Exception as e:
        logger.error("LS 웹훅 처리 중 오류: %s", str(e))

    return WebhookResponse(status="ok")
