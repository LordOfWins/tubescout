# SentryPayload, LemonSqueezyPayload
"""
app/webhooks/schemas.py
───────────────────────
웹훅 페이로드 Pydantic 스키마.
Sentry와 Lemon Squeezy 둘 다 payload가 매우 깊은데,
필요한 필드만 추출하고 나머지는 무시한다 (extra="allow").
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────
# Sentry Webhook
# ─────────────────────────────────────────────────────────────
class SentryWebhookPayload(BaseModel):
    """Sentry Issue Alert 웹훅 페이로드. 필요한 필드만 정의."""

    class Config:
        extra = "allow"

    action: str = "triggered"
    data: dict[str, Any] = Field(default_factory=dict)

    def get_event_title(self) -> str:
        event = self.data.get("event", {})
        return event.get("title", "Unknown Error")

    def get_event_url(self) -> str:
        event = self.data.get("event", {})
        return event.get("web_url", "")

    def get_triggered_rule(self) -> str:
        return self.data.get("triggered_rule", "Unknown Rule")

    def get_error_level(self) -> str:
        event = self.data.get("event", {})
        return event.get("level", "error")

    def get_project(self) -> str:
        event = self.data.get("event", {})
        return str(event.get("project", ""))

    def get_culprit(self) -> str:
        event = self.data.get("event", {})
        return event.get("culprit", "")


# ─────────────────────────────────────────────────────────────
# Lemon Squeezy Webhook
# ─────────────────────────────────────────────────────────────
class LSWebhookMeta(BaseModel):
    """Lemon Squeezy 웹훅의 meta 객체."""

    class Config:
        extra = "allow"

    event_name: str = ""
    custom_data: dict[str, Any] | None = None


class LSWebhookAttributes(BaseModel):
    """Lemon Squeezy 웹훅의 data.attributes 주요 필드."""

    class Config:
        extra = "allow"

    # 공통
    store_id: int = 0
    status: str = ""

    # order / subscription
    user_email: str = ""
    user_name: str = ""
    first_order_item: dict[str, Any] | None = None

    # subscription 전용
    variant_id: int | None = None
    product_id: int | None = None
    product_name: str = ""
    variant_name: str = ""
    customer_id: int | None = None

    # 결제 관련
    total: int | None = None          # 센트 단위
    currency: str = "USD"
    total_formatted: str = ""


class LSWebhookData(BaseModel):
    """Lemon Squeezy 웹훅의 data 객체."""

    class Config:
        extra = "allow"

    id: str = ""
    type: str = ""
    attributes: LSWebhookAttributes = Field(
        default_factory=LSWebhookAttributes)


class LSWebhookPayload(BaseModel):
    """
    Lemon Squeezy 웹훅 전체 페이로드.
    JSON:API 형태이므로 meta + data 구조.
    """

    class Config:
        extra = "allow"

    meta: LSWebhookMeta = Field(default_factory=LSWebhookMeta)
    data: LSWebhookData = Field(default_factory=LSWebhookData)


# ─────────────────────────────────────────────────────────────
# 응답
# ─────────────────────────────────────────────────────────────
class WebhookResponse(BaseModel):
    status: str = "ok"
