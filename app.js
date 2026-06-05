/* =========================================================
   VOC 콘솔 — app.js
   PRD: VOC 전달 자동화 및 대시보드 (v1.1)

   주의: 본 v1은 백엔드 없는 정적 사이트입니다.
   - 데이터는 브라우저 localStorage에 저장됩니다(기기/브라우저 한정).
   - "AI 요약/분류"는 실제 LLM이 아닌 키워드 기반 휴리스틱 대체 구현입니다.
     실 서비스에서는 서버 측 AI 연동으로 교체해야 합니다.
     (대체 구현이라도 PRD의 면책 표시 요건은 동일하게 적용합니다.)
   ========================================================= */

'use strict';

/* ---------- 상수 정의 (PRD 4-2) ---------- */
const TYPES = [
  '기능 요청', 'UX 불만', '버그·오작동', '로컬라이제이션',
  '디자인 (HW/UXUI)', '앱 생태계', '가격·가치 인식', '성능·기술 요청'
];
const IMPACTS = ['SW 전용', 'HW 전용', 'SW+HW 복합'];
const EMOTIONS = ['정보 제공', '제안', '불만', '강한 불만'];
const SOURCES = ['국내', '해외'];
// 워크스페이스(브랜드)별 모델 라인업
//  - AK    : https://www.astellnkern.com/product/dap.php
//  - Activo: https://www.activostyle.com/ko/product  (AK가 튜닝한 자매 브랜드)
const WORKSPACES = ['AK', 'Activo'];
const WORKSPACE_LABEL = { AK: 'Astell&Kern', Activo: 'Activo' };

const MODEL_GROUPS_BY_WS = {
  AK: [
    { label: 'A&ultima', models: ['SP4000T', 'SP4000', 'SP3000M', 'SP3000T', 'SP3000', 'SP2000T', 'SP2000', 'SP1000', 'SP1000M', 'SP1000M GOLD'] },
    { label: 'PD series', models: ['PD20', 'PD10', 'PD10 & Cradle'] },
    { label: 'Heritage', models: ['SR35', 'SR25 MKII', 'SE300', 'SE200', 'SE180'] },
    { label: 'Classic', models: ['KANN ULTRA', 'KANN MAX', 'KANN ALPHA'] }
  ],
  Activo: [
    { label: 'DAP', models: ['P1', 'CT10'] },
    { label: 'Earphone', models: ['Q1', 'VOLCANO', 'SCOOP'] },
    { label: 'Accessories', models: ['P1 CASE'] }
  ]
};
const modelGroups = ws => MODEL_GROUPS_BY_WS[ws] || [];
const modelsFor   = ws => ['공통 / 브랜드 이슈', ...modelGroups(ws).flatMap(g => g.models), '기타'];

/* ---------- 팀 / 담당자 (담당자 1슬롯) ---------- */
const DEFAULT_TEAM = [
  { id: 'ellie',  en: 'Ellie',  ko: '',     role: 'UX' },
  { id: 'marlon', en: 'Marlon', ko: '박준영', role: 'PM' },
  { id: 'ben',    en: 'Ben',    ko: '황동오', role: 'Dev' },
  { id: 'luke',   en: 'Luke',   ko: '윤태준', role: 'Dev' },
  { id: 'etna',   en: 'Etna',   ko: '윤수정', role: 'UX' },
];
// 컬러 아바타 팔레트 (무채색 UI 위 유일한 컬러 포인트)
const AVATAR_COLORS = ['#c0392b', '#b03a6e', '#7159c1', '#2670c4', '#0e8a6e', '#c47f0a', '#5b6b7b', '#8e44ad'];
const hashIdx = (s, n) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % n; };
const team = () => (DB && DB.team) || DEFAULT_TEAM;
const member = id => team().find(m => m.id === id) || null;
function avatarHTML(id, size) {
  const sz = size || 26;
  const style = `width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.42)}px`;
  const m = member(id);
  if (!m) return `<span class="avatar none" style="${style}" title="미배정">–</span>`;
  const c = AVATAR_COLORS[hashIdx(m.id, AVATAR_COLORS.length)];
  return `<span class="avatar" style="${style};background:${c}" title="${esc((m.en + ' ' + (m.ko || '')).trim())}">${esc(m.en[0])}</span>`;
}
// 레드마인 티켓 원본 URL 패턴 (운영 시 실제 레드마인 주소로 교체)
const REDMINE_BASE = 'https://redmine.example.com/issues/';
const redmineBase = () => (DB && DB.redmineBase) || REDMINE_BASE;

const STORE_KEY = 'voc_console_v1';
const DRAFT_KEY = 'voc_cs_draft_v1';

/* ---------- 키워드 기반 휴리스틱 AI (대체 구현) ---------- */
const TYPE_KEYWORDS = {
  '기능 요청':        ['추가', '기능', '됐으면', '있으면', '지원해', '넣어', '바라', '요청', '원해', '필요'],
  'UX 불만':          ['불편', '어렵', '헷갈', '복잡', '찾기', '못 찾', '직관', '조작', '사용성', '번거'],
  '버그·오작동':      ['안 됨', '안됨', '안돼', '안 나', '안나', '안 들', '안 켜', '인식 안', '연결 안', '재연결', '오류', '에러', '버그', '튕', '먹통', '작동', '멈춤', '끊', 'crash', '꺼짐'],
  '로컬라이제이션':   ['언어', '번역', '한국어', '영어', '날짜', '시간대', '지역', '단위', '통화', '현지'],
  '디자인 (HW/UXUI)': ['디자인', '색상', '글씨', '예쁘', '못생', '레이아웃', '재질', '마감', '외관'],
  '앱 생태계':        ['서드파티', '연동', '호환', '플레이스토어', '앱스토어', '설치'],
  '가격·가치 인식':   ['비싸', '가격', '가성비', '구독', '결제', '아깝', '값이'],
  '성능·기술 요청':   ['느리', '성능', '배터리', '발열', '사양', '속도', '버벅', '용량', '메모리']
};
const HW_KEYWORDS = ['배터리', '발열', '재질', '마감', '버튼', '하드웨어', '액정', '화면 깨', '충전', '단자', '소음'];
const SW_KEYWORDS = ['업데이트', '펌웨어', '앱', '설정', '오류', '버그', '느리', '연동', '번역', '언어'];
const EMO_KEYWORDS = {
  '강한 불만': ['최악', '환불', '실망', '화나', '짜증', '다신', 'never', '쓰레기', '엉망', '못 쓰', '당장'],
  '불만':      ['불편', '아쉽', '별로', '안 됨', '안됨', '문제', '불만'],
  '제안':      ['하면 좋', '제안', '추천', '바라', '됐으면', '있으면 좋'],
};

function countHits(text, words) {
  let n = 0;
  for (const w of words) if (text.includes(w)) n++;
  return n;
}

function heuristicClassify(body) {
  const t = body.toLowerCase().replace(/\s+/g, ' ');
  const raw = body;

  // 유형: 히트 1개 이상인 유형 모두 선택, 없으면 최다 후보 1개
  const scored = TYPES.map(type => ({ type, score: countHits(raw, TYPE_KEYWORDS[type]) }));
  let types = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.type);
  if (types.length === 0) types = ['UX 불만'];
  types = types.slice(0, 3);

  // 영향 범위
  const hw = countHits(raw, HW_KEYWORDS), sw = countHits(raw, SW_KEYWORDS);
  let impact = 'SW 전용';
  if (hw > 0 && sw > 0) impact = 'SW+HW 복합';
  else if (hw > sw) impact = 'HW 전용';

  // 감정 강도
  let emotion = '정보 제공';
  if (countHits(raw, EMO_KEYWORDS['강한 불만']) > 0) emotion = '강한 불만';
  else if (countHits(raw, EMO_KEYWORDS['불만']) > 0) emotion = '불만';
  else if (countHits(raw, EMO_KEYWORDS['제안']) > 0) emotion = '제안';

  return { types, impact, emotion };
}

function heuristicSummary(body) {
  const clean = body.replace(/\s+/g, ' ').trim();
  // 문장 단위로 분리해 앞 2~3문장을 핵심 요약으로 사용
  const sentences = clean.split(/(?<=[.!?。…]|다\.|요\.|음\.|임\.)\s+/).filter(Boolean);
  let summary = sentences.slice(0, 2).join(' ');
  if (summary.length > 120) summary = summary.slice(0, 117) + '…';
  if (!summary) summary = clean.slice(0, 90) + (clean.length > 90 ? '…' : '');
  return summary;
}

