// Service Worker: 메시지 라우팅, 인증 상태, 알람
// ============================================================
// TubeScout — Background Service Worker
//
// 역할:
// 1. 메시지 라우팅 (content ↔ popup ↔ background)
// 2. 라이선스 주기적 재검증 (chrome.alarms)
// 3. 확장 설치/업데이트 시 초기화
// 4. 크레딧 부족/인증 에러 시 배지 표시
//
// MV3 Service Worker 주의사항:
// - 유휴 시 종료됨 → 전역 변수에 상태 저장 금지
// - setTimeout 불안정 → chrome.alarms 사용
// - DOM 접근 불가
// ============================================================

'use strict';

import * as api from '@lib/api';
import * as auth from '@lib/auth';
import { STORAGE_KEYS } from '@lib/constants';
import * as credits from '@lib/credits';
import * as storage from '@lib/storage';

// ── 상수 ──
const ALARM_AUTH_CHECK = 'tubescout-auth-check';
const AUTH_CHECK_INTERVAL_MINUTES = 60; // 1시간마다 라이선스 재검증

// ============================================================
//  1. 확장 설치/업데이트 이벤트
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 최초 설치: Free 요금제 기본값 세팅
    await storage.setMultiple({
      [STORAGE_KEYS.USER_PLAN]: 'free',
      [STORAGE_KEYS.CREDITS_REMAINING]: 20,
    });

    console.log('[TubeScout] Extension installed — Free plan initialized');
  }

  if (details.reason === 'update') {
    console.log('[TubeScout] Extension updated to', chrome.runtime.getManifest().version);
  }

  // 설치/업데이트 모두: 주기적 인증 검증 알람 등록
  await setupAlarms();
});

// ============================================================
//  2. 알람 (주기적 작업)
// ============================================================

/**
 * chrome.alarms 등록
 * Service Worker가 종료되더라도 알람은 Chrome이 관리하므로 안정적
 */
async function setupAlarms() {
  // 기존 알람 초기화 후 재등록
  await chrome.alarms.clear(ALARM_AUTH_CHECK);

  chrome.alarms.create(ALARM_AUTH_CHECK, {
    delayInMinutes: 1,                               // 설치 후 1분 뒤 첫 실행
    periodInMinutes: AUTH_CHECK_INTERVAL_MINUTES,     // 이후 1시간 간격
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_AUTH_CHECK) {
    await performAuthCheck();
  }
});

/**
 * 라이선스 재검증 + 크레딧 동기화
 * 구독 만료 감지의 핵심 로직
 */
async function performAuthCheck() {
  try {
    const authState = await auth.validate(true); // 강제 갱신

    if (!authState) {
      // 미인증 (Free 사용자)
      updateBadge('', '');
      return;
    }

    if (!authState.valid || authState.licenseStatus !== 'active') {
      // 구독 만료/해지 → 배지로 알림
      updateBadge('!', '#E53E3E');
      return;
    }

    // 인증 유효 → 크레딧도 갱신
    await credits.fetchCredits();

    const remaining = await credits.getRemaining();
    if (remaining <= 0) {
      updateBadge('0', '#E53E3E');
    } else {
      updateBadge('', '');
    }
  } catch (err) {
    console.warn('[TubeScout] Auth check failed:', err.message);
    // 네트워크 에러 시 무시 (다음 알람에서 재시도)
  }
}

// ============================================================
//  3. 메시지 라우팅
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 모든 메시지를 async handler로 위임
  handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({
      success: false,
      error: err.message,
      code: err.code || 'UNKNOWN',
    }));

  return true; // 비동기 sendResponse를 위해 필수
});

/**
 * 메시지 타입별 분기 처리
 * @param {Object} message - { type, payload }
 * @param {Object} sender  - 발신자 정보
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  switch (message.type) {

    // ── content script → background ──

    case 'VIDEO_DATA_EXTRACTED':
      // content script가 추출한 비디오 데이터 수신
      // storage에 이미 저장됨 (content/index.js에서 처리)
      // 여기서는 추가 로직 필요 시 확장
      return { success: true };

    // ── popup → background ──

    case 'ACTIVATE_LICENSE':
      return await handleActivateLicense(message.payload);

    case 'VALIDATE_LICENSE':
      return await handleValidateLicense(message.payload);

    case 'LOGOUT':
      return await handleLogout();

    case 'GET_AUTH_STATE':
      return await handleGetAuthState();

    case 'GET_CREDITS':
      return await handleGetCredits(message.payload);

    // ── popup → background → 서버 (AI 기능) ──

    case 'ANALYZE_TITLE':
      return await handleAiRequest('ANALYZE_TITLE', message.payload);

    case 'ANALYZE_CHANNEL':
      return await handleAiRequest('ANALYZE_CHANNEL', message.payload);

    case 'SUGGEST_TAGS':
      return await handleAiRequest('SUGGEST_TAGS', message.payload);

    // ── content script에서 데이터 요청 ──

    case 'GET_VIDEO_DATA':
      // popup이 content script에 직접 요청할 수도 있지만,
      // background를 경유하면 탭이 닫혀있어도 캐시에서 제공 가능
      const videoData = await storage.get(STORAGE_KEYS.CURRENT_VIDEO);
      return { success: true, data: videoData };

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ============================================================
//  4. 메시지 핸들러 구현
// ============================================================

/** 라이선스 활성화 */
async function handleActivateLicense({ licenseKey }) {
  const authState = await auth.activate(licenseKey);
  updateBadge('', '');
  return { success: true, data: authState };
}

