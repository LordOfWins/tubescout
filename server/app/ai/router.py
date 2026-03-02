"""
app/ai/router.py
────────────────
POST /api/analyze-title
POST /api/suggest-tags
POST /api/analyze-channel
"""

from __future__ import annotations

import logging

from app.ai.schemas import (
    AnalyzeChannelRequest,
    AnalyzeChannelResponse,
    AnalyzeTitleRequest,
    AnalyzeTitleResponse,
    ChannelAnalysisResult,
    SuggestTagsRequest,
    SuggestTagsResponse,
    TagSuggestionResult,
    TitleAnalysisResult,
)
from app.ai.service import AIService
from app.credits.dependencies import require_credits
from app.credits.service import CreditsService
from fastapi import APIRouter, Depends, Request

logger = logging.getLogger("tubescout.ai")

router = APIRouter()


@router.post("/analyze-title", response_model=AnalyzeTitleResponse)
async def analyze_title(
    body: AnalyzeTitleRequest,
    request: Request,
    credit_result: dict = Depends(require_credits(1)),
) -> AnalyzeTitleResponse:
    plan = credit_result["credit_info"]["plan"]
    credits_remaining = credit_result["credits_remaining"]
    license_key = credit_result["license_key"]

    ai_service: AIService = request.app.state.ai_service

    try:
        result = await ai_service.analyze_title(
            plan=plan,
            title=body.title,
            tags=body.tags,
            channel=body.channel,
            view_count=body.view_count,
            description=body.description,
        )
    except Exception:
        credits_remaining = await CreditsService.refund_credits(
            license_key=license_key,
            credits_cache=request.app.state.credits_cache,
            amount=1,
        )
        raise

    return AnalyzeTitleResponse(
        result=TitleAnalysisResult(**result),
        credits_remaining=credits_remaining,
    )


@router.post("/suggest-tags", response_model=SuggestTagsResponse)
async def suggest_tags(
    body: SuggestTagsRequest,
    request: Request,
    credit_result: dict = Depends(require_credits(3)),
) -> SuggestTagsResponse:
    plan = credit_result["credit_info"]["plan"]
    credits_remaining = credit_result["credits_remaining"]
    license_key = credit_result["license_key"]

    ai_service: AIService = request.app.state.ai_service

    try:
        result = await ai_service.suggest_tags(
            plan=plan,
            title=body.title,
            tags=body.tags,
            description=body.description,
        )
    except Exception:
        credits_remaining = await CreditsService.refund_credits(
            license_key=license_key,
            credits_cache=request.app.state.credits_cache,
            amount=3,
        )
        raise

    return SuggestTagsResponse(
        result=TagSuggestionResult(**result),
        credits_remaining=credits_remaining,
    )


@router.post("/analyze-channel", response_model=AnalyzeChannelResponse)
async def analyze_channel(
    body: AnalyzeChannelRequest,
    request: Request,
    credit_result: dict = Depends(require_credits(5)),
) -> AnalyzeChannelResponse:
    plan = credit_result["credit_info"]["plan"]
    credits_remaining = credit_result["credits_remaining"]
    license_key = credit_result["license_key"]

    ai_service: AIService = request.app.state.ai_service

    try:
        videos_dicts = [v.model_dump() for v in body.videos]
        result = await ai_service.analyze_channel(
            plan=plan,
            channel_name=body.channel_name,
            channel_url=body.channel_url,
            videos=videos_dicts,
        )
    except Exception:
        credits_remaining = await CreditsService.refund_credits(
            license_key=license_key,
            credits_cache=request.app.state.credits_cache,
            amount=5,
        )
        raise

    return AnalyzeChannelResponse(
        result=ChannelAnalysisResult(**result),
        credits_remaining=credits_remaining,
    )
