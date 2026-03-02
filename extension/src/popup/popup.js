// ============================================================
// TubeScout — Popup 로직
//
// popup은 "상태 표시 + 기능 트리거" 역할만 담당
// 모든 비즈니스 로직은 background에 메시지로 위임
//
// popup이 닫히면 상태가 소실되므로,
// 열릴 때마다 background에서 최신 상태를 fetch
// ============================================================

'use strict';

// ── DOM 참조 ──

const $ = (sel) => document.querySelector(sel);

const els = {
  // 뷰
  viewOnboarding: $('#view-onboarding'),
  viewDashboard: $('#view-dashboard'),

  // 온보딩
  licenseInput: $('#license-input'),
  btnActivate: $('#btn-activate'),
  btnSkip: $('#btn-skip'),
  licenseError: $('#license-error'),

  // 헤더
  creditsBadge: $('#credits-badge'),
  creditsCount: $('#credits-count'),

  // 비디오 카드
  videoCard: $('#video-card'),
  videoTitle: $('#video-title'),
  videoChannel: $('#video-channel'),
  videoViews: $('#video-views'),

  // 기능 버튼
  btnTitle: $('#btn-title'),
  btnTags: $('#btn-tags'),
  btnChannel: $('#btn-channel'),

  // 결과
  resultArea: $('#result-area'),
  resultLabel: $('#result-label'),
  resultContent: $('#result-content'),
  btnCloseResult: $('#btn-close-result'),

  // 로딩
  loadingOverlay: $('#loading-overlay'),

  // 푸터
  planLabel: $('#plan-label'),
  linkUpgrade: $('#link-upgrade'),
  linkSettings: $('#link-settings'),
};

// ── 유틸 ──

/** background에 메시지 전송 */
function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

/** 숫자 포맷 (1234 → "1.2K") */
function formatCompact(num) {
  if (num == null || isNaN(num)) return '';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}

// ── 뷰 전환 ──

function showView(viewName) {
  els.viewOnboarding.hidden = viewName !== 'onboarding';
  els.viewDashboard.hidden = viewName !== 'dashboard';
}

// ── 상태 업데이트 함수들 ──

/** 크레딧 배지 업데이트 */
function updateCredits(remaining) {
  els.creditsCount.textContent = remaining != null ? remaining : '--';

  // 색상 변경
  els.creditsBadge.className = 'ts-badge';
  if (remaining != null) {
    if (remaining <= 0) els.creditsBadge.classList.add('ts-badge--danger');
    else if (remaining <= 5) els.creditsBadge.classList.add('ts-badge--warning');
    else els.creditsBadge.classList.add('ts-badge--default');
  } else {
    els.creditsBadge.classList.add('ts-badge--default');
  }
}

/** 요금제 라벨 업데이트 */
function updatePlan(plan) {
  const label = (plan || 'free').charAt(0).toUpperCase() + (plan || 'free').slice(1);
  els.planLabel.textContent = label;
}

/** 비디오 카드 업데이트 */
function updateVideoCard(videoData) {
  if (!videoData) {
    els.videoTitle.textContent = 'Navigate to a YouTube video';
    els.videoChannel.textContent = '';
    els.videoViews.textContent = '';
    setActionButtons(false);
    return;
  }

  els.videoTitle.textContent = videoData.title || 'Untitled';
  els.videoChannel.textContent = videoData.channel?.name || '';
  els.videoViews.textContent = videoData.viewCount ? formatCompact(videoData.viewCount) + ' views' : '';
  setActionButtons(true);
}

/** 기능 버튼 활성화/비활성화 */
function setActionButtons(enabled) {
  els.btnTitle.disabled = !enabled;
  els.btnTags.disabled = !enabled;
  els.btnChannel.disabled = !enabled;
}

/** 로딩 표시 */
function showLoading(show) {
  els.loadingOverlay.hidden = !show;
}

/** 에러 메시지 표시 */
function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideError(el) {
  el.hidden = true;
  el.textContent = '';
}

