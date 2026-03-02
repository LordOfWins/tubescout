# Lemon Squeezy API 호출 로직
"""
app/auth/service.py
───────────────────
Lemon Squeezy License API와 통신하는 서비스 레이어.
모든 외부 호출은 httpx.AsyncClient를 사용한다.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from app.auth.config import (
    LS_CONTENT_TYPE,
    LS_INSTANCE_NAME,
    LS_LICENSE_ACTIVATE_URL,
    LS_LICENSE_VALIDATE_URL,
)
from app.auth.schemas import (
    LSActivateResponse,
    LSValidateResponse,
    VerifyLicenseResponse,
)
from app.config import Settings, get_settings
from app.exceptions import (
    ExternalAPIError,
    InvalidLicenseError,
    LicenseExpiredError,
    RateLimitError,
)
from dateutil.relativedelta import relativedelta

logger = logging.getLogger("tubescout.auth")


class AuthService:
    """라이선스 인증 + 크레딧 초기화 담당."""

    def __init__(self, http_client: httpx.AsyncClient, settings: Settings):
        self._client = http_client
        self._settings = settings

    # ─────────────────────────────────────────────────────────
    # Public: 라이선스 검증 (POST /api/auth/verify 에서 호출)
    # ─────────────────────────────────────────────────────────
    async def verify_license(
        self,
        license_key: str,
        credits_cache: dict[str, dict],
    ) -> VerifyLicenseResponse:
        """
        1) Lemon Squeezy activate 시도 → 이미 활성이면 validate로 fallback
        2) variant_id로 요금제 판별
        3) 크레딧 캐시 초기화/조회
        4) 클라이언트 응답 스키마에 맞춰 반환
        """
        # ── Step 1: activate 시도 ────────────────────────────
        ls_data = await self._activate_license(license_key)

        instance_id: str = ""

        if ls_data.activated and ls_data.instance:
            # 새로 활성화 성공
            instance_id = ls_data.instance.id
        else:
            # 이미 활성화됨 (activation_limit 도달 등) → validate로 확인
            validate_data = await self._validate_license(license_key)
            if not validate_data.valid:
                self._handle_invalid_license(validate_data)

            # validate에서 instance는 instance_id 없이 호출하면 null
            # → credits_cache에 저장된 instance_id를 사용하거나 빈 문자열
            cached = credits_cache.get(license_key)
            instance_id = cached["instance_id"] if cached else ""

            # activate 실패했지만 validate 성공 → ls_data를 validate 결과로 교체
            ls_data = self._convert_validate_to_activate_format(validate_data)

        # ── Step 2: 요금제 판별 ──────────────────────────────
        variant_id = ls_data.meta.variant_id
        plan = self._settings.get_plan_from_variant_id(variant_id)

        # ── Step 3: store_id 검증 (보안) ─────────────────────
        if self._settings.LEMON_SQUEEZY_STORE_ID:
            expected_store_id = int(self._settings.LEMON_SQUEEZY_STORE_ID)
            if ls_data.meta.store_id != expected_store_id:
                raise InvalidLicenseError(
                    detail="이 라이선스 키는 TubeScout 제품에 속하지 않습니다."
                )

        # ── Step 4: 라이선스 상태 검증 ───────────────────────
        status = ls_data.license_key.status
        if status == "expired":
            raise LicenseExpiredError()
        if status == "disabled":
            raise InvalidLicenseError(detail="비활성화된 라이선스 키입니다.")
        if status not in ("active", "inactive"):
            raise InvalidLicenseError(detail=f"알 수 없는 라이선스 상태: {status}")

        # ── Step 5: 크레딧 초기화 / 조회 ────────────────────
        credits_total = self._settings.get_credits_total(plan)
        now = datetime.now(timezone.utc)

        if license_key not in credits_cache:
            # 최초 인증 → 크레딧 풀 충전
            credits_reset_at = self._calc_next_reset(now)
            credits_cache[license_key] = {
                "credits_remaining": credits_total,
                "credits_total": credits_total,
                "credits_reset_at": credits_reset_at.isoformat(),
                "plan": plan,
                "instance_id": instance_id,
                "customer_email": ls_data.meta.customer_email,
                "customer_name": ls_data.meta.customer_name,
                "license_status": status,
                "variant_id": variant_id,
            }
        else:
            # 기존 캐시 존재 → 리셋 시각 확인
            cached = credits_cache[license_key]
            reset_at = datetime.fromisoformat(cached["credits_reset_at"])

            if now >= reset_at:
                # 월간 리셋
                cached["credits_remaining"] = credits_total
                cached["credits_total"] = credits_total
                cached["credits_reset_at"] = self._calc_next_reset(
                    now).isoformat()

            # 플랜이 변경됐을 수 있으므로 갱신
            if cached["plan"] != plan:
                new_total = self._settings.get_credits_total(plan)
                cached["plan"] = plan
                cached["credits_total"] = new_total
                # 크레딧 잔여는 새 총량을 초과하지 않도록 조정
                cached["credits_remaining"] = min(
                    cached["credits_remaining"], new_total
                )

            # instance_id 업데이트
            if instance_id:
                cached["instance_id"] = instance_id

            cached["license_status"] = status
            cached["customer_email"] = ls_data.meta.customer_email
            cached["customer_name"] = ls_data.meta.customer_name

        credit_info = credits_cache[license_key]

        return VerifyLicenseResponse(
            valid=True,
            plan=credit_info["plan"],
            credits_remaining=credit_info["credits_remaining"],
            credits_total=credit_info["credits_total"],
            credits_reset_at=credit_info["credits_reset_at"],
            customer_email=credit_info["customer_email"],
            customer_name=credit_info["customer_name"],
            license_status=credit_info["license_status"],
            instance_id=credit_info.get("instance_id", ""),
        )

    # ─────────────────────────────────────────────────────────
    # Public: 라이선스 유효성만 확인 (다른 엔드포인트의 Depends에서 사용)
    # ─────────────────────────────────────────────────────────
    async def validate_license_only(
        self,
        license_key: str,
        credits_cache: dict[str, dict],
    ) -> dict:
        """
        credits_cache에 캐시가 있으면 LS API 호출 없이 반환.
        캐시가 없으면 validate API를 한 번 호출.
        반환: credits_cache[license_key] dict
        """
        if license_key in credits_cache:
            cached = credits_cache[license_key]
            # 리셋 시각 확인
            now = datetime.now(timezone.utc)
            reset_at = datetime.fromisoformat(cached["credits_reset_at"])
            if now >= reset_at:
                plan = cached["plan"]
                cached["credits_remaining"] = self._settings.get_credits_total(
                    plan)
                cached["credits_reset_at"] = self._calc_next_reset(
                    now).isoformat()
            return cached

        # 캐시 없음 → validate 호출
        data = await self._validate_license(license_key)
        if not data.valid:
            self._handle_invalid_license(data)

        variant_id = data.meta.variant_id
        plan = self._settings.get_plan_from_variant_id(variant_id)
        credits_total = self._settings.get_credits_total(plan)
        now = datetime.now(timezone.utc)

        credits_cache[license_key] = {
            "credits_remaining": credits_total,
            "credits_total": credits_total,
            "credits_reset_at": self._calc_next_reset(now).isoformat(),
            "plan": plan,
            "instance_id": "",
            "customer_email": data.meta.customer_email,
            "customer_name": data.meta.customer_name,
            "license_status": data.license_key.status,
            "variant_id": variant_id,
        }
        return credits_cache[license_key]

    # ─────────────────────────────────────────────────────────
    # Private: Lemon Squeezy API 호출
    # ─────────────────────────────────────────────────────────
    async def _activate_license(self, license_key: str) -> LSActivateResponse:
        try:
            resp = await self._client.post(
                LS_LICENSE_ACTIVATE_URL,
                data={
                    "license_key": license_key,
                    "instance_name": LS_INSTANCE_NAME,
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": LS_CONTENT_TYPE,
                },
            )
        except httpx.HTTPError as e:
            raise ExternalAPIError("Lemon Squeezy", str(e))

        if resp.status_code == 404:
            raise InvalidLicenseError(detail="존재하지 않는 라이선스 키입니다.")
        if resp.status_code == 429:
            from app.exceptions import RateLimitError
            raise RateLimitError(
                detail="Lemon Squeezy API 요청 제한에 도달했습니다. 1분 후 다시 시도해주세요."
            )

        try:
            return LSActivateResponse.model_validate(resp.json())
        except Exception:
            # 파싱 실패 → 원본 응답을 로그에 남기고 에러 반환
            logger.error("LS activate 응답 파싱 실패: %s", resp.text[:500])
            raise ExternalAPIError("Lemon Squeezy", "응답 파싱 실패")

    async def _validate_license(
        self, license_key: str, instance_id: str | None = None
    ) -> LSValidateResponse:
        payload: dict[str, str] = {"license_key": license_key}
        if instance_id:
            payload["instance_id"] = instance_id

        try:
            resp = await self._client.post(
                LS_LICENSE_VALIDATE_URL,
                data=payload,
                headers={
                    "Accept": "application/json",
                    "Content-Type": LS_CONTENT_TYPE,
                },
            )
        except httpx.HTTPError as e:
            raise ExternalAPIError("Lemon Squeezy", str(e))

        if resp.status_code == 404:
            raise InvalidLicenseError(detail="존재하지 않는 라이선스 키입니다.")
        if resp.status_code == 429:
            from app.exceptions import RateLimitError
            raise RateLimitError(
                detail="Lemon Squeezy API 요청 제한에 도달했습니다. 1분 후 다시 시도해주세요."
            )

        try:
            return LSValidateResponse.model_validate(resp.json())
        except Exception:
            logger.error("LS validate 응답 파싱 실패: %s", resp.text[:500])
            raise ExternalAPIError("Lemon Squeezy", "응답 파싱 실패")

    # ─────────────────────────────────────────────────────────
    # Private: 헬퍼
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def _handle_invalid_license(data: LSValidateResponse) -> None:
        """validate 실패 시 적절한 예외를 발생시킨다."""
        status = data.license_key.status
        if status == "expired":
            raise LicenseExpiredError()
        if status == "disabled":
            raise InvalidLicenseError(detail="비활성화된 라이선스 키입니다.")
        raise InvalidLicenseError(
            detail=data.error or "라이선스 검증에 실패했습니다."
        )

    @staticmethod
    def _convert_validate_to_activate_format(
        data: LSValidateResponse,
    ) -> LSActivateResponse:
        """validate 응답을 activate 응답 형태로 변환 (내부 처리 통일용)."""
        return LSActivateResponse(
            activated=data.valid,
            error=data.error,
            license_key=data.license_key,
            instance=data.instance,
            meta=data.meta,
        )

    @staticmethod
    def _calc_next_reset(now: datetime) -> datetime:
        """다음 월간 크레딧 리셋 시각 계산 (다음 달 1일 00:00 UTC)."""
        next_month = now + relativedelta(months=1)
        return next_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
