// ============================================================
// TubeScout Content Script
// YouTube 페이지에서 비디오 메타데이터를 추출하는 핵심 모듈
// ============================================================

'use strict';
// content/index.js 상단에 추가
import { injectWidgetContainer, removeWidget } from './injector';
import './styles.css';
/**
 * ── 상수 ──
 */
const WATCH_URL_PATTERN = /youtube\.com\/watch/;
const VIDEO_ID_REGEX = /[?&]v=([a-zA-Z0-9_-]{11})/;
const MAX_RETRY = 10;
const RETRY_INTERVAL_MS = 600;

/**
 * ── 유틸리티 ──
 */

/** URL에서 videoId 추출 */
function getVideoIdFromUrl(url = location.href) {
  const match = url.match(VIDEO_ID_REGEX);
  return match ? match[1] : null;
}

/** 현재 페이지가 watch 페이지인지 확인 */
function isWatchPage(url = location.href) {
  return WATCH_URL_PATTERN.test(url);
}

/**
 * DOM 요소가 나타날 때까지 폴링 방식으로 대기
 * @param {string} selector - CSS 셀렉터
 * @param {number} maxRetries - 최대 재시도 횟수
 * @param {number} interval - 재시도 간격 (ms)
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, maxRetries = MAX_RETRY, interval = RETRY_INTERVAL_MS) {
  return new Promise((resolve) => {
    let attempts = 0;

    const check = () => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      attempts++;
      if (attempts >= maxRetries) {
        resolve(null);
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

// ============================================================
//  데이터 추출 함수들
// ============================================================

/**
 * 비디오 제목 추출
 * - 1순위: DOM → ytd-watch-metadata 내 h1 > yt-formatted-string
 * - 2순위: DOM → ytd-video-primary-info-renderer 내 h1 (레거시)
 * - 3순위: meta[property="og:title"]
 * - 4순위: document.title 파싱
 *
 * @returns {string}
 */
function extractTitle() {
  // 1순위: 현재 YouTube 레이아웃 (2024~)
  const modern = document.querySelector(
    'h1.ytd-watch-metadata yt-formatted-string'
  );
  if (modern?.textContent?.trim()) {
    return modern.textContent.trim();
  }

  // 2순위: 레거시 레이아웃
  const legacy = document.querySelector(
    'h1.title.style-scope.ytd-video-primary-info-renderer'
  );
  if (legacy?.textContent?.trim()) {
    return legacy.textContent.trim();
  }

  // 3순위: OG 메타 태그
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle?.content) {
    return ogTitle.content;
  }

  // 4순위: <title> 태그에서 " - YouTube" 제거
  const docTitle = document.title;
  if (docTitle && docTitle.includes(' - YouTube')) {
    return docTitle.replace(' - YouTube', '').trim();
  }

  return '';
}

/**
 * 비디오 태그(키워드) 추출
 * YouTube 태그는 업로더가 설정한 메타 키워드로, 3가지 소스에서 추출 가능
 *
 * - 1순위: ytInitialPlayerResponse.videoDetails.keywords (가장 정확)
 * - 2순위: meta[name="keywords"] (HTML head)
 * - 3순위: meta[itemprop="keywords"]  (Schema.org)
 *
 * @returns {string[]}
 */
function extractTags() {
  // ── 1순위: ytInitialPlayerResponse에서 추출 ──
  // YouTube가 페이지 렌더링 시 inline script에 삽입하는 JSON 객체
  try {
    const playerResponse = window.ytInitialPlayerResponse;
    if (playerResponse?.videoDetails?.keywords) {
      const keywords = playerResponse.videoDetails.keywords;
      if (Array.isArray(keywords) && keywords.length > 0) {
        return keywords.map((k) => String(k).trim()).filter(Boolean);
      }
    }
  } catch (e) {
    // content script에서 window 전역 변수 접근이 제한될 수 있음 → 폴백
  }

  // ── 1-b순위: 페이지 소스에서 직접 파싱 (content script isolation 우회) ──
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent;
      if (text && text.includes('ytInitialPlayerResponse')) {
        // "keywords":["tag1","tag2",...] 패턴 매칭
        const keywordsMatch = text.match(/"keywords"\s*:\s*(\[[^\]]*\])/);
        if (keywordsMatch) {
          const parsed = JSON.parse(keywordsMatch[1]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((k) => String(k).trim()).filter(Boolean);
          }
        }
      }
    }
  } catch (e) {
    // 파싱 실패 → 다음 폴백
  }

  // ── 2순위: <meta name="keywords"> ──
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords?.content) {
    const tags = metaKeywords.content.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      return tags;
    }
  }

  // ── 3순위: <meta itemprop="keywords"> ──
  const schemaTags = document.querySelector('meta[itemprop="keywords"]');
  if (schemaTags?.content) {
    const tags = schemaTags.content.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      return tags;
    }
  }

  return [];
}

