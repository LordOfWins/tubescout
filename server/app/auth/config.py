# LEMON_SQUEEZY_API_KEY 등
"""
app/auth/config.py
──────────────────
Lemon Squeezy License API 관련 상수.
"""

# Lemon Squeezy License API 엔드포인트
LS_LICENSE_ACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/activate"
LS_LICENSE_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate"
LS_LICENSE_DEACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/deactivate"

# Content-Type (Lemon Squeezy License API는 JSON이 아닌 form-urlencoded를 사용!)
LS_CONTENT_TYPE = "application/x-www-form-urlencoded"

# 인스턴스 이름 (Lemon Squeezy 대시보드에서 식별용)
LS_INSTANCE_NAME = "TubeScout"
