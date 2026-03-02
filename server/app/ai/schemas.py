# TitleAnalysisRequest/Response, ChannelAnalysisRequest/Response, TagRequest/Response
"""
app/ai/schemas.py
─────────────────
AI 분석 엔드포인트의 Request/Response 스키마.
클라이언트가 기대하는 응답 포맷을 정확히 준수한다.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────
# analyze-title
# ─────────────────────────────────────────────────────────────
class AnalyzeTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    tags: list[str] = Field(default_factory=list)
    channel: str = Field(default="")
    view_count: int = Field(default=0, ge=0)
    description: str = Field(default="")


class TitleAnalysisResult(BaseModel):
    score: int = Field(..., ge=0, le=100)
    suggestions: list[str]
    reasoning: str


class AnalyzeTitleResponse(BaseModel):
    result: TitleAnalysisResult
    credits_remaining: int


# ─────────────────────────────────────────────────────────────
# suggest-tags
# ─────────────────────────────────────────────────────────────
class SuggestTagsRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    tags: list[str] = Field(default_factory=list)
    description: str = Field(default="")


class TagSuggestionResult(BaseModel):
    existing_tags: list[str]
    suggested_tags: list[str]


class SuggestTagsResponse(BaseModel):
    result: TagSuggestionResult
    credits_remaining: int


# ─────────────────────────────────────────────────────────────
# analyze-channel
# ─────────────────────────────────────────────────────────────
class VideoInfo(BaseModel):
    title: str = Field(default="")
    view_count: int | str = Field(default=0)
    published_at: str = Field(default="")


class AnalyzeChannelRequest(BaseModel):
    channel_name: str = Field(..., min_length=1, max_length=200)
    channel_url: str = Field(default="")
    videos: list[VideoInfo] = Field(default_factory=list)


class ChannelAnalysisResult(BaseModel):
    channel_name: str
    summary: str
    insights: list[str]


class AnalyzeChannelResponse(BaseModel):
    result: ChannelAnalysisResult
    credits_remaining: int