/**
 * 채널 정보 추출
 * @returns {{ name: string, url: string, handle: string }}
 */
function extractChannel() {
  const result = { name: '', url: '', handle: '' };

  // 채널명
  const channelEl = document.querySelector('ytd-channel-name a');
  if (channelEl) {
    result.name = channelEl.textContent?.trim() || '';
    result.url = channelEl.href || '';
  }

  // @handle
  const handleEl = document.querySelector(
    '#owner #channel-name a, ytd-video-owner-renderer a[href*="/@"]'
  );
  if (handleEl?.href) {
    const handleMatch = handleEl.href.match(/@[\w.-]+/);
    if (handleMatch) {
      result.handle = handleMatch[0];
    }
  }

  return result;
}

/**
 * 조회수 추출
 * @returns {number}
 */
function extractViewCount() {
  // 방법 1: info-text (현재 레이아웃)
  const infoText = document.querySelector(
    '#info-container yt-formatted-string, ' +
    'ytd-watch-metadata #info span'
  );
  if (infoText?.textContent) {
    const num = parseViewString(infoText.textContent);
    if (num > 0) return num;
  }

  // 방법 2: meta itemprop="interactionCount"
  const metaViews = document.querySelector('meta[itemprop="interactionCount"]');
  if (metaViews?.content) {
    const parsed = parseInt(metaViews.content, 10);
    if (!isNaN(parsed)) return parsed;
  }

  return 0;
}

/**
 * 조회수 문자열 → 숫자 변환
 * "1,234,567 views" → 1234567
 * "1.2M views" → 1200000
 * @param {string} text
 * @returns {number}
 */
function parseViewString(text) {
  if (!text) return 0;

  const clean = text.replace(/[^\d.,KMB]/gi, '').trim();
  const match = clean.match(/([\d,.]+)\s*([KMB])?/i);
  if (!match) return 0;

  const numPart = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(numPart)) return 0;

  const suffix = (match[2] || '').toUpperCase();
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };

  return Math.floor(numPart * (multiplier[suffix] || 1));
}

/**
 * 비디오 설명 추출
 * @returns {string}
 */
function extractDescription() {
  // OG description (요약 버전이지만 항상 존재)
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc?.content) {
    return ogDesc.content;
  }

  // DOM에서 전체 설명 (펼치기 전)
  const descEl = document.querySelector(
    'ytd-text-inline-expander #plain-snippet-text, ' +
    'ytd-expander #description-inline-expander, ' +
    '#description-text'
  );
  if (descEl?.textContent?.trim()) {
    return descEl.textContent.trim();
  }

  return '';
}

/**
 * 게시일 추출
 * @returns {string}
 */
function extractPublishDate() {
  // meta datePublished
  const metaDate = document.querySelector('meta[itemprop="datePublished"]');
  if (metaDate?.content) {
    return metaDate.content;
  }

  // info-strings 내부
  const dateEl = document.querySelector(
    '#info-strings yt-formatted-string'
  );
  if (dateEl?.textContent?.trim()) {
    return dateEl.textContent.trim();
  }

  return '';
}

/**
 * 비디오 길이(초) 추출
 * @returns {number}
 */
function extractDuration() {
  const metaDur = document.querySelector('meta[itemprop="duration"]');
  if (metaDur?.content) {
    // ISO 8601 duration: PT12M34S
    const match = metaDur.content.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const h = parseInt(match[1] || '0', 10);
      const m = parseInt(match[2] || '0', 10);
      const s = parseInt(match[3] || '0', 10);
      return h * 3600 + m * 60 + s;
    }
  }
  return 0;
}

/**
 * 썸네일 URL 추출
 * @returns {string}
 */
function extractThumbnail() {
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage?.content) {
    return ogImage.content;
  }

  const linkThumb = document.querySelector('link[itemprop="thumbnailUrl"]');
  if (linkThumb?.href) {
    return linkThumb.href;
  }

  return '';
}

// ============================================================
//  메인: 전체 메타데이터를 하나의 객체로 수집
// ============================================================

