# 텔레그램 알림 발송 로직
"""
app/webhooks/service.py
───────────────────────
웹훅 수신 → 텔레그램 알림 발송 서비스.
"""

from __future__ import annotations

import hashlib
import hmac
import logging

import httpx
from app.config import Settings
from app.webhooks.config import (
    LS_EVENTS_TO_HANDLE,
    TELEGRAM_API_BASE,
    TELEGRAM_MAX_MESSAGE_LENGTH,
)
from app.webhooks.schemas import LSWebhookPayload, SentryWebhookPayload

logger = logging.getLogger("tubescout.webhooks")


class WebhookService:
    """웹훅 처리 + 텔레그램 알림."""

    def __init__(self, http_client: httpx.AsyncClient, settings: Settings):
        self._client = http_client
        self._settings = settings

    # ─────────────────────────────────────────────────────────
    # Lemon Squeezy 시그니처 검증
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def verify_ls_signature(
        raw_body: bytes, x_signature: str, secret: str,
    ) -> bool:
        """
        Lemon Squeezy 웹훅의 X-Signature 헤더를 HMAC-SHA256으로 검증한다.
        - raw_body: 요청 body의 raw bytes
        - x_signature: X-Signature 헤더 값
        - secret: LEMON_SQUEEZY_WEBHOOK_SECRET
        """
        if not secret or not x_signature:
            return False

        digest = hmac.new(
            key=secret.encode("utf-8"),
            msg=raw_body,
            digestmod=hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(digest, x_signature)

    # ─────────────────────────────────────────────────────────
    # Sentry 웹훅 → 텔레그램 알림
    # ─────────────────────────────────────────────────────────
    async def handle_sentry_webhook(self, payload: SentryWebhookPayload) -> None:
        """Sentry Issue Alert를 텔레그램으로 전달."""
        title = payload.get_event_title()
        url = payload.get_event_url()
        rule = payload.get_triggered_rule()
        level = payload.get_error_level()
        culprit = payload.get_culprit()

        level_emoji = {
            "fatal": "🔴",
            "error": "🟠",
            "warning": "🟡",
            "info": "🔵",
        }.get(level, "⚪")

        message = (
            f"{level_emoji} <b>[TubeScout Sentry]</b>\n\n"
            f"<b>Level:</b> {level.upper()}\n"
            f"<b>Rule:</b> {rule}\n"
            f"<b>Error:</b> {title}\n"
        )
        if culprit:
            message += f"<b>Culprit:</b> <code>{culprit}</code>\n"
        if url:
            message += f"\n<a href=\"{url}\">Sentry에서 보기 →</a>"

        await self._send_telegram(message)

    # ─────────────────────────────────────────────────────────
    # Lemon Squeezy 웹훅 → 텔레그램 알림
    # ─────────────────────────────────────────────────────────
    async def handle_ls_webhook(
        self,
        payload: LSWebhookPayload,
        credits_cache: dict[str, dict],
    ) -> None:
        """
        Lemon Squeezy 이벤트를 처리한다.
        1) 텔레그램 알림 발송
        2) subscription 변경 시 credits_cache 갱신 (선택)
        """
        event_name = payload.meta.event_name
        attrs = payload.data.attributes

        if event_name not in LS_EVENTS_TO_HANDLE:
            logger.info("무시하는 LS 이벤트: %s", event_name)
            return

        # ── 텔레그램 알림 ────────────────────────────────────
        emoji = self._get_ls_event_emoji(event_name)
        event_display = event_name.replace("_", " ").title()

        message = (
            f"{emoji} <b>[TubeScout 결제]</b>\n\n"
            f"<b>Event:</b> {event_display}\n"
            f"<b>Status:</b> {attrs.status}\n"
        )

        if attrs.user_email:
            message += f"<b>Customer:</b> {attrs.user_name} ({attrs.user_email})\n"
        if attrs.product_name:
            message += f"<b>Product:</b> {attrs.product_name}"
            if attrs.variant_name:
                message += f" — {attrs.variant_name}"
            message += "\n"
        if attrs.total_formatted:
            message += f"<b>Amount:</b> {attrs.total_formatted} {attrs.currency}\n"

        await self._send_telegram(message)

        # ── 구독 만료/취소 시 크레딧 캐시 정리 ───────────────
        if event_name in (
            "subscription_expired",
            "subscription_cancelled",
        ):
            self._handle_subscription_end(attrs, credits_cache)

    # ─────────────────────────────────────────────────────────
    # Private: 텔레그램 메시지 발송
    # ─────────────────────────────────────────────────────────
    async def _send_telegram(self, message: str) -> None:
        """텔레그램 Bot API로 메시지를 발송한다."""
        token = self._settings.TELEGRAM_BOT_TOKEN
        chat_id = self._settings.TELEGRAM_CHAT_ID

        if not token or not chat_id:
            logger.warning("TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정 — 알림 건너뜀")
            return

        # 메시지 길이 제한
        if len(message) > TELEGRAM_MAX_MESSAGE_LENGTH:
            message = message[:TELEGRAM_MAX_MESSAGE_LENGTH] + "\n\n... (잘림)"

        url = TELEGRAM_API_BASE.format(token=token)

        try:
            resp = await self._client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )

            if resp.status_code != 200:
                logger.error(
                    "텔레그램 발송 실패 (status=%d): %s",
                    resp.status_code,
                    resp.text[:300],
                )
        except httpx.HTTPError as e:
            logger.error("텔레그램 발송 중 네트워크 오류: %s", str(e))

    # ─────────────────────────────────────────────────────────
    # Private: 헬퍼
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def _get_ls_event_emoji(event_name: str) -> str:
        return {
            "order_created": "💰",
            "subscription_created": "🎉",
            "subscription_updated": "🔄",
            "subscription_cancelled": "❌",
            "subscription_expired": "⏰",
            "subscription_payment_success": "✅",
            "subscription_payment_failed": "🚨",
            "license_key_created": "🔑",
            "license_key_updated": "🔑",
        }.get(event_name, "📌")

    @staticmethod
    def _handle_subscription_end(
        attrs: object, credits_cache: dict[str, dict],
    ) -> None:
        """
        구독 만료/취소 시 해당 유저의 캐시를 정리한다.
        MVP 한계: user_email로 license_key를 역추적할 수 없으므로,
        로그만 남기고 실제 캐시 삭제는 하지 않는다.
        → 다음 요청에서 LS validate가 expired/cancelled를 반환하면
          verify_license에서 자동으로 차단된다.
        """
        logger.info(
            "구독 종료 이벤트 수신 — 다음 라이선스 검증 시 자동 차단됨. "
            "email=%s, status=%s",
            getattr(attrs, "user_email", "unknown"),
            getattr(attrs, "status", "unknown"),
        )