/** 라이선스 재검증 */
async function handleValidateLicense({ forceRefresh = false }) {
  const authState = await auth.validate(forceRefresh);
  return { success: true, data: authState };
}

/** 로그아웃 */
async function handleLogout() {
  await auth.logout();
  updateBadge('', '');
  return { success: true };
}

/** 인증 상태 조회 (캐시) */
async function handleGetAuthState() {
  const authState = await auth.getAuthState();
  return { success: true, data: authState };
}

/** 크레딧 조회 */
async function handleGetCredits({ forceRefresh = false }) {
  if (forceRefresh) {
    const data = await credits.fetchCredits();
    return { success: true, data };
  }

  const remaining = await credits.getRemaining();
  const total = await credits.getMonthlyTotal();
  const resetAt = await credits.getResetDate();
  const plan = await auth.getCurrentPlan();

  return {
    success: true,
    data: { remaining, total, resetAt, plan },
  };
}

/**
 * AI 기능 공통 핸들러
 *
 * 1. 인증 확인
 * 2. 크레딧 사전 확인
 * 3. 서버 API 호출
 * 4. 크레딧 로컬 캐시 동기화
 *
 * @param {'ANALYZE_TITLE'|'ANALYZE_CHANNEL'|'SUGGEST_TAGS'} action
 * @param {Object} payload - 서버에 전송할 데이터
 * @returns {Promise<Object>}
 */
async function handleAiRequest(action, payload) {
  // 1. 인증 확인
  const authenticated = await auth.isAuthenticated();
  const plan = await auth.getCurrentPlan();

  // Free 사용자도 AI 기능 사용 가능 (크레딧 범위 내)
  // 단, 라이선스 키가 있는데 만료된 경우는 차단
  const authCache = await auth.getAuthState();
  if (authCache?.licenseKey && !authenticated && authCache?.licenseStatus !== 'active') {
    return {
      success: false,
      error: 'Your subscription has expired. Please renew to continue.',
      code: 'LICENSE_EXPIRED',
    };
  }

  // 2. 크레딧 사전 확인 (서버에서 최종 판단하지만, 불필요한 요청 방지)
  const hasCredits = await credits.hasEnoughCredits(action);
  if (!hasCredits) {
    const cost = credits.getCost(action);
    const remaining = await credits.getRemaining();
    return {
      success: false,
      error: `Not enough credits. Need ${cost}, have ${remaining}.`,
      code: 'INSUFFICIENT_CREDITS',
      data: { cost, remaining },
    };
  }

  // 3. 서버 API 호출
  const apiMap = {
    ANALYZE_TITLE: api.analyzeTitle,
    ANALYZE_CHANNEL: api.analyzeChannel,
    SUGGEST_TAGS: api.suggestTags,
  };

  const apiFn = apiMap[action];
  const response = await apiFn(payload);

  // 4. 크레딧 로컬 캐시 동기화
  if (response.credits_remaining != null) {
    await credits.syncAfterUsage(response.credits_remaining);
  }

  return { success: true, data: response };
}

// ============================================================
//  5. 배지 업데이트 (확장 아이콘)
// ============================================================

/**
 * 확장 아이콘에 배지 텍스트/색상 표시
 * - 크레딧 0: 빨간 배지 "0"
 * - 인증 에러: 빨간 배지 "!"
 * - 정상: 배지 없음
 *
 * @param {string} text  - 배지 텍스트 ('' = 제거)
 * @param {string} color - 배경색 hex
 */
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

// ============================================================
//  6. Service Worker 시작 시 초기화
// ============================================================

// Service Worker가 재시작될 때마다 알람이 살아있는지 확인
(async () => {
  const existingAlarm = await chrome.alarms.get(ALARM_AUTH_CHECK);
  if (!existingAlarm) {
    await setupAlarms();
  }
})();
