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
const MODELS = [
  '공통 / 브랜드 이슈',
  'Galaxy Watch', 'Galaxy Buds', 'Smart Tag',
  'Soundbar', 'Air Purifier', 'Robot Cleaner', '기타'
];
// 레드마인 티켓 원본 URL 패턴 (운영 시 실제 레드마인 주소로 교체)
const REDMINE_BASE = 'https://redmine.example.com/issues/';

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

let DB = load() || seed();

function seed() {
  const now = Date.now();
  const samples = [
    { body: '워치 앱에서 운동 기록 화면을 찾기가 너무 어려워요. 메뉴가 너무 깊게 들어가 있어서 매번 헤맵니다. 자주 쓰는 기능은 첫 화면에 두면 좋겠어요.', model: 'Galaxy Watch', source: '국내', redmine: '10421' },
    { body: '버즈가 자꾸 한쪽만 소리가 안 나옵니다. 재연결해도 똑같고 펌웨어 업데이트 후로 더 심해졌어요. 환불하고 싶을 정도로 짜증납니다.', model: 'Galaxy Buds', source: '국내', redmine: '10455' },
    { body: '해외에서 쓰는데 날짜 표기가 한국식으로만 나와서 불편합니다. 현지 언어와 시간대 설정을 지원해주세요.', model: '공통 / 브랜드 이슈', source: '해외', redmine: '' },
    { body: 'The price is too high compared to competitors. 가격 대비 기능이 아쉽고 구독료까지 내야 해서 가성비가 별로입니다.', model: 'Air Purifier', source: '해외', redmine: '10470' },
    { body: '로봇청소기 배터리가 너무 빨리 닳고 충전 단자 접촉이 안 좋은지 충전이 안 될 때가 있어요. 발열도 좀 있는 것 같습니다.', model: 'Robot Cleaner', source: '국내', redmine: '10488' },
    { body: '워치 운동 기록이 가끔 멈추고 앱이 튕깁니다. 업데이트 후 오류가 더 자주 발생해요.', model: 'Galaxy Watch', source: '국내', redmine: '10492' },
  ];
  const records = samples.map((s, i) => makeRecord(s.body, s.model, s.source, s.redmine, now - (samples.length - i) * 8.6e7, i + 1));
  return { seq: samples.length, records };
}

function makeRecord(body, model, source, redmine, ts, seq) {
  const ai = heuristicClassify(body);
  return {
    id: 'V' + String(seq).padStart(4, '0'),
    seq, createdAt: ts || Date.now(),
    body, model: model || '공통 / 브랜드 이슈', source: source || '국내',
    redmine: redmine || '',
    aiSummary: heuristicSummary(body),
    aiTypes: ai.types, aiImpact: ai.impact, aiEmotion: ai.emotion,
    // 사람 보정 값 (없으면 AI값 사용)
    types: null, impact: null, emotion: null,
    reviewed: false,
    priority: null,
    pmStatus: '검토중', pmMemo: ''
  };
}

// 화면 표시에 쓰일 실효값(보정 > AI)
const effTypes   = r => r.types   || r.aiTypes;
const effImpact  = r => r.impact  || r.aiImpact;
const effEmotion = r => r.emotion || r.aiEmotion;

/* ---------- 라우팅 (해시 + 필터 URL 동기화, PRD 8-2) ---------- */
const state = {
  view: 'dashboard',          // 'cs' | 'dashboard'
  filters: { type: '', impact: '', source: '', emotion: '', model: '', q: '', repeat: false },
  detailId: null,
  submitted: null,
};

function readURL() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.view = h.get('view') === 'cs' ? 'cs' : 'dashboard';
  state.filters.type    = h.get('type') || '';
  state.filters.impact  = h.get('impact') || '';
  state.filters.source  = h.get('source') || '';
  state.filters.emotion = h.get('emotion') || '';
  state.filters.model   = h.get('model') || '';
  state.filters.q       = h.get('q') || '';
  state.filters.repeat  = h.get('repeat') === '1';
}
function writeURL() {
  const h = new URLSearchParams();
  h.set('view', state.view);
  const f = state.filters;
  if (f.type) h.set('type', f.type);
  if (f.impact) h.set('impact', f.impact);
  if (f.source) h.set('source', f.source);
  if (f.emotion) h.set('emotion', f.emotion);
  if (f.model) h.set('model', f.model);
  if (f.q) h.set('q', f.q);
  if (f.repeat) h.set('repeat', '1');
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
  else root.innerHTML = renderDashboard();
  bind();
  if (state.detailId) renderDrawer();
}