// ── 결과 렌더링 ──

function showResult(label, html) {
  els.resultLabel.textContent = label;
  els.resultContent.innerHTML = html;
  els.resultArea.hidden = false;
}

function hideResult() {
  els.resultArea.hidden = true;
  els.resultContent.innerHTML = '';
}

/** 제목 분석 결과 렌더 */
function renderTitleResult(data) {
  const score = data.result?.score ?? 0;
  const scoreClass = score >= 70 ? 'score--high' : score >= 40 ? 'score--mid' : 'score--low';

  const suggestions = (data.result?.suggestions || [])
    .map((s) => `<div class="suggestion">${escapeHtml(s)}</div>`)
    .join('');

  const reasoning = data.result?.reasoning
    ? `<p style="margin-top:10px;font-size:11px;color:#6b7280;">${escapeHtml(data.result.reasoning)}</p>`
    : '';

  showResult('Title Score', `
    <div class="score ${scoreClass}">${score}<span style="font-size:14px;font-weight:400;">/100</span></div>
    ${suggestions}
    ${reasoning}
  `);
}

/** 태그 결과 렌더 */
function renderTagsResult(data) {
  const existing = (data.result?.existing_tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');

  const suggested = (data.result?.suggested_tags || [])
    .map((t) => `<span class="tag tag--ai">${escapeHtml(t)}</span>`)
    .join('');

  showResult('AI Tags', `
    ${existing ? `<p style="font-size:11px;font-weight:600;color:#8b95a5;margin-bottom:4px;">EXISTING TAGS</p><div class="tag-list">${existing}</div>` : ''}
    <p style="font-size:11px;font-weight:600;color:#6366f1;margin:8px 0 4px;">AI SUGGESTED</p>
    <div class="tag-list">${suggested || '<span style="color:#8b95a5;">No suggestions</span>'}</div>
  `);
}

/** 경쟁자 분석 결과 렌더 */
function renderChannelResult(data) {
  const r = data.result || {};
  showResult('Competitor Analysis', `
    <p><strong>${escapeHtml(r.channel_name || '')}</strong></p>
    <p style="margin:6px 0;font-size:12px;color:#6b7280;">${escapeHtml(r.summary || '')}</p>
    ${(r.insights || []).map((i) => `<div class="suggestion">${escapeHtml(i)}</div>`).join('')}
  `);
}

/** HTML 이스케이프 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 이벤트 핸들러 ──

/** 라이선스 활성화 */
async function onActivate() {
  const key = els.licenseInput.value.trim();
  if (!key) {
    showError(els.licenseError, 'Please enter a license key.');
    return;
  }

  hideError(els.licenseError);
  els.btnActivate.disabled = true;
  els.btnActivate.textContent = 'Activating...';

  try {
    const res = await sendMessage('ACTIVATE_LICENSE', { licenseKey: key });

    if (!res.success) {
      showError(els.licenseError, res.error || 'Activation failed.');
      return;
    }

    // 활성화 성공 → 대시보드로 전환
    updateCredits(res.data.creditsRemaining);
    updatePlan(res.data.plan);
    showView('dashboard');
  } catch (err) {
    showError(els.licenseError, 'Network error. Please try again.');
  } finally {
    els.btnActivate.disabled = false;
    els.btnActivate.textContent = 'Activate';
  }
}

/** Free로 건너뛰기 */
function onSkip() {
  showView('dashboard');
}

/** AI 기능 요청 공통 핸들러 */
async function onAiAction(messageType, renderFn, label) {
  hideResult();
  showLoading(true);

  try {
    const res = await sendMessage(messageType);

    if (!res.success) {
      showResult(label, `<p class="ts-error">${escapeHtml(res.error)}</p>`);
      return;
    }

    // 크레딧 동기화
    if (res.data?.credits_remaining != null) {
      updateCredits(res.data.credits_remaining);
    }

    renderFn(res.data);
  } catch (err) {
    showResult(label, `<p class="ts-error">Request failed. Please try again.</p>`);
  } finally {
    showLoading(false);
  }
}

/** 제목 분석 클릭 */
async function onTitleAnalysis() {
  // content script에서 캐시된 비디오 데이터 가져오기
  const videoRes = await sendMessage('GET_VIDEO_DATA');
  if (!videoRes.success || !videoRes.data) return;

  const payload = {
    title: videoRes.data.title,
    tags: videoRes.data.tags,
    channel: videoRes.data.channel?.name,
    view_count: videoRes.data.viewCount,
    description: videoRes.data.description,
  };

  await onAiAction('ANALYZE_TITLE', renderTitleResult, 'Title Score');
}

/** 태그 추천 클릭 */
async function onTagsSuggestion() {
  const videoRes = await sendMessage('GET_VIDEO_DATA');
  if (!videoRes.success || !videoRes.data) return;

  await onAiAction('SUGGEST_TAGS', renderTagsResult, 'AI Tags');
}

/** 경쟁자 분석 클릭 */
async function onChannelAnalysis() {
  const videoRes = await sendMessage('GET_VIDEO_DATA');
  if (!videoRes.success || !videoRes.data) return;

  await onAiAction('ANALYZE_CHANNEL', renderChannelResult, 'Competitor');
}

// ── 이벤트 바인딩 ──

els.btnActivate.addEventListener('click', onActivate);
els.licenseInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') onActivate();
});
els.btnSkip.addEventListener('click', onSkip);

