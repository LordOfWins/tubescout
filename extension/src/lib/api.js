// ============================================================
// TubeScout — 서버 API 호출 모듈
// 모든 서버 통신의 단일 진입점
// 인증 헤더 자동 첨부, 타임아웃, 에러 정규화
// ============================================================

'use strict';

import { API_BASE_URL, API_TIMEOUT_MS, STORAGE_KEYS } from '@lib/constants';
import * as storage from '@lib/storage';

// ── 커스텀 에러 클래스 ──

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status    - HTTP 상태 코드 (0이면 네트워크 에러)
   * @param {string} code      - 서버가 반환한 에러 코드 (예: 'INSUFFICIENT_CREDITS')
   * @param {Object} details   - 서버가 반환한 추가 정보
   */
  constructor(message, status = 0, code = 'UNKNOWN', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 인증 관련 에러인지 */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /** 크레딧 부족인지 */
  get isCreditsError() {
    return this.code === 'INSUFFICIENT_CREDITS';
  }

  /** 네트워크 에러 (서버 응답 없음) */
  get isNetworkError() {
    return this.status === 0;
  }

  /** 요청 제한 초과 */
  get isRateLimited() {
    return this.status === 429;
  }
}

// ── 내부 헬퍼 ──

/**
 * AbortController + setTimeout 기반 타임아웃 fetch
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 저장된 라이선스 키를 Authorization 헤더에 첨부
 * @returns {Promise<Object>} headers 객체
 */
async function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const licenseKey = await storage.get(STORAGE_KEYS.LICENSE_KEY);
  if (licenseKey) {
    headers['Authorization'] = `Bearer ${licenseKey}`;
  }

  return headers;
}

/**
 * 서버 응답을 파싱하고 에러 시 ApiError throw
 * @param {Response} response
 * @returns {Promise<Object>}
 */
async function handleResponse(response) {
  let body = null;

  try {
    body = await response.json();
  } catch {
    // JSON 파싱 실패 — 서버가 비정상 응답
  }

  if (!response.ok) {
    throw new ApiError(
      body?.message || `HTTP ${response.status}`,
      response.status,
      body?.code || 'UNKNOWN',
      body?.details || null,
    );
  }

  return body;
}

// ── 공개 API ──

/**
 * GET 요청
 * @param {string} endpoint - ENDPOINTS 상수 값 (예: '/api/credits/check')
 * @param {Object} params   - URL 쿼리 파라미터
 * @returns {Promise<Object>}
 */
export async function get(endpoint, params = {}) {
  const url = new URL(endpoint, API_BASE_URL);
  const headers = await buildHeaders();

  // 쿼리 파라미터 추가
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, String(value));
  });

  try {
    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // 네트워크 에러, 타임아웃 등
    throw new ApiError(
      err.name === 'AbortError' ? 'Request timeout' : 'Network error',
      0,
      err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    );
  }
}

/**
 * POST 요청
 * @param {string} endpoint - ENDPOINTS 상수 값
 * @param {Object} data     - JSON body
 * @returns {Promise<Object>}
 */
export async function post(endpoint, data = {}) {
  const url = new URL(endpoint, API_BASE_URL);
  const headers = await buildHeaders();

  try {
    const response = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err.name === 'AbortError' ? 'Request timeout' : 'Network error',
      0,
      err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    );
  }
}

// ── 도메인별 편의 함수 ──
// 각 엔드포인트를 직접 호출하는 래퍼
// popup이나 background에서 import { analyzeTitle } from '@lib/api' 로 사용

import { ENDPOINTS } from '@lib/constants';

/** 제목 AI 분석 (크레딧 1) */
export async function analyzeTitle(payload) {
  return post(ENDPOINTS.ANALYZE_TITLE, payload);
}

/** 채널 경쟁 분석 (크레딧 5) */
export async function analyzeChannel(payload) {
  return post(ENDPOINTS.ANALYZE_CHANNEL, payload);
}

/** 태그 AI 추천 (크레딧 3) */
export async function suggestTags(payload) {
  return post(ENDPOINTS.SUGGEST_TAGS, payload);
}

/** 라이선스 검증 */
export async function verifyLicense(licenseKey) {
  return post(ENDPOINTS.AUTH_VERIFY, { license_key: licenseKey });
}

/** 크레딧 잔량 조회 */
export async function checkCredits() {
  return get(ENDPOINTS.CREDITS_CHECK);
}