/* ---------- 반복 이슈 감지 (PRD 4-3) ---------- */
const STOPWORDS = new Set(['그리고', '하지만', '그래서', '너무', '정말', '진짜', '그냥', '계속', '제품', '사용', '있습니다', '합니다', '같아요', '같습니다', '해주세요', '있어요', '있음']);
function keywords(body) {
  return (body.match(/[가-힣A-Za-z]{2,}/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}
function computeRepeats(records) {
  const freq = {};
  records.forEach(r => {
    const seen = new Set(keywords(r.body));
    seen.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });
  // 각 레코드에 대해 2건 이상 공유되는 키워드가 있으면 배지
  records.forEach(r => {
    const seen = new Set(keywords(r.body));
    const shared = [...seen].filter(w => freq[w] >= 2 && w.length >= 2);
    // 의미 있는 키워드만(빈도순 상위)
    shared.sort((a, b) => freq[b] - freq[a]);
    r._repeatKeys = shared.slice(0, 3);
  });
}

/* ---------- 저장소 ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
  catch { return null; }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }

let DB;

// 워크스페이스별 샘플 (데모/초기 데이터)  st: 상태, as: 담당자, rv: 검토완료
const SAMPLES = {
  AK: [
    { body: 'SP3000에서 EQ 설정 화면을 찾기가 너무 어려워요. 메뉴가 너무 깊게 들어가 있어서 매번 헤맵니다. 자주 쓰는 기능은 첫 화면에 두면 좋겠어요.', model: 'SP3000', source: '국내', redmine: '10421', st: '검토중', as: 'ellie' },
    { body: '블루투스로 이어폰 연결하면 자꾸 한쪽만 소리가 안 나옵니다. 재연결해도 똑같고 펌웨어 업데이트 후로 더 심해졌어요. 환불하고 싶을 정도로 짜증납니다.', model: 'PD10', source: '국내', redmine: '10455', st: '개발 요청', as: 'ben', rv: true },
    { body: '해외에서 쓰는데 날짜 표기가 한국식으로만 나와서 불편합니다. 현지 언어와 시간대 설정을 지원해주세요.', model: '공통 / 브랜드 이슈', source: '해외', redmine: '', st: '완료', as: 'etna', rv: true },
    { body: 'The price is too high compared to competitors. 가격 대비 기능이 아쉽고 스트리밍 구독료까지 따로 내야 해서 가성비가 별로입니다.', model: 'SP4000', source: '해외', redmine: '10470', st: '검토중' },
    { body: '재생 중 배터리가 너무 빨리 닳고 충전 단자 접촉이 안 좋은지 충전이 안 될 때가 있어요. 발열도 좀 있는 것 같습니다.', model: 'KANN MAX', source: '국내', redmine: '10488', st: '개발 요청', as: 'luke' },
    { body: '재생 목록을 넘기다 보면 가끔 멈추고 앱이 튕깁니다. 업데이트 후 오류가 더 자주 발생해요.', model: 'SR35', source: '국내', redmine: '10492', st: '완료', as: 'ben', rv: true },
  ],
  Activo: [
    { body: 'P1 화면이 작아서 재생 목록 글씨가 잘 안 보입니다. 글씨 크기를 키우는 옵션이 있으면 좋겠어요.', model: 'P1', source: '국내', redmine: '10510', st: '검토중', as: 'ellie' },
    { body: 'CT10에서 와이파이가 자꾸 끊기고 스트리밍 재생이 멈춥니다. 재연결해도 같은 증상이 반복돼요.', model: 'CT10', source: '해외', redmine: '10515', st: '개발 요청', as: 'luke', rv: true },
    { body: 'Q1 이어폰 한쪽 소리가 작게 나오고 케이블 마감이 좀 아쉽습니다. 디자인은 마음에 들어요.', model: 'Q1', source: '국내', redmine: '', st: '완료', rv: true },
  ]
};

function seed() {
  const now = Date.now();
  const order = [...SAMPLES.AK.map(s => ['AK', s]), ...SAMPLES.Activo.map(s => ['Activo', s])];
  let seq = 0;
  const records = order.map(([brand, s]) => {
    seq += 1;
    const ts = now - (order.length - seq) * 4.6e8; // 약 5.3일 간격으로 분산 (히트맵/델타용)
    return makeRecord(brand, s.body, s.model, s.source, s.redmine, ts, seq, { status: s.st, assignee: s.as, reviewed: s.rv });
  });
  return { seq, records, team: DEFAULT_TEAM.slice(), me: 'ellie', notifs: [], redmineBase: REDMINE_BASE, _seededActivo: true };
}

// 기존 저장 데이터 마이그레이션
function ensureData() {
  let changed = false;
  if (!DB.team) { DB.team = DEFAULT_TEAM.slice(); changed = true; }
  // 프로필 기본 사용자 Olivia → Ellie 로 변경 (기존 저장 데이터)
  const ol = DB.team.find(m => m.id === 'olivia');
  if (ol) {
    ol.id = 'ellie'; ol.en = 'Ellie'; ol.ko = '';
    DB.records.forEach(r => { if (r.assignee === 'olivia') r.assignee = 'ellie'; });
    if (DB.me === 'olivia') DB.me = 'ellie';
    changed = true;
  }
  if (!DB.me) { DB.me = DB.team[0] ? DB.team[0].id : 'ellie'; changed = true; }
  DB.team.forEach(m => { if (m.role === '개발') { m.role = 'Dev'; changed = true; } });
  if (!DB.notifs) { DB.notifs = []; changed = true; }
  if (!DB.redmineBase) { DB.redmineBase = REDMINE_BASE; changed = true; }
  DB.records.forEach(r => {
    if (!r.brand) { r.brand = 'AK'; changed = true; }
    if (!('assignee' in r)) { r.assignee = null; changed = true; }
    if (!('reviewedAt' in r)) { r.reviewedAt = r.reviewed ? r.createdAt : null; changed = true; }
    if (!Array.isArray(r.statusHistory)) {
      r.statusHistory = [{ status: '검토중', at: r.createdAt }];
      if (r.pmStatus && r.pmStatus !== '검토중') r.statusHistory.push({ status: r.pmStatus, at: r.createdAt + 6e6 });
      changed = true;
    }
  });
  if (!DB._seededActivo && !DB.records.some(r => r.brand === 'Activo')) {
    const now = Date.now();
    SAMPLES.Activo.forEach((s, i) => {
      DB.seq += 1;
      const ts = now - (SAMPLES.Activo.length - i) * 4.6e8;
      DB.records.push(makeRecord('Activo', s.body, s.model, s.source, s.redmine, ts, DB.seq, { status: s.st, assignee: s.as, reviewed: s.rv }));
    });
    DB._seededActivo = true; changed = true;
  }
  if (changed) save();
}

function makeRecord(brand, body, model, source, redmine, ts, seq, opts) {
  opts = opts || {};
  const ai = heuristicClassify(body);
  const createdAt = ts || Date.now();
  const status = opts.status || '검토중';
  const history = [{ status: '검토중', at: createdAt }];
  if (status !== '검토중') history.push({ status, at: createdAt + 6e6 });
  return {
    id: 'V' + String(seq).padStart(4, '0'),
    seq, brand: brand || 'AK', createdAt,
    body, model: model || '공통 / 브랜드 이슈', source: source || '국내',
    redmine: redmine || '',
    aiSummary: heuristicSummary(body),
    aiTypes: ai.types, aiImpact: ai.impact, aiEmotion: ai.emotion,
    // 사람 보정 값 (없으면 AI값 사용)
    types: null, impact: null, emotion: null,
    reviewed: !!opts.reviewed, reviewedAt: opts.reviewed ? createdAt + 3e6 : null,
    priority: opts.priority || null,
    assignee: opts.assignee || null,
    pmStatus: status, pmMemo: opts.memo || '',
    statusHistory: history
  };
}

DB = load() || seed();
ensureData();

// 화면 표시에 쓰일 실효값(보정 > AI)
const effTypes   = r => r.types   || r.aiTypes;
const effImpact  = r => r.impact  || r.aiImpact;
const effEmotion = r => r.emotion || r.aiEmotion;

/* ---------- 라우팅 (해시 + 필터 URL 동기화, PRD 8-2) ---------- */
const state = {
  workspace: 'AK',            // 'AK' | 'Activo'
  view: 'dashboard',          // 'dashboard' | 'board' | 'calendar' | 'settings' | 'cs'
  calTab: 'intake',           // 'intake' | 'gantt'
  filters: { type: '', impact: '', source: '', emotion: '', model: '', assignee: '', q: '', repeat: false },
  detailId: null,
  submitted: null,
};
const WS_KEY = 'voc_console_ws';
const VIEWS = ['dashboard', 'board', 'calendar', 'settings', 'cs'];

// 현재 워크스페이스(브랜드)에 속한 레코드만
const wsRecords = () => DB.records.filter(r => (r.brand || 'AK') === state.workspace);

/* ---------- 알림 (로컬 시뮬레이션 — 멀티유저는 추후 백엔드) ---------- */
function pushNotif(kind, text, vocId) {
  DB.notifs = DB.notifs || [];
  DB.notifs.unshift({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, text, vocId: vocId || null, at: Date.now(), read: false });
  DB.notifs = DB.notifs.slice(0, 50);
  save(); updateBell();
}

function readURL() {
  const h = new URLSearchParams(location.hash.slice(1));
  const ws = h.get('ws') || localStorage.getItem(WS_KEY) || 'AK';
  state.workspace = WORKSPACES.includes(ws) ? ws : 'AK';
  const v = h.get('view');
  state.view = VIEWS.includes(v) ? v : 'dashboard';
  state.calTab = h.get('tab') === 'gantt' ? 'gantt' : 'intake';
  state.filters.type    = h.get('type') || '';
  state.filters.impact  = h.get('impact') || '';
  state.filters.source  = h.get('source') || '';
  state.filters.emotion = h.get('emotion') || '';
  state.filters.model   = h.get('model') || '';
  state.filters.assignee = h.get('assignee') || '';
  state.filters.q       = h.get('q') || '';
  state.filters.repeat  = h.get('repeat') === '1';
}
function writeURL() {
  const h = new URLSearchParams();
  h.set('ws', state.workspace);
  h.set('view', state.view);
  if (state.view === 'calendar') h.set('tab', state.calTab);
  const f = state.filters;
  if (f.type) h.set('type', f.type);
  if (f.impact) h.set('impact', f.impact);
  if (f.source) h.set('source', f.source);
  if (f.emotion) h.set('emotion', f.emotion);
  if (f.model) h.set('model', f.model);
  if (f.assignee) h.set('assignee', f.assignee);
  if (f.q) h.set('q', f.q);
  if (f.repeat) h.set('repeat', '1');
  localStorage.setItem(WS_KEY, state.workspace);
  history.replaceState(null, '', '#' + h.toString());
}

/* ---------- 유틸 ---------- */
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const AI_NOTE = 'AI가 생성한 내용으로, 부정확할 수 있습니다. 반드시 원문을 확인하세요.';
function warnIcon() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

/* ---------- 렌더 ---------- */
const root = $('#root');

function render() {
  writeURL();
  setNav();
  if (state.view === 'cs') root.innerHTML = state.submitted ? renderConfirm() : renderCS();
  else if (state.view === 'board') root.innerHTML = renderBoard();
  else if (state.view === 'calendar') root.innerHTML = renderCalendar();
  else if (state.view === 'settings') root.innerHTML = renderSettings();
  else root.innerHTML = renderDashboard();
  bind();
  updateWS();
  updateBell();
  if (state.detailId) renderDrawer();
}

const wsCode = w => (w === 'Activo' ? 'Av' : 'AK');
function updateWS() {
  const ava = document.getElementById('ws-ava');
  const name = document.getElementById('ws-name');
  if (ava) { ava.textContent = wsCode(state.workspace); ava.className = 'ws-ava ' + state.workspace; }
  if (name) name.textContent = WORKSPACE_LABEL[state.workspace];
}

function setNav() {
  document.querySelectorAll('.nav button[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === state.view));
}

/* ---------- 상단바: 알림 종 + 현재 사용자 ---------- */
function updateBell() {
  const bell = document.getElementById('bell');
  if (bell) {
    const unread = (DB.notifs || []).filter(n => !n.read).length;
    const badge = bell.querySelector('.badge');
    if (badge) { badge.style.display = unread ? 'flex' : 'none'; badge.textContent = unread > 9 ? '9+' : String(unread); }
  }
  const me = document.getElementById('me-chip');
  if (me) {
    const m = member(DB.me);
    me.innerHTML = `${avatarHTML(DB.me, 28)}<span class="me-name">${m ? esc(m.en) : '게스트'}</span>`;
  }
}

/* ===== CS 입력 ===== */
function renderCS() {
  const d = loadDraft();
  const opt = m => `<option value="${esc(m)}" ${d.model === m ? 'selected' : ''}>${esc(m)}</option>`;
  const modelOpts = [opt('공통 / 브랜드 이슈')]
    .concat(modelGroups(state.workspace).map(g => `<optgroup label="${esc(g.label)}">${g.models.map(opt).join('')}</optgroup>`))
    .concat(opt('기타'))
    .join('');
  return `
  <div class="page-head">
    <h1>VOC 입력 <span class="ws-pill ${state.workspace}">${esc(WORKSPACE_LABEL[state.workspace])}</span></h1>
    <p>레드마인 VOC 내용을 붙여넣거나 직접 작성해 전달하세요. 제출 시 <b>${esc(WORKSPACE_LABEL[state.workspace])}</b> 워크스페이스 보드에 자동 반영됩니다.</p>
  </div>
  <div class="cs-grid">
    <div class="card cs-form">
      <label class="field">
        <span class="lab">VOC 본문 <span class="req">*</span></span>
        <textarea id="f-body" placeholder="고객 VOC 내용을 입력하거나 레드마인에서 복사해 붙여넣으세요.">${esc(d.body || '')}</textarea>
        <div class="hint">제출하면 AI가 핵심 요약과 유형을 1차 자동 분류합니다.</div>
      </label>

      <div class="row-2">
        <label class="field">
          <span class="lab">모델명 <span class="opt">선택</span></span>
          <select id="f-model">${modelOpts}</select>
          <div class="hint">특정 모델 문의가 아니면 “공통 / 브랜드 이슈”를 선택하세요.</div>
        </label>
        <label class="field">
          <span class="lab">고객 출처</span>
          <div class="seg" id="f-source">
            ${SOURCES.map(s => `<button type="button" data-src="${s}" class="${(d.source || '국내') === s ? 'on' : ''}">${s}</button>`).join('')}
          </div>
        </label>
      </div>

      <label class="field">
        <span class="lab">레드마인 티켓 번호 <span class="opt">선택</span></span>
        <input type="text" id="f-redmine" placeholder="예: 10421" value="${esc(d.redmine || '')}">
        <div class="hint" id="redmine-preview"></div>
      </label>

      <div class="cs-actions">
        <button class="btn primary" id="btn-submit">제출 &amp; 전송</button>
        <button class="btn" id="btn-draft">임시저장</button>
        <button class="btn ghost" id="btn-clear">초기화</button>
        <span class="draft-note" id="draft-note"></span>
      </div>
    </div>

    <div class="card cs-side">
      <h3>접수 안내</h3>
      <ul>
        <li>접수 번호는 <b>제출 시 자동 부여</b>됩니다(직접 입력 불필요).</li>
        <li>레드마인 티켓 번호를 입력하면 <b>원본 링크가 자동 생성</b>됩니다.</li>
        <li>제출 후 확인 화면에서 접수번호를 레드마인과 대조할 수 있습니다.</li>
        <li>작성 중 이탈해도 <b>임시저장</b>으로 내용이 보존됩니다.</li>
      </ul>
    </div>
  </div>`;
}

function renderConfirm() {
  const r = state.submitted;
  const link = r.redmine ? `<a href="${redmineBase()}${encodeURIComponent(r.redmine)}" target="_blank" rel="noopener">레드마인 #${esc(r.redmine)} 원문 열기 ↗</a>` : '레드마인 번호 미입력';
  return `
  <div class="card confirm">
    <div class="check">✓</div>
    <h2>전달 완료되었습니다</h2>
    <p style="color:var(--muted);margin:0">UX/PM 대시보드에 자동 반영되었습니다.</p>
    <div class="recv">${esc(r.id)}</div>
    <div class="recv-lab">접수번호 — 레드마인과 대조용으로 보관하세요</div>
    <div class="meta">
      모델 <b>${esc(r.model)}</b> · 출처 <b>${esc(r.source)}</b><br>${link}
    </div>
    <div class="actions">
      <button class="btn" id="btn-again">새 VOC 입력</button>
      <button class="btn primary" id="btn-godash">보드에서 보기</button>
    </div>
  </div>`;
}

/* ===== 대시보드 (UX + PM 공용) ===== */
function visibleRecords() {
  const scoped = wsRecords();
  computeRepeats(scoped);
  const f = state.filters;
  let list = scoped.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (f.type)    list = list.filter(r => effTypes(r).includes(f.type));
  if (f.impact)  list = list.filter(r => effImpact(r) === f.impact);
  if (f.source)  list = list.filter(r => r.source === f.source);
  if (f.emotion) list = list.filter(r => effEmotion(r) === f.emotion);
  if (f.model)   list = list.filter(r => r.model === f.model);
  if (f.assignee) list = list.filter(r => r.assignee === f.assignee);
  if (f.repeat)  list = list.filter(r => r._repeatKeys && r._repeatKeys.length);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(r => (r.body + r.aiSummary + r.id + r.redmine).toLowerCase().includes(q));
  }
  return list;
}

function selectFilter(id, value, options, label) {
  const opts = ['<option value="">전체</option>']
    .concat(options.map(o => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>`))
    .join('');
  return `<span class="lab">${label}</span><select data-filter="${id}">${opts}</select>`;
}

/* ----- KPI 카드 (값 + 지난 30일 증감) ----- */
function statsCards(recs) {
  const now = Date.now(), D = 30 * 864e5;
  const lastEntered = (r, s) => { const h = (r.statusHistory || []).filter(x => x.status === s); return h.length ? h[h.length - 1].at : null; };
  const deltaBy = getTs => {
    const cur = recs.filter(r => { const t = getTs(r); return t != null && t >= now - D; }).length;
    const prev = recs.filter(r => { const t = getTs(r); return t != null && t >= now - 2 * D && t < now - D; }).length;
    return cur - prev;
  };
  const total = recs.length;
  const reviewed = recs.filter(r => r.reviewed).length;
  const done = recs.filter(r => r.pmStatus === '완료').length;
  const devReq = recs.filter(r => r.pmStatus === '개발 요청').length;

  const d = {
    total: deltaBy(r => r.createdAt),
    reviewed: deltaBy(r => r.reviewedAt),
    done: deltaBy(r => lastEntered(r, '완료')),
    dev: deltaBy(r => lastEntered(r, '개발 요청')),
  };
  const delta = v => {
    const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '·';
    const sign = v > 0 ? '+' : '';
    return `<div class="delta"><span class="ar">${arrow}</span> ${sign}${v} <span class="dl">지난 30일</span></div>`;
  };
  return `
  <div class="dash-stats">
    <div class="card stat"><div class="l">전체 VOC</div><div class="n">${total}</div>${delta(d.total)}</div>
    <div class="card stat"><div class="l">분류 검토 완료</div><div class="n">${reviewed}</div>${delta(d.reviewed)}</div>
    <div class="card stat"><div class="l">처리 완료</div><div class="n">${done}</div>${delta(d.done)}</div>
    <div class="card stat"><div class="l">개발 요청 VOC</div><div class="n">${devReq}</div>${delta(d.dev)}</div>
  </div>`;
}

/* ===== 대시보드 (읽기 전용 파악용) ===== */
function renderDashboard() {
  const recs = wsRecords();

  // 상태 분포
  const statuses = ['검토중', '개발 요청', '완료'];
  const statusTotal = Math.max(1, recs.length);
  const statusRows = statuses.map(s => {
    const n = recs.filter(r => r.pmStatus === s).length;
    const pct = Math.round((n / statusTotal) * 100);
    return `<div class="srow">
      <span class="status-tag ${s.replace(/\s/g, '')}">${esc(s)}</span>
      <div class="track"><div class="fill ${s.replace(/\s/g, '')}" style="width:${pct}%"></div></div>
      <b>${n}</b></div>`;
  }).join('');

  // 자주 배정된 담당자 (전체, 배정 횟수순 — 카드 내 스크롤)
  const aCount = {};
  recs.forEach(r => { if (r.assignee) aCount[r.assignee] = (aCount[r.assignee] || 0) + 1; });
  const ranked = Object.keys(aCount).map(id => ({ id, n: aCount[id] })).sort((a, b) => b.n - a.n);
  const unassigned = recs.filter(r => !r.assignee).length;
  const rankItems = ranked.map(({ id, n }) => {
    const m = member(id);
    return `<div class="rank-item" data-asg="${esc(id)}">
      ${avatarHTML(id, 30)}
      <div class="rk-text"><div class="rk-name">${m ? esc(m.en) : '미등록'}</div>${m && m.role ? `<div class="rk-sub">${esc(m.role)}</div>` : ''}</div>
      <div class="rk-val">${n}<span>건</span></div>
    </div>`;
  }).join('') + (unassigned ? `<div class="rank-item muted"><span class="avatar none" style="width:30px;height:30px;font-size:13px">–</span><div class="rk-text"><div class="rk-name muted-s">미배정</div></div><div class="rk-val">${unassigned}<span>건</span></div></div>` : '');
  const assigneeBody = ranked.length ? `<div class="rank-list">${rankItems}</div>` : '<div class="empty-mini">배정된 담당자가 없습니다.</div>';

  return `
  <div class="page-head row">
    <div>
      <h1>대시보드 <span class="ws-pill ${state.workspace}">${esc(WORKSPACE_LABEL[state.workspace])}</span></h1>
      <p>${esc(WORKSPACE_LABEL[state.workspace])} VOC를 유형·상태·우선순위 기준으로 한눈에 파악합니다.</p>
    </div>
    <div class="head-actions">
      <button class="btn" type="button" data-act="export">⤓ Export</button>
      <button class="btn primary" type="button" data-view="cs">＋ Add VOC</button>
    </div>
  </div>
  ${statsCards(recs)}
  <div class="dash-grid-main">
    <div class="card panel monthly-card">
      <div class="panel-h">월별 VOC <span class="muted-s">최근 6개월 · 접수량</span></div>
      ${monthlyLine(recs)}
    </div>
    <div class="card panel">
      <div class="panel-h">유형 분포 <span class="ai-badge">AI 분류 포함</span></div>
      ${typeDonut(recs)}
    </div>
  </div>
  <div class="dash-grid">
    <div class="card panel">
      <div class="panel-h">상태 분포</div>
      ${statusRows}
    </div>
    <div class="card panel">
      <div class="panel-h">자주 배정된 담당자 <span class="muted-s">이름 클릭 시 보드로</span></div>
      ${assigneeBody}
    </div>
  </div>`;
}

/* 유형 분포 — 도넛 (무채색 그라데이션) */
function typeDonut(recs) {
  const data = TYPES.map(t => ({ t, n: recs.filter(r => effTypes(r).includes(t)).length }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const total = data.reduce((s, x) => s + x.n, 0);
  if (!total) return '<div class="empty-mini">데이터 없음</div>';
  const GRAY = ['#1d2129', '#3c4250', '#5b6470', '#7e8593', '#9aa1ad', '#b8bdc7', '#cfd3d8', '#dedcd5'];
  const r = 42, C = 2 * Math.PI * r;
  let off = 0;
  const segs = data.map((x, i) => {
    const len = (x.n / total) * C;
    const s = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${GRAY[i % GRAY.length]}" stroke-width="15" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"></circle>`;
    off += len; return s;
  }).join('');
  const legend = data.map((x, i) =>
    `<div class="lg-row"><i class="lg-dot" style="background:${GRAY[i % GRAY.length]}"></i><span class="lg-name">${esc(x.t)}</span><b>${x.n}</b></div>`).join('');
  return `<div class="donut-wrap">
    <div class="donut"><svg viewBox="0 0 120 120">${segs}</svg><div class="donut-center"><div class="dc-n">${recs.length}</div><div class="dc-l">VOC</div></div></div>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

/* 월별 VOC — 부드러운 영역 라인 차트 (최근 6개월 접수량) */
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0].x} ${pts[0].y}` : '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
function monthlyLine(recs) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: (d.getMonth() + 1) + '월', n: 0 });
  }
  recs.forEach(r => {
    const d = new Date(r.createdAt);
    const b = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b.n += 1;
  });
  const max = Math.max(1, ...months.map(x => x.n));
  const W = 680, H = 190, padX = 26, padTop = 26, padBot = 30;
  const innerW = W - padX * 2, innerH = H - padTop - padBot;
  const base = padTop + innerH;
  const pts = months.map((mo, i) => ({
    x: padX + (months.length === 1 ? innerW / 2 : innerW * (i / (months.length - 1))),
    y: padTop + innerH * (1 - mo.n / max), mo
  }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${base} L${pts[0].x.toFixed(1)} ${base} Z`;
  const dots = pts.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--ink)"></circle>` +
    `<text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" class="ml-val">${p.mo.n || ''}</text>`).join('');
  const xlabels = pts.map(p => `<text x="${p.x.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ml-x">${p.mo.label}</text>`).join('');
  return `<div class="monthly"><svg class="ml-svg" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="mlgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9aa1ad" stop-opacity="0.32"/><stop offset="100%" stop-color="#9aa1ad" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#mlgrad)"></path>
    <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
    ${dots}${xlabels}
  </svg></div>`;
}

