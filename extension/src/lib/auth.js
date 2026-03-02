// 라이선스 키 저장/검증/갱신 로직
// ============================================================
// TubeScout — 인증(라이선스) 관리 모듈
//
// 흐름:
// 1. 사용자가 popup에서 라이선스 키 입력
// 2. activate() → 서버 → Lemon Squeezy activate → 결과 저장
// 3. 이후 API 호출 시마다 캐시된 인증 정보 사용
// 4. 주기적으로 validate() → 구독 만료/해지 감지
// ============================================================

'use strict';

import * as api from '@lib/api';
import {
  AUTH_CACHE_TTL_MS,
  PLANS,
  STORAGE_KEYS,
} from '@lib/constants';
import * as storage from '@lib/storage';

// ── 인증 상태 객체 형태 ──
// storage에 저장되는 AUTH_CACHE의 구조:
// {
//   valid:             boolean,
//   plan:              'free' | 'pro' | 'ultra',
//   licenseKey:        string,
//   instanceId:        string,
//   customerEmail:     string,
//   customerName:      string,
//   licenseStatus:     'active' | 'expired' | 'disabled',
//   creditsRemaining:  number,
//   creditsTotal:      number,
//   creditsResetAt:    string (ISO),
//   cachedAt:          number (Date.now()),
// }

/**
 * 라이선스 키 활성화 (최초 등록)
 * popup의 "Activate" 버튼에서 호출
 *
 * @param {string} licenseKey - 사용자가 입력한 라이선스 키
 * @returns {Promise<Object>} 인증 상태 객체
 * @throws {import('@lib/api').ApiError}
 */
export async function activate(licenseKey) {
  // 서버에 라이선스 키 전송 → 서버가 Lemon Squeezy activate 호출
  const response = await api.verifyLicense(licenseKey);

  if (!response.valid) {
    // 서버가 valid: false를 반환한 경우 (키 무효, 만료 등)
    await clearAuth();
    throw new api.ApiError(
      response.message || 'Invalid license key',
      400,
      'INVALID_LICENSE',
    );
  }

  const authState = {
    valid: true,
    plan: response.plan,
    licenseKey: licenseKey,
    instanceId: response.instance_id,
    customerEmail: response.customer_email,
    customerName: response.customer_name,
    licenseStatus: response.license_status,
    creditsRemaining: response.credits_remaining,
    creditsTotal: response.credits_total,
    creditsResetAt: response.credits_reset_at,
    cachedAt: Date.now(),
  };

  // 스토리지에 저장
  await storage.setMultiple({
    [STORAGE_KEYS.LICENSE_KEY]: licenseKey,
    [STORAGE_KEYS.USER_PLAN]: response.plan,
    [STORAGE_KEYS.CREDITS_REMAINING]: response.credits_remaining,
    [STORAGE_KEYS.CREDITS_RESET_AT]: response.credits_reset_at,
    [STORAGE_KEYS.AUTH_CACHE]: authState,
  });

  return authState;
}

/**
 * 라이선스 유효성 재검증 (주기적 호출)
 * background의 알람 또는 popup 열릴 때 호출
 *
 * - 캐시가 아직 유효하면 서버 호출 없이 캐시 반환
 * - 캐시 만료 시 서버에 재검증 요청
 *
 * @param {boolean} forceRefresh - true면 캐시 무시하고 서버 호출
 * @returns {Promise<Object|null>} 인증 상태 객체, 미인증이면 null
 */
