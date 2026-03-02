// 크레딧 잔량 조회/차감 표시
// ============================================================
// TubeScout — 크레딧 관리 모듈
//
// 크레딧 흐름:
// 1. AI 기능 호출 전 → hasEnoughCredits() 로 사전 확인
// 2. 서버가 실제 차감 (클라이언트는 차감하지 않음)
// 3. 서버 응답의 credits_remaining으로 로컬 캐시 동기화
// 4. 주기적으로 서버에서 최신 잔량 fetch
//
// 핵심 원칙: 크레딧 차감 권한은 서버에만 있음.
// 클라이언트는 "표시"와 "사전 차단"만 담당.
// ============================================================

'use strict';

import * as api from '@lib/api';
import {
  CREDIT_COSTS,
  PLANS,
  STORAGE_KEYS,
} from '@lib/constants';
import * as storage from '@lib/storage';

/**
 * 서버에서 최신 크레딧 정보 조회 + 로컬 캐시 동기화
 * @returns {Promise<Object>} { remaining, total, resetAt, plan }
 */
export async function fetchCredits() {
  const response = await api.checkCredits();

  const credits = {
    remaining: response.credits_remaining,
    total: response.credits_total,
    resetAt: response.credits_reset_at,
    plan: response.plan,
  };

  // 로컬 캐시 동기화
  await storage.setMultiple({
    [STORAGE_KEYS.CREDITS_REMAINING]: credits.remaining,
    [STORAGE_KEYS.CREDITS_RESET_AT]: credits.resetAt,
  });

  return credits;
}

/**
 * 로컬 캐시에서 크레딧 잔량 조회 (서버 호출 없음, 즉시 반환)
 * UI에서 빠르게 표시할 때 사용
 * @returns {Promise<number>}
 */
export async function getRemaining() {
  const remaining = await storage.get(STORAGE_KEYS.CREDITS_REMAINING, 0);
  return remaining;
}

/**
 * 특정 기능을 실행할 크레딧이 충분한지 사전 확인
 *
 * @param {'ANALYZE_TITLE'|'ANALYZE_CHANNEL'|'SUGGEST_TAGS'} action
 * @returns {Promise<boolean>}
 */
export async function hasEnoughCredits(action) {
  const cost = CREDIT_COSTS[action];
  if (cost == null) return false;

  const remaining = await getRemaining();
  return remaining >= cost;
}

/**
 * 특정 기능의 크레딧 비용 조회
 * @param {'ANALYZE_TITLE'|'ANALYZE_CHANNEL'|'SUGGEST_TAGS'} action
 * @returns {number}
 */
export function getCost(action) {
  return CREDIT_COSTS[action] || 0;
}

/**
 * 서버 AI 응답 후 로컬 크레딧 캐시 갱신
 * 모든 AI API 호출 후 이 함수를 호출해서 동기화
 *
 * @param {number} newRemaining - 서버 응답의 credits_remaining
 */
export async function syncAfterUsage(newRemaining) {
  if (typeof newRemaining === 'number' && newRemaining >= 0) {
    await storage.set(STORAGE_KEYS.CREDITS_REMAINING, newRemaining);
  }
}

/**
 * 크레딧 리셋 일시 조회
 * @returns {Promise<string|null>} ISO 날짜 문자열
 */
export async function getResetDate() {
  return storage.get(STORAGE_KEYS.CREDITS_RESET_AT, null);
}

/**
 * 현재 요금제의 월간 총 크레딧
 * @returns {Promise<number>}
 */
export async function getMonthlyTotal() {
  const plan = await storage.get(STORAGE_KEYS.USER_PLAN, 'free');
  const planKey = plan.toUpperCase();
  return PLANS[planKey]?.monthlyCredits || PLANS.FREE.monthlyCredits;
}

/**
 * 크레딧 사용률 (%) — 프로그레스 바 표시용
 * @returns {Promise<number>} 0~100
 */
export async function getUsagePercent() {
  const remaining = await getRemaining();
  const total = await getMonthlyTotal();
  if (total === 0) return 100;

  const used = total - remaining;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}