/* ===== VOC 보드 (지라형 — 티켓 워크플로우) ===== */
function renderBoard() {
  const list = visibleRecords();
  const f = state.filters;
  const anyFilter = !!(f.type || f.impact || f.source || f.emotion || f.model || f.assignee || f.q || f.repeat);

  const toolbar = `
  <div class="card toolbar">
    <div class="grp">${selectFilter('type', f.type, TYPES, '유형')}</div>
    <div class="grp">${selectFilter('impact', f.impact, IMPACTS, '영향범위')}</div>
    <div class="grp">${selectFilter('model', f.model, modelsFor(state.workspace), '모델')}</div>
    <div class="grp">${selectFilter('source', f.source, SOURCES, '출처')}</div>
    <div class="grp">${selectFilter('emotion', f.emotion, EMOTIONS, '감정')}</div>
    <div class="grp"><span class="lab">담당자</span><select data-filter="assignee"><option value="">전체</option>${team().map(m => `<option value="${esc(m.id)}" ${f.assignee === m.id ? 'selected' : ''}>${esc(m.en)}${m.ko ? ' ' + esc(m.ko) : ''}</option>`).join('')}</select></div>
    <button class="btn sm ${f.repeat ? 'primary' : ''}" id="f-repeat">반복 이슈만</button>
    <div class="spacer"></div>
    <div class="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" id="f-q" placeholder="본문·접수번호 검색" value="${esc(f.q)}">
    </div>
  </div>`;

  const disclaimer = `
  <div class="disclaimer" style="margin-bottom:14px">
    ${warnIcon()}
    <div><b>AI 요약·분류 안내.</b> 목록의 요약과 분류는 AI가 1차 생성한 결과입니다. ${esc(AI_NOTE)} UX가 보정한 항목은 <b>검토 완료</b>로 표시됩니다.</div>
  </div>`;

  const items = list.length
    ? list.map(renderVOCCard).join('')
    : `<div class="card empty"><div class="big">조건에 맞는 VOC가 없습니다</div><div>필터를 변경하거나 ＋ Add VOC로 새 VOC를 등록하세요.</div></div>`;

  return `
  <div class="page-head row">
    <div>
      <h1>VOC 보드 <span class="ws-pill ${state.workspace}">${esc(WORKSPACE_LABEL[state.workspace])}</span></h1>
      <p>티켓처럼 VOC를 상태(검토중 · 개발 요청 · 완료)와 우선순위로 관리합니다. 카드를 열어 분류를 보정하고 PM 상태를 변경하세요.</p>
    </div>
    <div class="head-actions">
      <button class="btn" type="button" data-act="export">⤓ Export</button>
      <button class="btn primary" type="button" data-view="cs">＋ Add VOC</button>
    </div>
  </div>
  <div class="result-count">${esc(WORKSPACE_LABEL[state.workspace])} · <b>${list.length}</b>건 표시${anyFilter ? ' <span class="muted-s">(필터 적용됨)</span>' : ''}</div>
  ${toolbar}${disclaimer}
  <div class="voc-list">${items}</div>`;
}

