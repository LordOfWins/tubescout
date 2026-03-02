"""
app/dev_test.py — 로컬 개발 전용 테스트 라우터.
DEBUG=true 환경에서만 활성화. 프로덕션에서는 절대 포함하지 않음.
라이선스 검증 없이 AI 엔드포인트를 직접 테스트하기 위한 용도.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.ai.schemas import (
    AnalyzeChannelRequest, AnalyzeChannelResponse,
    AnalyzeTitleRequest, AnalyzeTitleResponse,
    ChannelAnalysisResult,
    SuggestTagsRequest, SuggestTagsResponse,
    TagSuggestionResult, TitleAnalysisResult,
)
from app.ai.service import AIService

router = APIRouter()


@router.post("/test/analyze-title", response_model=AnalyzeTitleResponse)
async def test_analyze_title(body: AnalyzeTitleRequest, request: Request) -> AnalyzeTitleResponse:
    ai_service: AIService = request.app.state.ai_service
    result = await ai_service.analyze_title(
        plan="free", title=body.title, tags=body.tags,
        channel=body.channel, view_count=body.view_count, description=body.description,
    )
    return AnalyzeTitleResponse(result=TitleAnalysisResult(**result), credits_remaining=99)


@router.post("/test/suggest-tags", response_model=SuggestTagsResponse)
async def test_suggest_tags(body: SuggestTagsRequest, request: Request) -> SuggestTagsResponse:
    ai_service: AIService = request.app.state.ai_service
    result = await ai_service.suggest_tags(
        plan="free", title=body.title, tags=body.tags, description=body.description,
    )
    return SuggestTagsResponse(result=TagSuggestionResult(**result), credits_remaining=99)


@router.post("/test/analyze-channel", response_model=AnalyzeChannelResponse)
async def test_analyze_channel(body: AnalyzeChannelRequest, request: Request) -> AnalyzeChannelResponse:
    ai_service: AIService = request.app.state.ai_service
    videos_dicts = [v.model_dump() for v in body.videos]
    result = await ai_service.analyze_channel(
        plan="free", channel_name=body.channel_name, channel_url=body.channel_url, videos=videos_dicts,
    )
    return AnalyzeChannelResponse(result=ChannelAnalysisResult(**result), credits_remaining=99)
