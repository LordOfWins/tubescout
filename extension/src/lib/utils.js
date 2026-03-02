// ============================================================
// TubeScout — 공통 유틸리티
// 비즈니스 로직 없는 순수 헬퍼 함수
// ============================================================

'use strict';

/**
 * 디바운스
 * 연속 호출 시 마지막 호출만 실행 (검색 입력 등)
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {Function}
 */
export function debounce(fn, delayMs) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

/**
 * 숫자 포맷 (조회수 등)
 * 1234 → "1,234"
 * 1234567 → "1.2M"
 * @param {number} num
 * @param {boolean} compact - true면 K/M/B 축약
 * @returns {string}
 */
export function formatNumber(num, compact = false) {
  if (num == null || isNaN(num)) return '0';

  if (!compact) {
    return num.toLocaleString('en-US');
  }

  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}

/**
 * 상대 시간 표시
 * ISO 날짜 → "3 days ago", "2 months ago" 등
 * @param {string} isoDateStr
 * @returns {string}
 */
export function timeAgo(isoDateStr) {
  const now = Date.now();
  const then = new Date(isoDateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * 초 → "12:34" 또는 "1:02:34" 형식
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * 문자열 자르기 + 말줄임
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(str, maxLen = 60) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * 안전한 JSON 파싱 (실패 시 null)
 * @param {string} jsonStr
 * @returns {*|null}
 */
export function safeJsonParse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * sleep (테스트/재시도 대기용)
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
Copy