/* ===== 캘린더 (접수 히트맵 / 작업 기간 간트) ===== */
function renderCalendar() {
  const recs = wsRecords();
  const tab = state.calTab === 'gantt' ? 'gantt' : 'intake';
  const head = `
  <div class="page-head row">
    <div>
      <h1>캘린더 <span class="ws-pill ${state.workspace}">${esc(WORKSPACE_LABEL[state.workspace])}</span></h1>
      <p>VOC 접수 시점과 작업 기간을 시간축으로 봅니다.</p>
    </div>
    <div class="head-actions">
      <button class="btn" type="button" data-act="export">⤓ Export</button>
      <button class="btn primary" type="button" data-view="cs">＋ Add VOC</button>
    </div>
  </div>
  <div class="cal-tabs">
    <button type="button" data-caltab="intake" class="${tab === 'intake' ? 'on' : ''}">접수 히트맵</button>
    <button type="button" data-caltab="gantt" class="${tab === 'gantt' ? 'on' : ''}">작업 기간 (간트)</button>
  </div>`;
  return head + (tab === 'gantt' ? calGantt(recs) : calIntake(recs));
}

const DAY = 864e5;
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function calIntake(recs) {
  const WEEKS = 12;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startSun = new Date(today.getTime() - ((WEEKS - 1) * 7 + today.getDay()) * DAY);
  const counts = {};
  recs.forEach(r => { const k = dayKey(r.createdAt); counts[k] = (counts[k] || 0) + 1; });
  const max = Math.max(1, ...Object.values(counts));
  const level = n => n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
  const dow = ['일', '월', '화', '수', '목', '금', '토'];

  let cols = '';
  for (let w = 0; w < WEEKS; w++) {
    let cells = '';
    for (let dd = 0; dd < 7; dd++) {
      const cur = new Date(startSun.getTime() + (w * 7 + dd) * DAY);
      const future = cur > today;
      const n = future ? -1 : (counts[dayKey(cur)] || 0);
      const lv = future ? 'f' : level(n);
      const lab = `${cur.getMonth() + 1}/${cur.getDate()}${future ? '' : ` · ${n}건`}`;
      cells += `<div class="hm-cell l${lv}" title="${lab}"></div>`;
    }
    cols += `<div class="hm-col">${cells}</div>`;
  }
  const totalIn = recs.filter(r => r.createdAt >= startSun.getTime()).length;
  return `
  <div class="card panel">
    <div class="panel-h">최근 ${WEEKS}주 접수량 <span class="muted-s">기간 내 ${totalIn}건 · 진할수록 많음</span></div>
    <div class="heatmap">
      <div class="hm-days">${dow.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="hm-grid">${cols}</div>
    </div>
    <div class="hm-legend">적음 <span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span class="hm-cell l4"></span> 많음</div>
  </div>`;
}