els.btnTitle.addEventListener('click', onTitleAnalysis);
els.btnTags.addEventListener('click', onTagsSuggestion);
els.btnChannel.addEventListener('click', onChannelAnalysis);

els.btnCloseResult.addEventListener('click', hideResult);

els.linkUpgrade.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://tubescout.dev/pricing' });
});

els.linkSettings.addEventListener('click', async (e) => {
  e.preventDefault();
  // 추후 options 페이지 연결
  // 지금은 로그아웃 기능만
  if (confirm('Logout and clear license key?')) {
    await sendMessage('LOGOUT');
    updateCredits(20);
    updatePlan('free');
    showView('onboarding');
  }
});

// ── 초기화 (popup 열릴 때마다 실행) ──

async function init() {
  try {
    // 1. 인증 상태 확인
    const authRes = await sendMessage('GET_AUTH_STATE');
    const authState = authRes?.data;

    if (!authState || !authState.licenseKey) {
      // 라이선스 없음 → 온보딩 or Free 대시보드
      // Free 사용자가 이미 Skip한 적 있는지 확인
      const credits = await sendMessage('GET_CREDITS', {});
      updateCredits(credits?.data?.remaining ?? 20);
      updatePlan('free');

      // 첫 방문이면 온보딩, 아니면 바로 대시보드
      const hasVisited = await chrome.storage.local.get('tubescout_has_visited');
      if (hasVisited.tubescout_has_visited) {
        showView('dashboard');
      } else {
        showView('onboarding');
      }
    } else {
      // 인증됨 → 대시보드
      updateCredits(authState.creditsRemaining);
      updatePlan(authState.plan);
      showView('dashboard');
    }

    // 2. 현재 비디오 데이터 로드
    const videoRes = await sendMessage('GET_VIDEO_DATA');
    updateVideoCard(videoRes?.data || null);

    // 3. 크레딧 백그라운드 갱신 (선택적)
    sendMessage('GET_CREDITS', { forceRefresh: true }).then((res) => {
      if (res?.success && res.data?.remaining != null) {
        updateCredits(res.data.remaining);
      }
    }).catch(() => { });

  } catch (err) {
    console.error('[TubeScout] Popup init failed:', err);
    showView('onboarding');
  }
}

// Skip 클릭 시 방문 기록 저장 (온보딩 재표시 방지)
els.btnSkip.addEventListener('click', () => {
  chrome.storage.local.set({ tubescout_has_visited: true });
});

// popup이 열리면 init 실행
document.addEventListener('DOMContentLoaded', init);
