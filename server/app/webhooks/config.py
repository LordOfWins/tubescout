# TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""
app/webhooks/config.py
──────────────────────
웹훅 모듈 상수.
"""

# Telegram Bot API
TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}/sendMessage"

# 텔레그램 메시지 최대 길이 (4096자, HTML 파싱 시)
TELEGRAM_MAX_MESSAGE_LENGTH = 4000

# Lemon Squeezy 웹훅 이벤트 중 우리가 처리할 것들
LS_EVENTS_TO_HANDLE = {
    "order_created",
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_expired",
    "subscription_payment_success",
    "subscription_payment_failed",
    "license_key_created",
    "license_key_updated",
}
