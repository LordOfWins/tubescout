// ============================================================
// TubeScout — chrome.storage 헬퍼
// chrome.storage.local의 Promise 래퍼 + 타입 안전성
// ============================================================

'use strict';

/**
 * 단일 키 읽기
 * @param {string} key
 * @param {*} defaultValue - 키가 없을 때 반환할 기본값
 * @returns {Promise<*>}
 */
export async function get(key, defaultValue = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : defaultValue;
}

/**
 * 복수 키 읽기
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
export async function getMultiple(keys) {
  return chrome.storage.local.get(keys);
}

/**
 * 단일 키-값 저장
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function set(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

/**
 * 객체 일괄 저장
 * @param {Object} items - { key1: value1, key2: value2 }
 * @returns {Promise<void>}
 */
export async function setMultiple(items) {
  return chrome.storage.local.set(items);
}

/**
 * 단일 키 삭제
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function remove(key) {
  return chrome.storage.local.remove(key);
}

/**
 * 복수 키 삭제
 * @param {string[]} keys
 * @returns {Promise<void>}
 */
export async function removeMultiple(keys) {
  return chrome.storage.local.remove(keys);
}

/**
 * TubeScout 관련 데이터 전체 초기화 (로그아웃 시)
 * chrome.storage.local.clear()는 다른 확장의 데이터까지 건드릴 수 있으므로
 * TubeScout 키만 선별 삭제
 * @param {string[]} allKeys - STORAGE_KEYS 값 배열
 * @returns {Promise<void>}
 */
export async function clearAll(allKeys) {
  return chrome.storage.local.remove(allKeys);
}
