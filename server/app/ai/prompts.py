# AI 프롬프트 템플릿 (제목분석, 채널분석, 태그추천)
"""
app/ai/prompts.py
─────────────────
AI 프롬프트 템플릿.
YouTube 크리에이터 분석에 특화된 한국어/영어 겸용 프롬프트.
모든 프롬프트는 JSON 출력을 강제한다.
"""

# ─────────────────────────────────────────────────────────────
# 제목 분석 (analyze-title)
# ─────────────────────────────────────────────────────────────
ANALYZE_TITLE_SYSTEM = """You are a YouTube SEO and content strategy expert.
You analyze YouTube video titles and provide actionable improvement suggestions.
Always respond in the SAME LANGUAGE as the video title.
If the title is in Korean, respond entirely in Korean.
If the title is in English, respond entirely in English."""

ANALYZE_TITLE_USER = """Analyze the following YouTube video and rate the title's effectiveness.

**Title:** {title}
**Tags:** {tags}
**Channel:** {channel}
**View Count:** {view_count}
**Description (first 300 chars):** {description}

Evaluate the title based on these criteria:
1. Click-through rate (CTR) potential — Does it trigger curiosity or emotion?
2. SEO optimization — Does it contain searchable keywords?
3. Length — Is it within 50-60 characters (optimal for YouTube)?
4. Clarity — Does it clearly communicate the video's value?
5. Audience targeting — Is the target audience obvious?

Respond in this exact JSON format:
{{
  "score": <integer 0-100>,
  "suggestions": [
    "<specific actionable suggestion 1>",
    "<specific actionable suggestion 2>",
    "<specific actionable suggestion 3>"
  ],
  "reasoning": "<2-3 sentence explanation of the score>"
}}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no extra text."""

# ─────────────────────────────────────────────────────────────
# 태그 추천 (suggest-tags)
# ─────────────────────────────────────────────────────────────
SUGGEST_TAGS_SYSTEM = """You are a YouTube SEO specialist focused on tag optimization.
You understand YouTube's search algorithm and how tags improve discoverability.
Always respond in the SAME LANGUAGE as the video title.
If the title is in Korean, respond entirely in Korean.
If the title is in English, respond entirely in English."""

SUGGEST_TAGS_USER = """Suggest optimized tags for the following YouTube video.

**Title:** {title}
**Current Tags:** {tags}
**Description (first 300 chars):** {description}

Rules for tag suggestions:
1. Include a mix of broad and specific (long-tail) keywords
2. Include trending/relevant search terms for this topic
3. Each tag should be 1-4 words
4. Suggest 10-15 new tags that are NOT in the current tags list
5. Prioritize tags with high search volume and low competition
6. Consider Korean search patterns if the content is Korean

Respond in this exact JSON format:
{{
  "existing_tags": [<list of current tags as-is>],
  "suggested_tags": [
    "<tag1>",
    "<tag2>",
    "... (10-15 tags)"
  ]
}}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no extra text."""

# ─────────────────────────────────────────────────────────────
# 채널 분석 (analyze-channel)
# ─────────────────────────────────────────────────────────────
ANALYZE_CHANNEL_SYSTEM = """You are a YouTube channel growth strategist and content analyst.
You analyze channel patterns, content strategy, and provide growth insights.
Always respond in the SAME LANGUAGE as the channel name.
If the channel name is in Korean, respond entirely in Korean.
If the channel name is in English, respond entirely in English."""

ANALYZE_CHANNEL_USER = """Analyze the following YouTube channel based on its recent videos.

**Channel Name:** {channel_name}
**Channel URL:** {channel_url}
**Recent Videos:**
{videos_formatted}

Analyze the channel and provide:
1. A concise summary of what this channel is about (2-3 sentences)
2. Content strategy insights (posting frequency patterns, topic clusters, title patterns)
3. Growth opportunities and actionable recommendations
4. Strengths and weaknesses of the current content strategy

Respond in this exact JSON format:
{{
  "channel_name": "{channel_name}",
  "summary": "<2-3 sentence channel summary>",
  "insights": [
    "<actionable insight 1>",
    "<actionable insight 2>",
    "<actionable insight 3>",
    "<actionable insight 4>",
    "<actionable insight 5>"
  ]
}}

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no extra text."""


def format_videos_for_prompt(videos: list[dict]) -> str:
    """채널 분석용 비디오 목록을 프롬프트 문자열로 변환."""
    if not videos:
        return "(No video data provided)"

    lines: list[str] = []
    for i, v in enumerate(videos[:20], 1):  # 최대 20개만 (토큰 제한)
        title = v.get("title", "Unknown")
        views = v.get("view_count", "N/A")
        published = v.get("published_at", "N/A")
        lines.append(
            f"{i}. \"{title}\" — Views: {views}, Published: {published}")

    return "\n".join(lines)