/**
 * 현재 YouTube watch 페이지의 모든 추출 가능한 메타데이터를 수집
 * @returns {Promise<Object|null>}  watch 페이지가 아니면 null
 */
async function collectVideoData() {
  if (!isWatchPage()) {
    return null;
  }

  const videoId = getVideoIdFromUrl();
  if (!videoId) {
    return null;
  }

  // 제목 요소가 로드될 때까지 대기 (YouTube SPA 전환 후 DOM이 아직 안 그려질 수 있음)
  await waitForElement(
    'h1.ytd-watch-metadata yt-formatted-string, ' +
    'h1.title.style-scope.ytd-video-primary-info-renderer'
  );

  return {
    videoId,
    url: location.href,
    title: extractTitle(),
    tags: extractTags(),
    channel: extractChannel(),
    viewCount: extractViewCount(),
    description: extractDescription(),
    publishDate: extractPublishDate(),
    duration: extractDuration(),
    thumbnail: extractThumbnail(),
    extractedAt: new Date().toISOString(),
  };
}
const data = await collectVideoData();
if (!data) return;

// 위젯 컨테이너 삽입 (아직 빈 컨테이너)
injectWidgetContainer();  // ← 추가
// ============================================================
//  YouTube SPA 네비게이션 감지
// ============================================================

/** 마지막으로 처리한 videoId (중복 방지) */
let lastProcessedVideoId = null;

/**
 * 페이지 변경 시 호출되는 핸들러
 * - watch 페이지이면 데이터 수집 → background script로 전송
 */
async function onPageChanged() {
  if (!isWatchPage()) {
    lastProcessedVideoId = null;
    removeWidget();  // ← 추가: watch 페이지 아니면 위젯 제거
    return;
  }

  const videoId = getVideoIdFromUrl();
  if (!videoId || videoId === lastProcessedVideoId) {
    return; // 같은 영상이면 스킵
  }

  lastProcessedVideoId = videoId;

  const data = await collectVideoData();
  if (!data) return;

  // chrome.storage.local에 현재 비디오 데이터 캐시
  try {
    await chrome.storage.local.set({
      currentVideo: data,
    });
  } catch (e) {
    console.error('[TubeScout] Failed to cache video data:', e);
  }

  // Background script에 데이터 전송 (popup/sidebar에서 쓸 수 있도록)
  try {
    await chrome.runtime.sendMessage({
      type: 'VIDEO_DATA_EXTRACTED',
      payload: data,
    });
  } catch (e) {
    // popup이 닫혀있으면 에러 발생 → 무시
    // "Could not establish connection. Receiving end does not exist."
  }

  console.log('[TubeScout] Video data extracted:', data.title);
}

// ============================================================
//  이벤트 바인딩
// ============================================================

/**
 * YouTube는 SPA이므로 전통적인 페이지 로드 이벤트가 발생하지 않음.
 * 대신 YouTube 자체 커스텀 이벤트 `yt-navigate-finish`를 사용.
 * 최초 로드 시에는 이 이벤트가 이미 발생했을 수 있으므로 즉시 1회 실행.
 */

// 1) YouTube SPA 네비게이션 완료 이벤트
document.addEventListener('yt-navigate-finish', () => {
  // 약간의 딜레이 — DOM이 완전히 업데이트된 후 추출
  setTimeout(onPageChanged, 800);
});

// 2) 최초 content script 주입 시 (이미 watch 페이지에 있는 경우)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(onPageChanged, 1000);
  });
} else {
  // 이미 DOM 로드 완료
  setTimeout(onPageChanged, 1000);
}

// ============================================================
//  외부 메시지 수신 (popup/sidebar에서 데이터 요청 시)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_VIDEO_DATA') {
    collectVideoData().then((data) => {
      sendResponse({ success: true, data });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 비동기 sendResponse를 위해 true 반환
  }

  if (message.type === 'GET_VIDEO_ID') {
    sendResponse({
      success: true,
      data: { videoId: getVideoIdFromUrl() },
    });
    return false;
  }
});

// ============================================================
//  Export (테스트용 — 프로덕션에서는 webpack이 처리)
// ============================================================
// 이 부분은 webpack 빌드 시 제거되거나 모듈로 변환됩니다.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getVideoIdFromUrl,
    isWatchPage,
    extractTitle,
    extractTags,
    extractChannel,
    extractViewCount,
    extractDescription,
    extractPublishDate,
    extractDuration,
    extractThumbnail,
    collectVideoData,
  };
}
