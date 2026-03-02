// YouTube 페이지에 TubeScout UI 요소 삽입
// ============================================================
// TubeScout — YouTube 페이지 내 UI 삽입
//
// 역할:
// - YouTube 영상 페이지에 TubeScout 위젯을 DOM에 삽입
// - 제목 옆 점수 배지, 태그 영역 AI 버튼 등
// - content/index.js에서 추출한 데이터 + 서버 응답을 시각화
//
// 구현 시점: 서버 AI 엔드포인트 완성 후
// 현재: 삽입 지점 탐색 + 컨테이너 생성 뼈대만 작성
// ============================================================

'use strict';

/** TubeScout 위젯이 이미 삽입되었는지 중복 방지 플래그 */
const WIDGET_ID = 'tubescout-widget-root';

/**
 * YouTube 페이지에 TubeScout 위젯 컨테이너 삽입
 * 삽입 위치: 영상 제목 아래, 채널 정보 위
 *
 * @returns {HTMLElement|null} 삽입된 컨테이너 요소
 */
export function injectWidgetContainer() {
  // 중복 삽입 방지
  if (document.getElementById(WIDGET_ID)) {
    return document.getElementById(WIDGET_ID);
  }

  // 삽입 지점 탐색 (YouTube 레이아웃별 폴백)
  const anchor =
    document.querySelector('#above-the-fold #title') ||           // 현재 레이아웃
    document.querySelector('ytd-watch-metadata #title') ||        // 대체
    document.querySelector('ytd-video-primary-info-renderer');     // 레거시

  if (!anchor) return null;

  // 컨테이너 생성
  const container = document.createElement('div');
  container.id = WIDGET_ID;
  container.className = 'tubescout-widget';

  // anchor 바로 뒤에 삽입
  anchor.parentNode.insertBefore(container, anchor.nextSibling);

  return container;
}

/**
 * 위젯 컨테이너 제거 (페이지 이동 시)
 */
export function removeWidget() {
  const existing = document.getElementById(WIDGET_ID);
  if (existing) {
    existing.remove();
  }
}

/**
 * 제목 점수 배지 렌더링
 * TODO: 서버 완성 후 구현
 *
 * @param {HTMLElement} container
 * @param {{ score: number, suggestions: string[] }} data
 */
export function renderTitleScore(container, data) {
  // 서버 응답 구조:
  // {
  //   score: 75,
  //   suggestions: ["...", "...", "..."],
  //   reasoning: "..."
  // }
  // → 구현 예정
}

/**
 * AI 태그 추천 영역 렌더링
 * TODO: 서버 완성 후 구현
 *
 * @param {HTMLElement} container
 * @param {{ existing_tags: string[], suggested_tags: string[] }} data
 */
export function renderTagSuggestions(container, data) {
  // → 구현 예정
}

/**
 * 경쟁자 분석 요약 렌더링
 * TODO: 서버 완성 후 구현
 *
 * @param {HTMLElement} container
 * @param {{ channel_name: string, summary: string, insights: string[] }} data
 */
export function renderChannelAnalysis(container, data) {
  // → 구현 예정
}
