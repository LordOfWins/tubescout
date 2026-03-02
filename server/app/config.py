# 글로벌 설정 (env vars, Pydantic BaseSettings)
"""
app/config.py
─────────────
TubeScout 서버 전역 설정.
pydantic-settings 2.13+ / Pydantic v2 기반.
.env 파일에서 환경변수를 로드한다.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    모든 환경변수를 하나의 클래스로 관리.
    하위 모듈(auth, ai, webhooks 등)은 이 객체에서 필요한 값만 꺼내 쓴다.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # .env에 미정의 키가 있어도 에러 안 남
        case_sensitive=False,     # 환경변수 대소문자 무시
    )

    # ── 앱 기본 ──────────────────────────────────────────────
    APP_NAME: str = "TubeScout API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # CORS (Chrome 확장 → 서버)
    CORS_ORIGINS: list[str] = Field(
        default=["chrome-extension://*"],
        description="허용할 Origin 목록. Chrome 확장 ID를 명시하면 더 안전.",
    )

    # ── Lemon Squeezy ───────────────────────────────────────
    # Store API key (서버→LS API 호출 시 사용)
    LEMON_SQUEEZY_API_KEY: str = ""
    LEMON_SQUEEZY_WEBHOOK_SECRET: str = ""     # Webhook signature 검증용
    LEMON_SQUEEZY_STORE_ID: str = ""

    # variant_id → plan 매핑 (Lemon Squeezy 대시보드에서 확인)
    VARIANT_ID_FREE: int = 0
    VARIANT_ID_PRO: int = 0
    VARIANT_ID_ULTRA: int = 0

    # ── AI 모델 키 ──────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # ── Sentry ──────────────────────────────────────────────
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="프로덕션 0.1~0.3 권장, 개발 1.0",
    )

    # ── 텔레그램 알림 ───────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # ── 크레딧 기본값 ───────────────────────────────────────
    CREDITS_FREE: int = 20
    CREDITS_PRO: int = 500
    CREDITS_ULTRA: int = 2000

    # ── 크레딧 비용 ─────────────────────────────────────────
    COST_ANALYZE_TITLE: int = 1
    COST_ANALYZE_CHANNEL: int = 5
    COST_SUGGEST_TAGS: int = 3

    # ── 요금제별 AI 모델 매핑 ───────────────────────────────
    # free/pro → Gemini Flash, ultra → GPT-4o
    AI_MODEL_FREE: str = "gemini-2.5-flash"
    AI_MODEL_PRO: str = "gemini-2.5-flash"
    AI_MODEL_ULTRA: str = "gpt-4o"

    # ── 헬퍼 메서드 ─────────────────────────────────────────
    def get_plan_from_variant_id(self, variant_id: int) -> str:
        """Lemon Squeezy variant_id → 'free' | 'pro' | 'ultra'"""
        mapping = {
            self.VARIANT_ID_FREE: "free",
            self.VARIANT_ID_PRO: "pro",
            self.VARIANT_ID_ULTRA: "ultra",
        }
        return mapping.get(variant_id, "free")

    def get_credits_total(self, plan: str) -> int:
        """요금제에 따른 월간 총 크레딧"""
        return {
            "free": self.CREDITS_FREE,
            "pro": self.CREDITS_PRO,
            "ultra": self.CREDITS_ULTRA,
        }.get(plan, self.CREDITS_FREE)

    def get_ai_model(self, plan: str) -> str:
        """요금제에 따른 AI 모델명"""
        return {
            "free": self.AI_MODEL_FREE,
            "pro": self.AI_MODEL_PRO,
            "ultra": self.AI_MODEL_ULTRA,
        }.get(plan, self.AI_MODEL_FREE)


@lru_cache
def get_settings() -> Settings:
    """
    Settings 싱글턴. FastAPI Depends()에서 사용.
    lru_cache 덕분에 .env 파일을 매 요청마다 다시 읽지 않는다.
    """
    return Settings()