function setNav() {
  document.querySelectorAll('.nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === state.view));
}

/* ===== CS 입력 ===== */
function renderCS() {
  const d = loadDraft();
  const modelOpts = MODELS.map(m => `<option value="${esc(m)}" ${d.model === m ? 'selected' : ''}>${esc(m)}</option>`).join('');
  return `
  <div class="page-head">
    <h1>VOC 입력</h1>
    <p>레드마인 VOC 내용을 붙여넣거나 직접 작성해 전달하세요. 제출 시 대시보드에 자동 반영됩니다.</p>
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
  const link = r.redmine ? `<a href="${REDMINE_BASE}${encodeURIComponent(r.redmine)}" target="_blank" rel="noopener">레드마인 #${esc(r.redmine)} 원문 열기 ↗</a>` : '레드마인 번호 미입력';
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
      <button class="btn primary" id="btn-godash">대시보드 보기</button>
    </div>
  </div>`;
}

/* ===== 대시보드 (UX + PM 공용) ===== */
function visibleRecords() {
  computeRepeats(DB.records);
  const f = state.filters;
  let list = DB.records.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (f.type)    list = list.filter(r => effTypes(r).includes(f.type));
  if (f.impact)  list = list.filter(r => effImpact(r) === f.impact);
  if (f.source)  list = list.filter(r => r.source === f.source);
  if (f.emotion) list = list.filter(r => effEmotion(r) === f.emotion);
  if (f.model)   list = list.filter(r => r.model === f.model);
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

function renderDashboard() {
  const list = visibleRecords();
  const f = state.filters;
  const total = DB.records.length;
  const reviewed = DB.records.filter(r => r.reviewed).length;
  const repeats = DB.records.filter(r => r._repeatKeys && r._repeatKeys.length).length;
  const strong = DB.records.filter(r => effEmotion(r) === '강한 불만').length;

  const stats = `
  <div class="dash-stats">
    <div class="card stat"><div class="n">${total}</div><div class="l">전체 VOC</div></div>
    <div class="card stat acc"><div class="n">${reviewed}</div><div class="l">사람 검토 완료</div></div>
    <div class="card stat warn"><div class="n">${repeats}</div><div class="l">반복 이슈 감지</div></div>
    <div class="card stat warn"><div class="n">${strong}</div><div class="l">강한 불만</div></div>
  </div>`;

  const toolbar = `
  <div class="card toolbar">
    <div class="grp">${selectFilter('type', f.type, TYPES, '유형')}</div>
    <div class="grp">${selectFilter('impact', f.impact, IMPACTS, '영향범위')}</div>
    <div class="grp">${selectFilter('model', f.model, MODELS, '모델')}</div>
    <div class="grp">${selectFilter('source', f.source, SOURCES, '출처')}</div>
    <div class="grp">${selectFilter('emotion', f.emotion, EMOTIONS, '감정')}</div>
    <button class="btn sm ${f.repeat ? 'primary' : ''}" id="f-repeat">반복 이슈만</button>
    <div class="spacer"></div>
    <div class="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" id="f-q" placeholder="본문·접수번호 검색" value="${esc(f.q)}">
    </div>
  </div>`;

  const disclaimer = `
  <div class="disclaimer" style="margin-bottom:16px">
    ${warnIcon()}
    <div><b>AI 요약·분류 안내.</b> 목록의 요약과 분류는 AI가 1차 생성한 결과입니다. ${esc(AI_NOTE)} UX가 보정한 항목은 <b>검토 완료</b>로 표시됩니다.</div>
  </div>`;

  const items = list.length
    ? list.map(renderVOCCard).join('')
    : `<div class="card empty"><div class="big">조건에 맞는 VOC가 없습니다</div><div>필터를 변경하거나 CS 입력에서 VOC를 등록하세요.</div></div>`;

  return `
  <div class="page-head">
    <h1>VOC 대시보드</h1>
    <p>UX·PM 공용 화면 — 접수된 VOC를 유형·영향범위·우선순위 기준으로 한눈에 파악합니다.</p>
  </div>
  ${stats}${toolbar}${disclaimer}
  <div class="voc-list">${items}</div>`;
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

  const redmineLink = r.redmine
    ? `<a href="${REDMINE_BASE}${encodeURIComponent(r.redmine)}" target="_blank" rel="noopener">레드마인 #${esc(r.redmine)} 원문 ↗</a>`
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
          <label class="field" style="margin:0;max-width:200px">
            <span class="lab">상태</span>
            <select id="m-status">${statusSel}</select>
          </label>
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
  // 네비
  document.querySelectorAll('.nav button').forEach(b =>
    b.onclick = () => { state.view = b.dataset.view; state.submitted = null; render(); });

  if (state.view === 'cs' && !state.submitted) bindCS();
  if (state.view === 'cs' && state.submitted) bindConfirm();
  if (state.view === 'dashboard') bindDashboard();
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
      ? `원본 링크: <a href="${REDMINE_BASE}${encodeURIComponent(v)}" target="_blank" rel="noopener">${REDMINE_BASE}${esc(v)} ↗</a>`
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
    const rec = makeRecord(text, model.value, src, redmine.value.trim(), Date.now(), DB.seq);
    DB.records.push(rec); save(); clearDraft();
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
  $('#btn-godash').onclick = () => { state.submitted = null; state.view = 'dashboard'; render(); };
}

function bindDashboard() {
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
      r.reviewed = true;
    }
    if (r._pendingPri !== undefined) r.priority = r._pendingPri;
    delete r._pendingPri;
    r.pmMemo = $('#m-memo').value;
    r.pmStatus = $('#m-status').value;
    save();
    // 기존 오버레이 제거 후 단일 렌더 (render 말미에서 detailId가 있으면 드로어 1회 재생성)
    document.getElementById('overlay')?.remove();
    render();
    const msg = $('#saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => { const m = $('#saved-msg'); if (m) m.style.display = 'none'; }, 1400); }
  };
}

/* ---------- 드래프트 ---------- */
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } }
function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

/* ---------- 부트 ---------- */
window.addEventListener('hashchange', () => { readURL(); render(); });
readURL();
render();