function calGantt(recs) {
  if (!recs.length) return '<div class="card empty"><div class="big">표시할 VOC가 없습니다</div></div>';
  const lastEntered = (r, s) => { const h = (r.statusHistory || []).filter(x => x.status === s); return h.length ? h[h.length - 1].at : null; };
  const now = Date.now();
  const list = recs.slice().sort((a, b) => a.createdAt - b.createdAt);
  const min = Math.min(...list.map(r => r.createdAt));
  const max = now;
  const span = Math.max(DAY, max - min);
  const pct = t => ((t - min) / span) * 100;

  const rows = list.map(r => {
    const doneAt = lastEntered(r, '완료');
    const devAt = lastEntered(r, '개발 요청');
    const end = doneAt || now;
    const left = pct(r.createdAt);
    const width = Math.max(2, pct(end) - left);
    const cls = r.pmStatus.replace(/\s/g, '');
    const devMark = devAt ? `<span class="gmark" style="left:${pct(devAt)}%" title="개발 요청 ${fmtDate(devAt)}"></span>` : '';
    return `
    <div class="gantt-row" data-open="${r.id}">
      <div class="g-label">${avatarHTML(r.assignee, 22)}<span class="recv-no">${esc(r.id)}</span><span class="g-model">${esc(r.model)}</span></div>
      <div class="g-track">
        <div class="g-bar ${cls}" style="left:${left}%;width:${width}%"></div>
        ${devMark}
      </div>
      <span class="status-tag ${cls}">${esc(r.pmStatus)}</span>
    </div>`;
  }).join('');

  const months = [];
  let cur = new Date(min); cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  while (cur.getTime() <= max) {
    months.push(`<span class="g-mtick" style="left:${Math.max(0, pct(cur.getTime()))}%">${cur.getMonth() + 1}월</span>`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return `
  <div class="card panel">
    <div class="panel-h">작업 기간 <span class="muted-s">접수 → 완료(또는 진행 중) · ◆ 개발 요청 시점</span></div>
    <div class="gantt-axis">${months.join('')}</div>
    <div class="gantt">${rows}</div>
  </div>`;
}

/* ===== 셋팅 ===== */
function renderSettings() {
  const rows = team().map(m => `
    <tr>
      <td>${avatarHTML(m.id, 26)}</td>
      <td><b>${esc(m.en)}</b>${m.ko ? ' ' + esc(m.ko) : ''}</td>
      <td>${esc(m.role)}</td>
      <td>${DB.me === m.id ? '<span class="me-tag">나</span>' : ''}</td>
      <td><button class="btn ghost sm" data-rm="${esc(m.id)}">삭제</button></td>
    </tr>`).join('');
  const meOpts = team().map(m => `<option value="${esc(m.id)}" ${DB.me === m.id ? 'selected' : ''}>${esc(m.en)}${m.ko ? ' ' + esc(m.ko) : ''}</option>`).join('');

  return `
  <div class="page-head"><h1>Setting</h1><p>담당자 명단·현재 사용자·연동을 관리합니다.</p></div>

  <div class="set-stack">
    <div class="card panel">
      <div class="panel-h">담당자 명단</div>
      <div class="roster-wrap"><table class="roster"><tbody>${rows}</tbody></table></div>
      <div class="add-member">
        <input type="text" id="nm-en" placeholder="영문 (예: Ellie)">
        <input type="text" id="nm-ko" placeholder="한글 (예: 김유나)">
        <select id="nm-role"><option>UX</option><option>PM</option><option>Dev</option><option>CS</option></select>
        <button class="btn primary sm" id="nm-add">＋ 추가</button>
      </div>
      <div class="hint">아바타는 영문 첫 글자로 자동 생성됩니다.</div>
    </div>

    <div class="card panel">
      <div class="panel-h">현재 사용자 (나)</div>
      <label class="field" style="margin:0;max-width:320px"><span class="lab">나로 지정할 멤버</span><select id="me-sel">${meOpts}</select></label>
      <div class="hint">여기서 고른 사람이 ‘나’가 됩니다. 그 사람에게 VOC가 배정되면 ‘나에게 배정됨’ 알림이 뜨고, 우측 상단 프로필에도 표시됩니다.</div>
    </div>

    <div class="card panel">
      <div class="panel-h">레드마인 연동</div>
      <label class="field" style="max-width:520px;margin:0">
        <span class="lab">티켓 원본 URL 베이스</span>
        <input type="text" id="rm-base" value="${esc(redmineBase())}">
      </label>
      <div class="cs-actions" style="margin-top:12px"><button class="btn primary sm" id="rm-save">저장</button><span class="draft-note" id="rm-note"></span></div>
    </div>

    <div class="card panel">
      <div class="panel-h">구글 계정 연동 <span class="badge-soon" style="background:var(--line-2);color:var(--muted)">준비중</span></div>
      <p style="margin:0 0 8px;color:var(--muted);font-size:13px">현재는 백엔드 없는 정적 사이트라 데이터가 브라우저에만 저장됩니다. 여러 명이 같은 VOC를 보고 서로에게 알림이 가려면 공용 백엔드(예: Firebase Auth + Firestore)가 필요합니다.</p>
      <ul style="margin:0;padding-left:18px;color:var(--ink-soft);font-size:13px;line-height:1.7">
        <li>구글 로그인(GIS): 신원·프로필 사진만 — 정적 사이트에서도 가능 (OAuth 클라이언트 ID 필요)</li>
        <li>공용 데이터 + 실시간 알림: Firebase 권장 (회사 Workspace 도메인 제한 가능)</li>
      </ul>
    </div>
  </div>`;
}

function renderVOCCard(r) {
  const types = effTypes(r);
  const typeChips = types.map(t => `<span class="chip type">${esc(t)}</span>`).join('');
  const reviewChip = r.reviewed
    ? `<span class="chip human">✓ 검토 완료</span>`
    : `<span class="chip ai-cls">AI 분류</span>`;
  const repeatChip = (r._repeatKeys && r._repeatKeys.length)
    ? `<span class="chip repeat">↻ 반복 · ${esc(r._repeatKeys[0])}</span>` : '';
  const pri = r.priority
    ? `<span class="pri ${r.priority}">${r.priority}</span>`
    : `<span class="pri none">우선순위 −</span>`;
  const status = `<span class="status-tag ${r.pmStatus.replace(/\s/g, '')}">${esc(r.pmStatus)}</span>`;

  return `
  <div class="card voc" data-open="${r.id}">
    <div class="col-id">
      <div class="recv-no">${esc(r.id)}</div>
      <div class="date">${fmtDate(r.createdAt)}</div>
      <div class="model">${esc(r.model)}</div>
      <div class="src">${esc(r.source)} · ${esc(effImpact(r))}</div>
    </div>
    <div class="col-body">
      <div class="ai-summary">
        <span class="ai-tag">${warnIcon()} AI 요약</span>
        ${esc(r.aiSummary)}
      </div>
      <div class="chips">
        ${typeChips}${reviewChip}${repeatChip}
        <span class="emo">감정: ${esc(effEmotion(r))}</span>
      </div>
    </div>
    <div class="col-meta">
      ${pri}${status}
      <div class="assignee">${avatarHTML(r.assignee, 24)}</div>
    </div>
  </div>`;
}

/* ===== 상세 드로어 ===== */
function renderDrawer() {
  const r = DB.records.find(x => x.id === state.detailId);
  if (!r) { state.detailId = null; return; }
  const types = effTypes(r);

  const typeChips = TYPES.map(t =>
    `<button class="opt-chip ${types.includes(t) ? 'on' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('');
  const impactChips = IMPACTS.map(i =>
    `<button class="opt-chip ${effImpact(r) === i ? 'on' : ''}" data-impact="${esc(i)}">${esc(i)}</button>`).join('');
  const emoSel = EMOTIONS.map(e =>
    `<option value="${esc(e)}" ${effEmotion(r) === e ? 'selected' : ''}>${esc(e)}</option>`).join('');
  const priBtns = ['High', 'Mid', 'Low'].map(p =>
    `<button class="${r.priority === p ? 'on ' + p : ''}" data-pri="${p}">${p}</button>`).join('');
  const statusSel = ['검토중', '개발 요청', '완료'].map(s =>
    `<option value="${esc(s)}" ${r.pmStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const assigneeSel = `<option value="">미배정</option>` + team().map(m =>
    `<option value="${esc(m.id)}" ${r.assignee === m.id ? 'selected' : ''}>${esc(m.en)}${m.ko ? ' ' + esc(m.ko) : ''} · ${esc(m.role)}</option>`).join('');

  const redmineLink = r.redmine
    ? `<a href="${redmineBase()}${encodeURIComponent(r.redmine)}" target="_blank" rel="noopener">레드마인 #${esc(r.redmine)} 원문 ↗</a>`
    : '<span style="color:var(--faint)">레드마인 번호 미입력</span>';

  const reviewBadge = r.reviewed
    ? '<span class="human-badge">✓ 검토 완료 (사람)</span>'
    : '<span class="ai-badge">AI 분류</span>';

  const repeatInfo = (r._repeatKeys && r._repeatKeys.length)
    ? `<div class="disclaimer" style="background:var(--alert-bg);border-color:#f5cccc;color:#a3261f">
         ↻ 반복 이슈 감지 — 다른 VOC와 공통 키워드: <b>${r._repeatKeys.map(esc).join(', ')}</b></div>` : '';

  const html = `
  <div class="overlay" id="overlay">
    <div class="drawer" id="drawer">
      <div class="drawer-head">
        <div>
          <div class="recv-no">${esc(r.id)}</div>
          <div class="date">${fmtDate(r.createdAt)} · ${esc(r.model)} · ${esc(r.source)}</div>
        </div>
        <button class="x-btn" id="x-close">×</button>
      </div>
      <div class="drawer-body">
        ${repeatInfo}

        <div class="sec">
          <div class="sec-h">${warnIcon()} AI 요약 <span class="ai-badge">AI</span></div>
          <div class="box ai">${esc(r.aiSummary)}</div>
          <div class="hint" style="color:var(--ai)">${esc(AI_NOTE)}</div>
        </div>

        <div class="sec">
          <div class="sec-h">원문 ${redmineLink}</div>
          <div class="box orig">${esc(r.body)}</div>
        </div>

        <div class="sec">
          <div class="sec-h">분류 보정 ${reviewBadge}</div>
          <div class="disclaimer" style="margin-bottom:12px">${warnIcon()}<div>아래는 AI 1차 분류입니다. 수정하면 <b>검토 완료(사람)</b>로 전환됩니다.</div></div>
          <div class="edit-grid">
            <div>
              <div class="sec-h" style="margin-bottom:6px">유형 (복수 선택)</div>
              <div class="multi" id="m-types">${typeChips}</div>
            </div>
            <div>
              <div class="sec-h" style="margin-bottom:6px">영향 범위</div>
              <div class="multi impact" id="m-impact">${impactChips}</div>
            </div>
            <div class="row-2">
              <label class="field" style="margin:0">
                <span class="lab">감정 강도</span>
                <select id="m-emotion">${emoSel}</select>
              </label>
              <div>
                <div class="lab" style="margin-bottom:7px">우선순위 태깅</div>
                <div class="pri-pick" id="m-pri">${priBtns}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sec pm-block">
          <div class="pm-title"><span class="tag">PM</span> 개발 전달 &amp; 상태</div>
          <label class="field">
            <span class="lab">개발 전달 메모</span>
            <textarea id="m-memo" style="min-height:90px" placeholder="개발팀에 전달할 내용을 적으세요.">${esc(r.pmMemo)}</textarea>
          </label>
          <div class="row-2" style="max-width:420px">
            <label class="field" style="margin:0">
              <span class="lab">상태</span>
              <select id="m-status">${statusSel}</select>
            </label>
            <label class="field" style="margin:0">
              <span class="lab">담당자</span>
              <select id="m-assignee">${assigneeSel}</select>
            </label>
          </div>
        </div>
      </div>
      <div class="save-bar">
        <button class="btn primary" id="m-save">저장</button>
        <button class="btn ghost" id="m-cancel">닫기</button>
        <span class="saved-msg" id="saved-msg" style="display:none">✓ 저장됨</span>
      </div>
    </div>
  </div>`;

  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);
  bindDrawer(r);
}

/* ---------- 이벤트 바인딩 ---------- */
function bind() {
  // 뷰 이동 (사이드바 + 헤더 버튼 공통)
  document.querySelectorAll('[data-view]').forEach(b =>
    b.onclick = () => { state.view = b.dataset.view; state.submitted = null; render(); });
  // 내보내기
  document.querySelectorAll('[data-act="export"]').forEach(b => b.onclick = exportXlsx);

  if (state.view === 'cs' && !state.submitted) bindCS();
  else if (state.view === 'cs' && state.submitted) bindConfirm();
  else if (state.view === 'board') bindBoard();
  else if (state.view === 'calendar') bindCalendar();
  else if (state.view === 'settings') bindSettings();
  else bindDashboard();
}

function bindCalendar() {
  document.querySelectorAll('[data-caltab]').forEach(b =>
    b.onclick = () => { state.calTab = b.dataset.caltab; render(); });
  document.querySelectorAll('[data-open]').forEach(c =>
    c.onclick = () => { state.detailId = c.dataset.open; renderDrawer(); });
}

function bindSettings() {
  document.querySelectorAll('[data-rm]').forEach(b =>
    b.onclick = () => {
      const id = b.dataset.rm;
      DB.team = team().filter(m => m.id !== id);
      DB.records.forEach(r => { if (r.assignee === id) r.assignee = null; });
      if (DB.me === id) DB.me = DB.team[0] ? DB.team[0].id : null;
      save(); render();
    });
  const add = $('#nm-add');
  if (add) add.onclick = () => {
    const en = $('#nm-en').value.trim(), ko = $('#nm-ko').value.trim(), role = $('#nm-role').value;
    if (!en) { $('#nm-en').focus(); return; }
    const base = en.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    let id = base, i = 1;
    while (team().some(m => m.id === id)) id = base + (++i);
    DB.team = team().concat([{ id, en, ko, role }]);
    save(); render();
  };
  const meSel = $('#me-sel');
  if (meSel) meSel.onchange = () => { DB.me = meSel.value; save(); render(); };
  const rmSave = $('#rm-save');
  if (rmSave) rmSave.onclick = () => {
    DB.redmineBase = $('#rm-base').value.trim() || REDMINE_BASE;
    save(); const n = $('#rm-note'); if (n) n.textContent = '저장됨';
  };
}

/* 엑셀(.xlsx) raw data 내보내기 — 현재 워크스페이스 전체 */
function exportXlsx() {
  const recs = wsRecords().slice().sort((a, b) => a.seq - b.seq);
  computeRepeats(recs);
  if (!recs.length) { alert('내보낼 VOC가 없습니다.'); return; }

  const header = ['접수번호', '등록일시', '브랜드', '모델', '출처', '레드마인',
    '유형', '영향범위', '감정', '검토여부', '우선순위', 'PM상태', 'PM메모',
    'AI유형', 'AI영향범위', 'AI감정', '반복키워드', 'VOC본문'];
  const rows = recs.map(r => [
    r.id,
    new Date(r.createdAt).toLocaleString('ko-KR'),
    WORKSPACE_LABEL[r.brand] || r.brand || 'AK',
    r.model, r.source, r.redmine || '',
    effTypes(r).join(', '), effImpact(r), effEmotion(r),
    r.reviewed ? '분류 검토 완료' : 'AI 분류',
    r.priority || '', r.pmStatus, r.pmMemo || '',
    (r.aiTypes || []).join(', '), r.aiImpact, r.aiEmotion,
    (r._repeatKeys || []).join(', '), r.body
  ]);
  const fname = `VOC_raw_${state.workspace}_${fmtDate(Date.now()).replace(/\./g, '')}`;

  if (window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = header.map(h => ({ wch: h === 'VOC본문' ? 60 : h === '등록일시' ? 19 : h === 'PM메모' ? 24 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VOC raw');
    XLSX.writeFile(wb, fname + '.xlsx');
  } else {
    // SheetJS 로드 실패 시 CSV(엑셀에서 열림) 폴백
    const csv = [header, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function bindCS() {
  const body = $('#f-body'), model = $('#f-model'), redmine = $('#f-redmine');
  const note = $('#draft-note');
  // 출처 세그먼트
  document.querySelectorAll('#f-source button').forEach(btn =>
    btn.onclick = () => {
      document.querySelectorAll('#f-source button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    });
  // 레드마인 링크 미리보기
  const updatePreview = () => {
    const v = redmine.value.trim();
    $('#redmine-preview').innerHTML = v
      ? `원본 링크: <a href="${redmineBase()}${encodeURIComponent(v)}" target="_blank" rel="noopener">${redmineBase()}${esc(v)} ↗</a>`
      : '티켓 번호 입력 시 원본 URL이 자동 생성됩니다.';
  };
  redmine.oninput = updatePreview; updatePreview();

  $('#btn-draft').onclick = () => {
    saveDraft(); note.textContent = '임시저장됨 · ' + new Date().toLocaleTimeString('ko-KR');
  };
  $('#btn-clear').onclick = () => { clearDraft(); render(); };
  $('#btn-submit').onclick = () => {
    const text = body.value.trim();
    if (!text) { body.focus(); body.style.borderColor = 'var(--alert)'; return; }
    const src = (document.querySelector('#f-source button.on') || {}).dataset?.src || '국내';
    DB.seq += 1;
    const rec = makeRecord(state.workspace, text, model.value, src, redmine.value.trim(), Date.now(), DB.seq);
    DB.records.push(rec); save(); clearDraft();
    pushNotif('new', `새 VOC ${rec.id} 생성됨 (${WORKSPACE_LABEL[rec.brand]})`, rec.id);
    state.submitted = rec; render();
  };
  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      body: body.value, model: model.value,
      source: (document.querySelector('#f-source button.on') || {}).dataset?.src || '국내',
      redmine: redmine.value
    }));
  }
}

function bindConfirm() {
  $('#btn-again').onclick = () => { state.submitted = null; render(); };
  $('#btn-godash').onclick = () => { state.submitted = null; state.view = 'board'; render(); };
}

function bindDashboard() {
  document.querySelectorAll('[data-open]').forEach(c =>
    c.onclick = () => { state.detailId = c.dataset.open; renderDrawer(); });
  document.querySelectorAll('[data-asg]').forEach(c =>
    c.onclick = () => {
      state.filters = { type: '', impact: '', source: '', emotion: '', model: '', assignee: c.dataset.asg, q: '', repeat: false };
      state.view = 'board';
      render();
    });
}

function bindBoard() {
  document.querySelectorAll('[data-filter]').forEach(sel =>
    sel.onchange = () => { state.filters[sel.dataset.filter] = sel.value; render(); });
  const fr = $('#f-repeat');
  if (fr) fr.onclick = () => { state.filters.repeat = !state.filters.repeat; render(); };
  const q = $('#f-q');
  if (q) {
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.filters.q = q.value; const pos = q.selectionStart; render(); const nq = $('#f-q'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } }, 250); };
  }
  document.querySelectorAll('[data-open]').forEach(c =>
    c.onclick = () => { state.detailId = c.dataset.open; renderDrawer(); });
}

function bindDrawer(r) {
  const close = () => { document.getElementById('overlay')?.remove(); state.detailId = null; render(); };
  $('#overlay').onclick = e => { if (e.target.id === 'overlay') close(); };
  $('#x-close').onclick = close;
  $('#m-cancel').onclick = close;

  // 임시 보정값 (저장 전까지 로컬)
  let editTypes = effTypes(r).slice();
  let editImpact = effImpact(r);
  let touched = false;

  document.querySelectorAll('#m-types .opt-chip').forEach(b =>
    b.onclick = () => {
      const t = b.dataset.type;
      if (editTypes.includes(t)) editTypes = editTypes.filter(x => x !== t);
      else editTypes.push(t);
      if (editTypes.length === 0) editTypes = [t]; // 최소 1개
      b.classList.toggle('on', editTypes.includes(t));
      touched = true;
    });
  document.querySelectorAll('#m-impact .opt-chip').forEach(b =>
    b.onclick = () => {
      editImpact = b.dataset.impact;
      document.querySelectorAll('#m-impact .opt-chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); touched = true;
    });
  $('#m-emotion').onchange = () => { touched = true; };
  document.querySelectorAll('#m-pri button').forEach(b =>
    b.onclick = () => {
      const p = b.dataset.pri;
      r._pendingPri = (r._pendingPri === p || (!r._pendingPri && r.priority === p)) ? null : p;
      document.querySelectorAll('#m-pri button').forEach(x => x.className = '');
      if (r._pendingPri) b.className = 'on ' + r._pendingPri;
    });

  $('#m-save').onclick = () => {
    const emo = $('#m-emotion').value;
    // 분류 보정 → 검토 완료 전환
    if (touched) {
      r.types = editTypes.slice();
      r.impact = editImpact;
      r.emotion = emo;
      if (!r.reviewed) r.reviewedAt = Date.now();
      r.reviewed = true;
    }
    if (r._pendingPri !== undefined) r.priority = r._pendingPri;
    delete r._pendingPri;
    r.pmMemo = $('#m-memo').value;

    // 상태 변경 → 이력 + 알림
    const newStatus = $('#m-status').value;
    if (newStatus !== r.pmStatus) {
      r.statusHistory = r.statusHistory || [];
      r.statusHistory.push({ status: newStatus, at: Date.now() });
      r.pmStatus = newStatus;
      pushNotif('status', `${r.id} 상태 변경 → ${newStatus}`, r.id);
    }
    // 담당자 변경 → 알림(나에게 배정 시)
    const newAssignee = $('#m-assignee').value || null;
    if (newAssignee !== r.assignee) {
      r.assignee = newAssignee;
      if (newAssignee && newAssignee === DB.me) pushNotif('assign', `${r.id}가 나에게 배정되었습니다`, r.id);
    }
    save();
    // 기존 오버레이 제거 후 단일 렌더 (render 말미에서 detailId가 있으면 드로어 1회 재생성)
    document.getElementById('overlay')?.remove();
    render();
    const msg = $('#saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => { const m = $('#saved-msg'); if (m) m.style.display = 'none'; }, 1400); }
  };
}

/* ---------- 알림 종 드롭다운 (정적 요소, 1회 바인딩) ---------- */
function bindTopbar() {
  const bell = document.getElementById('bell');
  if (bell) bell.onclick = e => { e.stopPropagation(); toggleNotifPanel(); };
  const wsSel = document.getElementById('ws-select');
  if (wsSel) wsSel.onclick = e => { e.stopPropagation(); toggleWsMenu(); };
}

function toggleWsMenu() {
  const ex = document.getElementById('ws-menu');
  if (ex) { ex.remove(); return; }
  const sel = document.getElementById('ws-select');
  const menu = document.createElement('div');
  menu.id = 'ws-menu'; menu.className = 'ws-menu';
  menu.innerHTML = WORKSPACES.map(w =>
    `<button type="button" data-wsx="${w}" class="${w === state.workspace ? 'on' : ''}">
       <span class="ws-ava ${w}">${wsCode(w)}</span>
       <span class="wm-name">${esc(WORKSPACE_LABEL[w])}</span>
       ${w === state.workspace ? '<span class="wm-ck">✓</span>' : ''}
     </button>`).join('');
  document.body.appendChild(menu);
  const r = sel.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.width = r.width + 'px';
  menu.querySelectorAll('[data-wsx]').forEach(b => b.onclick = () => {
    const w = b.dataset.wsx; menu.remove();
    if (w !== state.workspace) {
      state.workspace = w; state.detailId = null; state.submitted = null;
      state.filters = { type: '', impact: '', source: '', emotion: '', model: '', assignee: '', q: '', repeat: false };
      render();
    }
  });
  setTimeout(() => document.addEventListener('click', function od(ev) {
    if (!menu.contains(ev.target) && ev.target !== sel) { menu.remove(); document.removeEventListener('click', od); }
  }), 0);
}
function toggleNotifPanel() {
  const existing = document.getElementById('notif-panel');
  if (existing) { existing.remove(); return; }
  const ns = (DB.notifs || []);
  const list = ns.length ? ns.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-nopen="${esc(n.vocId || '')}">
      <div class="notif-kind k-${esc(n.kind)}"></div>
      <div class="notif-body"><div class="nt">${esc(n.text)}</div><div class="nd">${relTime(n.at)}</div></div>
    </div>`).join('') : '<div class="empty-mini" style="padding:16px">새 알림이 없습니다.</div>';
  const panel = document.createElement('div');
  panel.id = 'notif-panel'; panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-head"><b>알림</b><button class="btn ghost sm" id="notif-readall">모두 읽음</button></div>
    <div class="notif-list">${list}</div>`;
  document.body.appendChild(panel);
  const bell = document.getElementById('bell');
  const rect = bell.getBoundingClientRect();
  panel.style.top = (rect.bottom + 8) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';

  panel.querySelector('#notif-readall').onclick = () => {
    (DB.notifs || []).forEach(n => n.read = true); save(); updateBell(); panel.remove();
  };
  panel.querySelectorAll('[data-nopen]').forEach((el, i) => {
    el.onclick = () => {
      if (ns[i]) ns[i].read = true;
      const vid = el.dataset.nopen;
      save(); updateBell(); panel.remove();
      if (vid) {
        const rec = DB.records.find(r => r.id === vid);
        if (rec) { state.workspace = rec.brand || state.workspace; state.view = 'board'; state.detailId = vid; render(); }
      }
    };
  });
  setTimeout(() => document.addEventListener('click', function onDoc(ev) {
    if (!panel.contains(ev.target)) { panel.remove(); document.removeEventListener('click', onDoc); }
  }), 0);
}
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  return Math.floor(s / 86400) + '일 전';
}

/* ---------- 드래프트 ---------- */
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } }
function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

/* ---------- 부트 ---------- */
window.addEventListener('hashchange', () => { readURL(); render(); });
readURL();
render();
bindTopbar();