export async function validate(forceRefresh = false) {
  const cached = await storage.get(STORAGE_KEYS.AUTH_CACHE);

  // 캐시가 있고, 아직 유효하고, 강제 갱신이 아닌 경우
  if (cached && !forceRefresh) {
    const age = Date.now() - (cached.cachedAt || 0);
    if (age < AUTH_CACHE_TTL_MS) {
      return cached;
    }
  }

  // 라이선스 키가 없으면 미인증
  const licenseKey = await storage.get(STORAGE_KEYS.LICENSE_KEY);
  if (!licenseKey) {
    return null;
  }

  // 서버에 재검증 요청
  try {
    const response = await api.verifyLicense(licenseKey);

    if (!response.valid) {
      // 구독 만료/해지됨
      await handleExpired(response);
      return await storage.get(STORAGE_KEYS.AUTH_CACHE);
    }

    // 인증 성공 → 캐시 갱신
    const authState = {
      valid: true,
      plan: response.plan,
      licenseKey: licenseKey,
      instanceId: response.instance_id,
      customerEmail: response.customer_email,
      customerName: response.customer_name,
      licenseStatus: response.license_status,
      creditsRemaining: response.credits_remaining,
      creditsTotal: response.credits_total,
      creditsResetAt: response.credits_reset_at,
      cachedAt: Date.now(),
    };

    await storage.setMultiple({
      [STORAGE_KEYS.USER_PLAN]: response.plan,
      [STORAGE_KEYS.CREDITS_REMAINING]: response.credits_remaining,
      [STORAGE_KEYS.CREDITS_RESET_AT]: response.credits_reset_at,
      [STORAGE_KEYS.AUTH_CACHE]: authState,
    });

    return authState;
  } catch (err) {
    // 네트워크 에러 시 → 캐시가 있으면 그대로 사용 (오프라인 허용)
    if (err.isNetworkError && cached) {
      return cached;
    }
    throw err;
  }
}

/**
 * 현재 인증 상태 조회 (서버 호출 없이 캐시만)
 * UI가 빠르게 상태를 표시할 때 사용
 *
 * @returns {Promise<Object|null>}
 */
export async function getAuthState() {
  return storage.get(STORAGE_KEYS.AUTH_CACHE);
}

/**
 * 현재 요금제 조회
 * @returns {Promise<string>} 'free' | 'pro' | 'ultra'
 */
export async function getCurrentPlan() {
  const plan = await storage.get(STORAGE_KEYS.USER_PLAN, 'free');
  return plan;
}

/**
 * 인증 여부 확인 (라이선스 키 존재 + 유효)
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const cached = await storage.get(STORAGE_KEYS.AUTH_CACHE);
  return cached?.valid === true && cached?.licenseStatus === 'active';
}

/**
 * 로그아웃 (라이선스 키 제거 + 캐시 초기화)
 * @returns {Promise<void>}
 */
export async function logout() {
  await clearAuth();
}

// ── 내부 헬퍼 ──

/**
 * 구독 만료/해지 시 처리
 * - plan을 'free'로 다운그레이드
 * - 크레딧을 Free 한도로 제한
 */
async function handleExpired(response) {
  const authState = {
    valid: false,
    plan: 'free',
    licenseKey: await storage.get(STORAGE_KEYS.LICENSE_KEY),
    instanceId: null,
    customerEmail: response.customer_email || '',
    customerName: response.customer_name || '',
    licenseStatus: response.license_status || 'expired',
    creditsRemaining: Math.min(
      response.credits_remaining || 0,
      PLANS.FREE.monthlyCredits,
    ),
    creditsTotal: PLANS.FREE.monthlyCredits,
    creditsResetAt: response.credits_reset_at || '',
    cachedAt: Date.now(),
  };

  await storage.setMultiple({
    [STORAGE_KEYS.USER_PLAN]: 'free',
    [STORAGE_KEYS.CREDITS_REMAINING]: authState.creditsRemaining,
    [STORAGE_KEYS.AUTH_CACHE]: authState,
  });
}

/**
 * 인증 데이터 전체 삭제
 */
async function clearAuth() {
  await storage.removeMultiple([
    STORAGE_KEYS.LICENSE_KEY,
    STORAGE_KEYS.USER_PLAN,
    STORAGE_KEYS.CREDITS_REMAINING,
    STORAGE_KEYS.CREDITS_RESET_AT,
    STORAGE_KEYS.AUTH_CACHE,
  ]);
}
