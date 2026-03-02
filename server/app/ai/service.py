# Gemini/GPT 호출 + 프롬프트 관리
"""
app/ai/service.py
─────────────────
Gemini / OpenAI 호출 서비스.
요금제에 따라 모델을 자동 분기한다.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.ai.config import (
    AI_MAX_RETRIES,
    AI_RETRY_DELAY_SECONDS,
    GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
    GEMINI_DEFAULT_TEMPERATURE,
    GEMINI_DEFAULT_TOP_P,
    OPENAI_DEFAULT_MAX_TOKENS,
    OPENAI_DEFAULT_TEMPERATURE,
)
from app.ai.prompts import (
    ANALYZE_CHANNEL_SYSTEM,
    ANALYZE_CHANNEL_USER,
    ANALYZE_TITLE_SYSTEM,
    ANALYZE_TITLE_USER,
    SUGGEST_TAGS_SYSTEM,
    SUGGEST_TAGS_USER,
    format_videos_for_prompt,
)
from app.config import Settings
from app.exceptions import ExternalAPIError
from google import genai
from google.genai import types as genai_types
from openai import AsyncOpenAI

logger = logging.getLogger("tubescout.ai")


class AIService:
    """
    AI 분석 서비스.
    Gemini와 OpenAI를 통합하여, plan에 따라 자동으로 모델을 선택한다.
    """

    def __init__(self, settings: Settings):
        self._settings = settings

        # Gemini 클라이언트 (google-genai SDK)
        self._gemini_client: genai.Client | None = None
        if settings.GEMINI_API_KEY:
            self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # OpenAI 클라이언트 (openai SDK)
        self._openai_client: AsyncOpenAI | None = None
        if settings.OPENAI_API_KEY:
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    # ─────────────────────────────────────────────────────────
    # Public: 제목 분석
    # ─────────────────────────────────────────────────────────
    async def analyze_title(
        self, plan: str, title: str, tags: list[str],
        channel: str, view_count: int, description: str,
    ) -> dict:
        user_prompt = ANALYZE_TITLE_USER.format(
            title=title,
            tags=", ".join(tags) if tags else "(none)",
            channel=channel or "(unknown)",
            view_count=view_count,
            description=description[:300] if description else "(none)",
        )

        raw = await self._call_ai(
            plan=plan,
            system_prompt=ANALYZE_TITLE_SYSTEM,
            user_prompt=user_prompt,
        )

        parsed = self._parse_json(raw)

        # 스키마 보정: score 범위 강제
        score = max(0, min(100, int(parsed.get("score", 50))))
        suggestions = parsed.get("suggestions", [])
        reasoning = parsed.get("reasoning", "")

        # suggestions가 최소 1개는 있어야 함
        if not suggestions:
            suggestions = ["제목에 대한 구체적인 개선점을 도출하지 못했습니다."]

        return {
            "score": score,
            "suggestions": suggestions[:5],  # 최대 5개
            "reasoning": reasoning,
        }

    # ─────────────────────────────────────────────────────────
    # Public: 태그 추천
    # ─────────────────────────────────────────────────────────
    async def suggest_tags(
        self, plan: str, title: str, tags: list[str], description: str,
    ) -> dict:
        user_prompt = SUGGEST_TAGS_USER.format(
            title=title,
            tags=", ".join(tags) if tags else "(none)",
            description=description[:300] if description else "(none)",
        )

        raw = await self._call_ai(
            plan=plan,
            system_prompt=SUGGEST_TAGS_SYSTEM,
            user_prompt=user_prompt,
        )

        parsed = self._parse_json(raw)

        existing_tags = parsed.get("existing_tags", tags)
        suggested_tags = parsed.get("suggested_tags", [])

        return {
            "existing_tags": existing_tags,
            "suggested_tags": suggested_tags[:20],  # 최대 20개
        }

    # ─────────────────────────────────────────────────────────
    # Public: 채널 분석
    # ─────────────────────────────────────────────────────────
    async def analyze_channel(
        self, plan: str, channel_name: str, channel_url: str,
        videos: list[dict],
    ) -> dict:
        videos_formatted = format_videos_for_prompt(videos)

        user_prompt = ANALYZE_CHANNEL_USER.format(
            channel_name=channel_name,
            channel_url=channel_url or "(unknown)",
            videos_formatted=videos_formatted,
        )

        raw = await self._call_ai(
            plan=plan,
            system_prompt=ANALYZE_CHANNEL_SYSTEM,
            user_prompt=user_prompt,
        )

        parsed = self._parse_json(raw)

        return {
            "channel_name": parsed.get("channel_name", channel_name),
            "summary": parsed.get("summary", ""),
            "insights": parsed.get("insights", [])[:10],  # 최대 10개
        }

    # ─────────────────────────────────────────────────────────
    # Private: AI 호출 통합 (Gemini / OpenAI 분기)
    # ─────────────────────────────────────────────────────────
    async def _call_ai(
        self, plan: str, system_prompt: str, user_prompt: str,
    ) -> str:
        """
        plan에 따라 적절한 AI 모델을 호출하고 텍스트 응답을 반환한다.
        재시도 로직 포함.
        """
        model_name = self._settings.get_ai_model(plan)
        is_openai = model_name.startswith("gpt-")

        last_error: Exception | None = None

        for attempt in range(1, AI_MAX_RETRIES + 1):
            try:
                if is_openai:
                    return await self._call_openai(
                        model_name, system_prompt, user_prompt
                    )
                else:
                    return await self._call_gemini(
                        model_name, system_prompt, user_prompt
                    )
            except Exception as e:
                last_error = e
                logger.warning(
                    "AI 호출 실패 (attempt %d/%d, model=%s): %s",
                    attempt, AI_MAX_RETRIES, model_name, str(e),
                )
                if attempt < AI_MAX_RETRIES:
                    await asyncio.sleep(AI_RETRY_DELAY_SECONDS * attempt)

        raise ExternalAPIError(
            service="AI",
            detail=f"{model_name} 호출이 {AI_MAX_RETRIES}회 모두 실패했습니다. "
            f"마지막 에러: {str(last_error)}",
        )

    async def _call_gemini(
        self, model: str, system_prompt: str, user_prompt: str,
    ) -> str:
        """google-genai SDK 비동기 호출."""
        if not self._gemini_client:
            raise ExternalAPIError("Gemini", "GEMINI_API_KEY가 설정되지 않았습니다.")

        response = await self._gemini_client.aio.models.generate_content(
            model=model,
            contents=user_prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=GEMINI_DEFAULT_TEMPERATURE,
                max_output_tokens=GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
                top_p=GEMINI_DEFAULT_TOP_P,
                response_mime_type="application/json",
            ),
        )

        if not response.text:
            raise ExternalAPIError("Gemini", "빈 응답을 받았습니다.")

        return response.text

    async def _call_openai(
        self, model: str, system_prompt: str, user_prompt: str,
    ) -> str:
        """OpenAI SDK 비동기 호출."""
        if not self._openai_client:
            raise ExternalAPIError("OpenAI", "OPENAI_API_KEY가 설정되지 않았습니다.")

        completion = await self._openai_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=OPENAI_DEFAULT_TEMPERATURE,
            max_tokens=OPENAI_DEFAULT_MAX_TOKENS,
            response_format={"type": "json_object"},
        )

        content = completion.choices[0].message.content
        if not content:
            raise ExternalAPIError("OpenAI", "빈 응답을 받았습니다.")

        return content

    # ─────────────────────────────────────────────────────────
    # Private: JSON 파싱 (방어적)
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        """
        AI 응답에서 JSON을 추출한다.
        가끔 마크다운 코드블록으로 감싸서 오는 경우를 처리.
        """
        text = raw.strip()

        # ```json ... ``` 또는 ``` ... ``` 패턴 제거
        if text.startswith("```"):
            # 첫 번째 줄 제거 (```json 등)
            lines = text.split("\n", 1)
            if len(lines) > 1:
                text = lines[1]
            # 마지막 ``` 제거
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.error("AI JSON 파싱 실패. 원본 (처음 500자): %s", raw[:500])
            # 파싱 실패 시 빈 dict 반환 → 호출부에서 기본값 처리
            return {}
