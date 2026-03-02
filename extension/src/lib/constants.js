// ============================================================
// TubeScout — 공유 상수
// 모든 context(background, content, popup)에서 import
// ============================================================

'use strict';

// ── 서버 API ──
export const API_BASE_URL = 'https://api.tubescout.dev';

export const ENDPOINTS = {
  ANALYZE_TITLE: '/api/analyze-title',
  ANALYZE_CHANNEL: '/api/analyze-channel',
  SUGGEST_TAGS: '/api/suggest-tags',
  AUTH_VERIFY: '/api/auth/verify',
  CREDITS_CHECK: '/api/credits/check',
};

// ── 크레딧 비용 ──
export const CREDIT_COSTS = {
  ANALYZE_TITLE: 1,
  ANALYZE_CHANNEL: 5,
  SUGGEST_TAGS: 3,
};

// ── 요금제 ──
export const PLANS = {
  FREE: { name: 'Free', monthlyCredits: 20, model: 'gemini-flash', price: 0 },
  PRO: { name: 'Pro', monthlyCredits: 500, model: 'gemini-flash', price: 5 },
  ULTRA: { name: 'Ultra', monthlyCredits: 2000, model: 'gpt-4o', price: 15 },
};

// ── chrome.storage 키 ──
export const STORAGE_KEYS = {
  LICENSE_KEY: 'tubescout_license_key',
  USER_PLAN: 'tubescout_user_plan',
  CREDITS_REMAINING: 'tubescout_credits_remaining',
  CREDITS_RESET_AT: 'tubescout_credits_reset_at',
  CURRENT_VIDEO: 'tubescout_current_video',
  AUTH_CACHE: 'tubescout_auth_cache',
};

// ── 기타 ──
export const EXTENSION_VERSION = chrome.runtime.getManifest().version;

// 인증 캐시 유효 시간 (밀리초) — 서버 부하 감소
// 1시간마다 재검증, 그 사이에는 캐시 사용
export const AUTH_CACHE_TTL_MS = 60 * 60 * 1000;

// API 요청 타임아웃 (밀리초)
export const API_TIMEOUT_MS = 30_000;

// 크레딧 부족 시 업그레이드 URL
export const UPGRADE_URL = 'https://tubescout.dev/pricing';
