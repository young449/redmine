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
// VOC 유형 → 성격 기준 묶음
const TYPE_GROUPS = [
  { key: '기능·개선',     cls: 'g-feat', types: ['기능 요청', '앱 생태계', '성능·기술 요청'] },
  { key: '사용성·디자인', cls: 'g-ux',   types: ['UX 불만', '디자인 (HW/UXUI)'] },
  { key: '버그·결함',     cls: 'g-bug',  types: ['버그·오작동'] },
  { key: '글로벌',        cls: 'g-i18n', types: ['로컬라이제이션'] },
  { key: '비즈니스',      cls: 'g-biz',  types: ['가격·가치 인식'] }
];
const groupOfType = t => (TYPE_GROUPS.find(g => g.types.includes(t)) || {}).key || '기타';
const clsOfGroup = k => (TYPE_GROUPS.find(g => g.key === k) || {}).cls || 'g-etc';
const groupsOfRecord = r => [...new Set(effTypes(r).map(groupOfType))];
// 보드 목록에서 대표로 보여줄 묶음 우선순위 (버그가 가장 급함, 비즈니스는 기록형이라 마지막)
const GROUP_PRIORITY = ['버그·결함', '사용성·디자인', '기능·개선', '글로벌', '비즈니스'];
function primaryGroupChip(r) {
  const gs = groupsOfRecord(r);
  if (!gs.length) return '';
  const primary = GROUP_PRIORITY.find(g => gs.includes(g)) || gs[0];
  const more = gs.length - 1;
  return `<span class="chip grp ${clsOfGroup(primary)}">${esc(primary)}</span>${more > 0 ? `<span class="chip grp-more" title="카테고리 ${esc(gs.join(', '))}">+${more}</span>` : ''}`;
}
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
const modelsFor   = ws => ['공통', '브랜드 이슈', ...modelGroups(ws).flatMap(g => g.models), '기타'];
function modelOptionsHTML(ws, selected) {
  const opt = m => `<option ${m === selected ? 'selected' : ''}>${esc(m)}</option>`;
  return [opt('공통'), opt('브랜드 이슈')]
    .concat(modelGroups(ws).map(g => `<optgroup label="${esc(g.label)}">${g.models.map(opt).join('')}</optgroup>`))
    .concat([opt('기타')])
    .join('');
}

/* ---------- 팀 / 담당자 (담당자 1슬롯) ---------- */
const DEFAULT_TEAM = [
  { id: 'ellie',  en: 'Ellie',  ko: '이은영', role: 'UX' },
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
// 담당자 여러 명 → 아바타 겹쳐 표시 (최대 3 + 나머지 수)
function avatarStack(ids, size) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return avatarHTML(null, size);
  const shown = list.slice(0, 3).map(id => avatarHTML(id, size)).join('');
  const extra = list.length > 3 ? `<span class="ava-more" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">+${list.length - 3}</span>` : '';
  return `<span class="ava-stack">${shown}${extra}</span>`;
}
// 레드마인 티켓 원본 URL 패턴 (운영 시 실제 레드마인 주소로 교체)
const REDMINE_BASE = 'https://redmine.example.com/issues/';
const STATUSES = ['AI 분류', '분류 확정', '개발 요청', '디자인 요청', '완료', '반려'];
const statusClass = s => (s || '').replace(/\s/g, '');
const isConfirmed = r => !!r.pmStatus && r.pmStatus !== 'AI 분류';
const redmineBase = () => (DB && DB.redmineBase) || REDMINE_BASE;

const STORE_KEY = 'voc_console_v2';
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


/* ---------- 저장소 ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
  catch { return null; }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }

let DB;

// VOC 시드 데이터 (Redmine VoC 2026 분석 자료)
const REAL_VOC = [
  {
    "brand": "Activo",
    "model": "P1",
    "source": "국내",
    "redmine": "5193",
    "date": "2025-11-06",
    "st": "분류 확정",
    "summary": "스마트폰으로 Activo P1을 원격 제어할 수 있는 AK Connect 기능 추가 요청 (펌웨어 1.12 기준)",
    "types": [
      "기능 요청"
    ],
    "impact": "SW 전용",
    "body": "ACTIVO P1 - AK Connect기능 요청\n\n펌웨어 : 최신 (1.12)AK Connect처럼 핸드폰으로 Astellnkern ACTIVO P1 원격으로 콘트롤 할 수 있는 기능 추가 요청"
  },
  {
    "brand": "AK",
    "model": "PD10",
    "source": "국내",
    "redmine": "5199",
    "date": "2025-11-13",
    "st": "분류 확정",
    "summary": "USB 포트(하단)와 오디오 단자(상단) 위치 상충으로 인해 화면 회전 기능 추가 요청",
    "types": [
      "기능 요청"
    ],
    "impact": "SW 전용",
    "body": "PD10 관련 건의사항/요청- '화면 회전 기능'\n\nUSB포트가 하단에 위치하고, 3.5mm 및 4.4mm 단자는 상단에 위치하기 때문에\n화면 회전 기능이 새롭게 추가된다면 정말 유용하게 사용될 것 같습니다.\n이 부분은 정말 많은 사람들이 주로 이용하는 기능입니다.. 건의 올립니다."
  },
  {
    "brand": "AK",
    "model": "SR35",
    "source": "해외",
    "redmine": "5214",
    "date": "2025-11-24",
    "st": "완료",
    "summary": "반품 발생 — 케이스 모서리 날카로움, 소형 화면으로 슬라이더 조작 어려움, 확대 기능 부재, SoundCloud 미지원, 경쟁사 대비 가격 대비 기능 열위 지적",
    "types": [
      "UX 불만",
      "디자인 (HW/UXUI)",
      "앱 생태계",
      "가격·가치 인식"
    ],
    "impact": "SW+HW 복합",
    "body": "사용 피드백 공유\n\n해외에서 SR35 후기 메일이 접수되어 내용 공유드립니다.\n\n해당 고객은 구매했다가 안타깝게도 반품했다고 합니다.\n사유는 :\n기기 자체는 훌륭하고 음질도 정말 인상적입니다.\n하지만 케이스 디자인이 다소 아쉽습니다. 일부 모서리가 눈에 띄게 날카로워서 손에 쥐었을 때 불편함을 느끼거나, 모서리를 잡을 때 약간의 통증을 느낄 수 있습니다.\n\n반품의 주된 이유는 기능과 디스플레이입니다:\n\n화면이 매우 작습니다. 빨리 감기를 시도하면 슬라이더가 제대로 작동하지 않습니다. 크기가 작아서 손가락으로 슬라이더를 조작하기가 어렵습니다(저는 손이 작은 편입니다).\n화면이 작아서 글자를 읽기가 어렵습니다. 확대 기능도 없습니다. 그래서 기기를 조작하거나 읽을 때는 항상 돋보기를 써야 했습니다. 800달러 정도 하는 고해상도 플레이어의 일반적인 타겟층이 이러한 기기를 구매할 여유가 있는 40~50대라는 점을 고려하면 이는 놀라운 일입니다.\n가로/자동 모드에서는 슬라이더를 제대로 제어할 수 없고, 버튼을 사용하여 수동으로 빨리 감기도 할 수 없습니다.\nSoundCloud와 같은 앱은 다운로드가 지원되지 않습니다. SoundCloud는 무료 음악 스트리밍을 제공하고 특히 일렉트로닉, 레게, 힙합 등의 장르에서 가장 널리 사용되는 플랫폼 중 하나이기 때문에 이는 이해하기 매우 어렵습니다.\n또한 SoundCloud와 같은 방식으로 작동하도록 슬라이더를 재설계하는 것을 강력히 권장합니다. SoundCloud의 슬라이더는 매우 정교하여 사용자가 노래를 빠르게 탐색할 수 있고(슬라이더가 더 커서 손가락으로 잘 잡을 수 있음) 정밀하게 설정할 수 있습니다. 반면 SR35의 슬라이더는 활성화하기 어렵고 정확도가 매우 낮습니다.\n(빨리 감기) 버튼을 길게 누르면 빨리 감기가 가능하다는 점은 인정하지만, 속도가 너무 느립니다. 간단히 말해, 슬라이더의 사용성은 크게 개선되어야 합니다. 아이폰처럼 10초, 30초, 60초 간격으로 이동할 수 있는 버튼을 생각해 보셨나요?\n\n여기서 강력히 비판하고 싶습니다: 800달러라는 가격에 비해 디자인과 기능은 턱없이 부족합니다. 요즘 세상에서는 가장 저렴한 스마트폰(약 200달러)이나 표준 MP3 플레이어(100달러 이상)조차도 이러한 기본적인 기능들을 제공합니다. HiBy와 같은 경쟁사들은 R4와 같은 플레이어를 250달러에 판매하는데, 제 생각에는 거의 동일한 음질을 제공합니다. R4는 화면 회전이 가능하고, 모든 기능을 완벽하게 작동하며, SoundCloud도 지원합니다. 저는 R4를 테스트해 보고 결국 R4를 선택했습니다.\n\n소프트웨어 업데이트를 통해 이러한 문제들을 해결해 주시기를 강력히 권고드립니다. 만약 이러한 개선이 이루어진다면, 저는 기꺼이 다시 구매하겠습니다. 하지만 시장 조사와 요구 사항 분석이 실패했음이 분명합니다. 포럼의 많은 사용자들이 바로 이러한 점들에 대해 불평하고 있지만, 아무런 개선도 이루어지지 않았습니다.\n\n이러한 단점들을 해결해 주실지 궁금합니다. 해결해 주신다면, 저는 SR35를 가장 먼저 구매할 것입니다. 하지만 현재 상황으로는 Astell&Kern 제품을 제 포트폴리오에 포함하지 않을 것입니다. 음질은 훌륭하지만 기능은 시대에 뒤떨어지고 가격이 너무 비싼 것 같기 때문입니다. \"Astell&Kern이라는 것\"만으로 충분하다고 생각하는 것은 심각한 오류입니다. 고객들은 외면할 것입니다\n\n원문 내용도 첨부드립니다:"
  },
  {
    "brand": "AK",
    "model": "PD10",
    "source": "해외",
    "redmine": "5244",
    "date": "2025-12-12",
    "st": "분류 확정",
    "summary": "영국 고객이 날짜 형식(MM-DD-YYYY → DD-MM-YYYY) 및 영국식 영어 언어 옵션 추가 요청 (SR15에서는 지원되었다고 언급)",
    "types": [
      "로컬라이제이션"
    ],
    "impact": "SW 전용",
    "body": "영국식 날짜 형식&언어 변경/선택 요청\n\n문의/요청 내용:\n영국 고객께서 날짜 형식 및 언어(영어)를 미국식이 아닌 영국식으로도 선택할 수 있는 옵션을 요청합니다.\n\n번역:\n날짜 형식이 미국식인 MM-DD-YYYY로 되어 있는데, 저는 영국에 살고 있어서 이 형식이 맞지 않습니다.\n전 세계에서 사용하는 DD-MM-YYYY 형식으로 날짜 형식을 변경하려면 어떻게 해야 할까요?\n\n만약 변경이 불가능하다면, 모든 국가에서 미국식 형식을 사용하는 것은 아니므로 변경 기능을 추가할 수 있을까요?\n또한, 영어(영국식) 언어 옵션을 추가해 주시면 감사하겠습니다.\n\n예전에 사용했던 SR15 모델에서는 언어와 날짜 형식을 모두 영국식으로 설정할 수 있었습니다."
  },
  {
    "brand": "AK",
    "model": "SP4000",
    "source": "해외",
    "redmine": "5284",
    "date": "2026-01-09",
    "st": "분류 확정",
    "summary": "① 하단 Android 버튼 커스터마이징 ② 배터리 보호 충전 상한선 세분화(85/90/95/100%) ③ 기본 앱 숨기기·삭제 ④ Parametric EQ 고도화 요청",
    "types": [
      "기능 요청",
      "UX 불만"
    ],
    "impact": "SW 전용",
    "body": "펌웨어 업데이트시 개선 요청 사항\n\n번역본:\n해외 고객으로부터 추후 펌웨어 대해 몇 가지 제안 사항이 있어 내용 공유드립니다.\n\n- 설정에서 하단 Android 제어 버튼(앱 전환, 홈, VU, 뒤로 가기)을 사용자 지정할 수 있는 기능. VU 버튼을 앱 서랍으로 바꿀 수 있으면 좋을 것 같습니다. 앱 서랍 자체는 카드 형태가 아니므로 앱 전환 시 불필요한 터치를 줄일 수 있을 것입니다.\n\n- 배터리 보호 모드 설정을 더욱 세밀하게 조정할 수 있는 기능. 현재는 배터리 보호 기능을 사용하지 않거나 85%까지 충전하는 두 가지 옵션만 있습니다. 85%, 90%, 95%, 100%와 같은 옵션이 추가되면 좋을 것 같습니다. HDMI와 DAR을 활성화하면 배터리 소모가 매우 빠른 플레이어에서 80%에서 10%를 더 절약할 수 있다면 더욱 유용할 것입니다.\n\n- Android Auto, Tidal과 같은 기본 앱을 숨기거나 완전히 제거할 수 있는 기능\n\n- EQ 개선. parametric EQ는 매우 기본적인 기능만 제공하며, 전체 주파수 응답을 확인하고 원하는 곡선을 만들 수 없습니다. 타사에서 개발한 안드로이드 앱 중에는 더욱 세밀한 튜닝을 지원하는 앱들이 있지만, A&K 팀에서 직접 개발한 앱이 나온다면 정말 좋을 것 같습니다."
  },
  {
    "brand": "Activo",
    "model": "P1",
    "source": "국내",
    "redmine": "5443",
    "date": "2026-03-13",
    "st": "분류 확정",
    "summary": "Android 14 이상 업그레이드를 통해 Google Bit-Perfect API 지원 확대 및 USB 표준 오디오 경로의 비트퍼팩트 출력 가능 여부 요청",
    "types": [
      "기능 요청",
      "성능·기술 요청"
    ],
    "impact": "SW 전용",
    "body": "Activo P1에 대한 건의사항 내용 공유드립니다.\n\n액티보 P1에 대한 건의드립니다.\n현재, 해당 제품은 반드시 안드로이드 14이상 버전이 적용되어야 합니다.\n(안드로이드 14이상부터 구글에서 비트퍼팩트 API 지원)\n\n현재, 저는 안드로이드 16버전의 갤럭시에서 애플뮤직을 이용해서\nUSB C에 동글을 연결하여 px8 s2, pi8을 연결하여 음악을 듣고 있으며,\n\n소스기기 100% 출력 -> 동글, 음향기기로 볼륨 조절 하여\n듣고 있습니다. (다소, 핸드폰 특유의 불편함이 있음)\n\n그렇기 때문에 p1에 안드로이드 14이상의 버전이 적용되어\n똑같이 비트퍼팩트가 적용된다면, 그동안 aux로 만 지원 되던\n비트퍼팩트가 usb 표준 오디오로도 일부 지원이 되기 때문에\n기기의 성능 향상이 된다고 생각합니다.\n\n또한, 전문 음향기기로써 핸드폰에서 느끼던 불편한 점이 사라져서,\n좀 더 좋은 기기가 될 것이라고 생각하여, 해당 내용을 건의드립니다."
  },
  {
    "brand": "AK",
    "model": "SP4000",
    "source": "국내",
    "redmine": "5544",
    "date": "2026-04-01",
    "st": "분류 확정",
    "summary": "재생목록에 곡 추가 시 기본값이 '맨 아래'이며, '맨 위에 추가' 옵션 선택 기능이 없음 — 장기 사용자(SP2000~SP4000)의 지속 불편 사항",
    "types": [
      "UX 불만",
      "기능 요청"
    ],
    "impact": "SW 전용",
    "body": "재생목록에 곡 추가시 리스트에 맨 위로 추가 될 수 있는 옵션\n\nSP4000을 잘 사용중인데요\n\nSP2000, SP2000T, SP3000, SP3000T 등등\n그동안 아스텔앤컨 제품을 써 오면서 불편한 점에 대해 개선 요청드립니다.\n\n새로운 곡을 재생목록에 추가시 항상 맨 아래에 추가됩니다.\n뭔가 새로운 곡을 추가 할 때는 새로운곡이니까 리스트에서 제일 먼저 들어보고 싶은데 리스트 맨 아래에 추가되어\n매번 맨 위로 올려야 하는 번거로움이 있습니다.\n물론 기존 리스트가 있으니까 맨 아래에 추가 될 수 도 있으니\n환경설정에서 재생목록에 추가 시 리스트 맨 위에 추가 하는 선택옵션도 만들어 주셨으면 합니다.\n-----\n요청드린 방법은\n1) 최근 추가목록에서 추가된 곡 선택\n2) 재생목록 담기에서 제가 기존 만들어 놓은 재생목록 선택\n3) 재생목록에 보면 제가 담은 곡이 맨 아래에 가 있습니다.\n\n이렇게 맨 아래가 있는게 아니라 맨 위에 추가될 수 있는 옵션을 추가 부탁드립니다."
  },
  {
    "brand": "AK",
    "model": "공통",
    "source": "해외",
    "redmine": "5610",
    "date": "2026-04-13",
    "st": "분류 확정",
    "summary": "가사 없음 상태에서 'Lyrics is empty' 문법 오류 + 빨간색 텍스트 표시로 오류처럼 인식됨 — 메시지 제거 또는 교정 요청",
    "types": [
      "로컬라이제이션",
      "UX 불만",
      "디자인 (HW/UXUI)"
    ],
    "impact": "SW 전용",
    "body": "AK DAP - 사용자 인터페이스(UI)의 문법 수정 제안\n\n해외 고객으로부터 접수된 UI 문구 및 디자인 개선 제안 내용을 공유드립니다.\n\n고객은 현재 가사 부재 시 출력되는 메시지의 문법적 오류와 시각적 부정적 인상을 지적하며 개선 방향을 제시했습니다.\n아래 내용 참고 바랍니다.\n\n번역본:\n\"지금 재생 중\" 화면에서 앨범 아트를 클릭하면, 아트와 함께 다음과 같은 메시지가 표시됩니다.\n\n\"Lyrics is empty\"\n이는 문법적으로 틀린 표현이며, *\"Lyrics are empty\"*가 올바른 표현입니다.\n\n더 중요한 점은, 이 메시지가 빨간색 텍스트로 표시되어 마치 오류처럼 보인다는 것입니다. 이는 사용자에게 유용하지도 않고 미관상 좋지도 않습니다.\n가장 우아한 해결 방법은 이 시점에 아무런 메시지도 띄우지 않는 것입니다. 그저 앨범 페이지만 깔끔하게 보여주는 것이 훨씬 보기 좋습니다."
  }
];
function seed() {
  let seq = 0;
  const records = REAL_VOC.map(v => {
    seq += 1;
    const ts = new Date(v.date + 'T09:00:00').getTime() + seq * 60000;
    return makeRecord(v.brand, v.body, v.model, v.source, v.redmine, ts, seq, {
      status: v.st, aiSummary: v.summary, aiTypes: v.types, aiImpact: v.impact
    });
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
    ol.id = 'ellie'; ol.en = 'Ellie'; ol.ko = '이은영';
    DB.records.forEach(r => { if (r.assignee === 'olivia') r.assignee = 'ellie'; });
    if (DB.me === 'olivia') DB.me = 'ellie';
    changed = true;
  }
  const el = DB.team.find(m => m.id === 'ellie');
  if (el && !el.ko) { el.ko = '이은영'; changed = true; }
  if (!DB.me) { DB.me = DB.team[0] ? DB.team[0].id : 'ellie'; changed = true; }
  DB.team.forEach(m => { if (m.role === '개발') { m.role = 'Dev'; changed = true; } });
  if (!DB.notifs) { DB.notifs = []; changed = true; }
  if (!DB.redmineBase) { DB.redmineBase = REDMINE_BASE; changed = true; }
  DB.records.forEach(r => {
    if (!r.brand) { r.brand = 'AK'; changed = true; }
    if (!('assignee' in r)) { r.assignee = null; changed = true; }
    if (!Array.isArray(r.assignees)) { r.assignees = r.assignee ? [r.assignee] : []; changed = true; }
    if (!Array.isArray(r.comments)) { r.comments = []; changed = true; }
    if (r.model === '공통 / 브랜드 이슈') { r.model = '공통'; changed = true; }
    if (!('reviewedAt' in r)) { r.reviewedAt = r.reviewed ? r.createdAt : null; changed = true; }
    if (r.pmStatus === '검토중') { r.pmStatus = r.reviewed ? '분류 확정' : 'AI 분류'; changed = true; }
    r.reviewed = isConfirmed(r);
    if (!Array.isArray(r.statusHistory)) {
      r.statusHistory = [{ status: 'AI 분류', at: r.createdAt }];
      if (r.pmStatus && r.pmStatus !== 'AI 분류') r.statusHistory.push({ status: r.pmStatus, at: r.createdAt + 6e6 });
      changed = true;
    }
  });
  if (changed) save();
}

function makeRecord(brand, body, model, source, redmine, ts, seq, opts) {
  opts = opts || {};
  const ai = heuristicClassify(body);
  const createdAt = ts || Date.now();
  const status = opts.status || 'AI 분류';
  const history = [{ status: 'AI 분류', at: createdAt }];
  if (status !== 'AI 분류') history.push({ status, at: createdAt + 6e6 });
  return {
    id: 'V' + String(seq).padStart(4, '0'),
    seq, brand: brand || 'AK', createdAt,
    body, model: model || '공통', source: source || '국내',
    redmine: redmine || '',
    aiSummary: opts.aiSummary || heuristicSummary(body),
    aiTypes: opts.aiTypes || ai.types, aiImpact: opts.aiImpact || ai.impact, aiEmotion: ai.emotion,
    // 사람 보정 값 (없으면 AI값 사용)
    types: null, impact: null, emotion: null,
    reviewed: status !== 'AI 분류', reviewedAt: status !== 'AI 분류' ? createdAt + 3e6 : null,
    priority: opts.priority || null,
    assignee: opts.assignee || null,
    assignees: opts.assignee ? [opts.assignee] : [],
    comments: [],
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
  view: 'dashboard',          // 'dashboard' | 'board' | 'report' | 'settings' | 'cs'
  reportPeriod: 'h1',    // 'month' | 'quarter' | 'year'
  calTab: 'intake',           // 'intake' | 'gantt'
  dashYear: null,             // 월별 차트 연도 필터
  filters: { group: '', impact: '', source: '', status: '', model: '', assignee: '', q: '' },
  sort: 'desc',               // 날짜 정렬: 'desc' 최신순 | 'asc' 오래된순
  boardView: 'table',         // 보드 표시: 'table' | 'card'
  detailId: null,
  submitted: null,
};
const WS_KEY = 'voc_console_ws';
const VIEWS = ['dashboard', 'board', 'report', 'settings', 'cs', 'detail'];

// 현재 워크스페이스(브랜드)에 속한 레코드만
const wsRecords = () => DB.records.filter(r => (r.brand || 'AK') === state.workspace);

/* ---------- 알림 (로컬 시뮬레이션 — 멀티유저는 추후 백엔드) ---------- */
const NOTIF_TITLES = { new: '새 VOC', mention: '댓글 멘션', status: '상태 변경', route: '처리 전달', assign: '담당 배정' };
const notifTitle = k => NOTIF_TITLES[k] || '알림';
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
  state.filters.group   = h.get('group') || '';
  state.filters.status  = h.get('status') || '';
  state.filters.impact  = h.get('impact') || '';
  state.filters.source  = h.get('source') || '';
  state.filters.model   = h.get('model') || '';
  state.filters.assignee = h.get('assignee') || '';
  state.filters.q       = h.get('q') || '';
  if (state.view === 'detail') {
    state.detailId = h.get('id') || null;
    if (!state.detailId) state.view = 'dashboard';
  }
}
function writeURL() {
  const h = new URLSearchParams();
  h.set('ws', state.workspace);
  h.set('view', state.view);
  if (state.view === 'calendar') h.set('tab', state.calTab);
  if (state.view === 'detail' && state.detailId) h.set('id', state.detailId);
  const f = state.filters;
  if (f.group) h.set('group', f.group);
  if (f.status) h.set('status', f.status);
  if (f.impact) h.set('impact', f.impact);
  if (f.source) h.set('source', f.source);
  if (f.model) h.set('model', f.model);
  if (f.assignee) h.set('assignee', f.assignee);
  if (f.q) h.set('q', f.q);
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
  if (state.view === 'detail') root.innerHTML = renderDetailPage();
  else if (state.view === 'cs') root.innerHTML = state.submitted ? renderConfirm() : renderCS();
  else if (state.view === 'board') root.innerHTML = renderBoard();
  else if (state.view === 'report') root.innerHTML = renderReport();
  else if (state.view === 'settings') root.innerHTML = renderSettings();
  else root.innerHTML = renderDashboard();
  bind();
  updateWS();
  updateBell();
  if (state.view === 'detail') {
    const r = DB.records.find(x => x.id === state.detailId);
    if (r) bindDetailPage(r);
  }
}

const wsCode = w => (w === 'Activo' ? 'Av' : 'AK');
function updateWS() {
  const isAK = state.workspace === 'AK';
  const ava = document.getElementById('ws-ava');
  if (ava) { ava.textContent = wsCode(state.workspace); ava.className = 'ws-ava ' + state.workspace; }
  const name = document.getElementById('ws-name');
  if (name) name.textContent = WORKSPACE_LABEL[state.workspace];
  const brand = document.querySelector('.appbar-brand');
  if (!brand) return;
  if (state.view === 'detail') {
    const r = DB.records.find(x => x.id === state.detailId);
    const badge = r ? `<span class="status-tag ${statusClass(r.pmStatus)} status-badge" id="m-status-badge"><span class="bdot"></span>${esc(r.pmStatus)}</span>` : '';
    brand.innerHTML = `<span class="appbar-voc">${r ? esc(r.id) : ''}</span>${badge}`;
  } else {
    brand.innerHTML = `<img id="appbar-logo" class="appbar-logo" alt="대시보드로 이동" title="대시보드">`;
    const abLogo = document.getElementById('appbar-logo');
    if (abLogo) {
      abLogo.src = isAK ? 'logo-ak.png' : 'logo-activo-dark.png';
      abLogo.onclick = () => { state.view = 'dashboard'; state.detailId = null; render(); };
    }
  }
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
  const modelOpts = modelOptionsHTML(state.workspace, d.model);
  return `
  <div class="page-head">
    <h1>VOC 입력</h1>
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
          <div class="hint">특정 모델 문의가 아니면 “공통”을 선택하세요.</div>
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
  const f = state.filters;
  let list = scoped.slice().sort((a, b) => state.sort === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  if (f.group)   list = list.filter(r => groupsOfRecord(r).includes(f.group));
  if (f.status)  list = list.filter(r => r.pmStatus === f.status);
  if (f.impact)  list = list.filter(r => effImpact(r) === f.impact);
  if (f.source)  list = list.filter(r => r.source === f.source);
  if (f.model)   list = list.filter(r => r.model === f.model);
  if (f.assignee) list = list.filter(r => (r.assignees || []).includes(f.assignee));
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(r => {
      const names = (r.assignees || []).map(id => { const m = member(id); return m ? (m.en + (m.ko || '') + (m.role || '')) : ''; }).join(' ');
      return (r.body + r.aiSummary + r.id + r.redmine + ' ' + names).toLowerCase().includes(q);
    });
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
  const open = recs.filter(r => r.pmStatus !== '완료' && r.pmStatus !== '반려').length;
  const done = recs.filter(r => r.pmStatus === '완료').length;
  const requested = recs.filter(r => r.pmStatus === '개발 요청' || r.pmStatus === '디자인 요청').length;

  const closedTs = r => lastEntered(r, '완료') || lastEntered(r, '반려');
  const opened30 = recs.filter(r => r.createdAt >= now - D).length;
  const closed30 = recs.filter(r => { const t = closedTs(r); return t != null && t >= now - D; }).length;
  const d = {
    total: deltaBy(r => r.createdAt),
    open: opened30 - closed30,
    done: deltaBy(r => lastEntered(r, '완료')),
    dev: deltaBy(r => lastEntered(r, '개발 요청') || lastEntered(r, '디자인 요청')),
  };
  const delta = v => {
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '·';
    const sign = v > 0 ? '+' : '';
    return `<div class="delta ${cls}"><span class="ar">${arrow}</span> ${sign}${v} <span class="dl">지난 30일</span></div>`;
  };
  return `
  <div class="dash-stats">
    <div class="card stat"><div class="l">전체 VOC</div><div class="n">${total}</div>${delta(d.total)}</div>
    <div class="card stat"><div class="l">요청 (개발·디자인)</div><div class="n">${requested}</div>${delta(d.dev)}</div>
    <div class="card stat"><div class="l">처리 완료</div><div class="n">${done}</div>${delta(d.done)}</div>
    <div class="card stat"><div class="l">미처리</div><div class="n">${open}</div>${delta(d.open)}</div>
  </div>`;
}

/* ===== 대시보드 (읽기 전용 파악용) ===== */
function renderDashboard() {
  const recs = wsRecords();

  // 연도 옵션 + 선택
  const years = [...new Set(recs.map(r => new Date(r.createdAt).getFullYear()))];
  const curYear = new Date().getFullYear();
  [curYear, curYear - 1].forEach(y => { if (!years.includes(y)) years.push(y); });
  years.sort((a, b) => b - a);
  if (state.dashYear == null || !years.includes(state.dashYear)) state.dashYear = years.includes(curYear) ? curYear : years[0];
  const yearSel = `<select class="year-sel" id="dash-year">${years.map(y => `<option value="${y}" ${y === state.dashYear ? 'selected' : ''}>${y}년</option>`).join('')}</select>`;

  // 상태 분포 (블록형 — 좁은 칼럼을 꽉 채움)
  const statuses = STATUSES;
  const statusTotal = Math.max(1, recs.length);
  const statusRows = `<div class="status-blocks">` + statuses.map(s => {
    const cls = s.replace(/\s/g, '');
    const n = recs.filter(r => r.pmStatus === s).length;
    const pct = Math.round((n / statusTotal) * 100);
    return `<div class="sblock" data-statusfilter="${esc(s)}" role="button" title="이 상태의 VOC 보드로 이동">
      <div class="sb-top"><span class="status-tag ${cls}">${esc(s)}</span><span class="sb-pct">${pct}%</span></div>
      <div class="sb-n">${n}<span>건</span></div>
      <div class="track lg"><div class="fill ${cls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') + `</div>`;

  // 최근 추가된 VOC (프로필 아바타 포함)
  const recent = recs.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentBody = recent.length ? `<div class="recent-list">${recent.map(r => `
    <div class="recent-item" data-open="${r.id}">
      <div class="ri-text">
        <div class="ri-top"><span class="recv-no">${esc(r.id)}</span>${primaryGroupChip(r)}<span class="status-tag ${statusClass(r.pmStatus)}">${esc(r.pmStatus)}</span></div>
        <div class="ri-sum">${esc(r.aiSummary)}</div>
      </div>
      ${avatarStack(r.assignees, 32)}
    </div>`).join('')}</div>` : '<div class="empty-mini">아직 등록된 VOC가 없습니다.</div>';

  return `
  <div class="page-head row" style="justify-content:flex-end">
    <div class="head-actions">
      <button class="btn" type="button" data-act="export">⤓ Export</button>
      <button class="btn primary" type="button" data-view="cs">＋ VOC 추가</button>
    </div>
  </div>
  ${statsCards(recs)}
  <div class="dash-grid-main">
    <div class="card panel monthly-card">
      <div class="panel-h">월별 VOC ${yearSel}</div>
      ${monthlyLine(recs, state.dashYear)}
    </div>
    <div class="card panel">
      <div class="panel-h">유형 분포 <span class="muted-s">AI 분류 포함</span></div>
      ${typeDonut(recs)}
    </div>
  </div>
  <div class="dash-grid">
    <div class="card panel">
      <div class="panel-h">상태 분포</div>
      ${statusRows}
    </div>
    <div class="card panel">
      <div class="panel-h">최근 추가된 VOC</div>
      ${recentBody}
    </div>
  </div>`;
}

/* 유형 분포 — 도넛 (무채색 그라데이션) */
function typeDonut(recs) {
  const data = TYPES.map(t => ({ t, n: recs.filter(r => effTypes(r).includes(t)).length }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const total = data.reduce((s, x) => s + x.n, 0);
  if (!total) return '<div class="empty-mini">데이터 없음</div>';
  // 브랜드 파운데이션 팔레트 (레드/크림슨 제외)
  const GRAY = ['#1F47CD', '#008FFF', '#00BEC9', '#00B17D', '#00AD2C', '#FFBB00', '#4389B9', '#94C2DA'];
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
    const c1x = p1.x + (p2.x - p0.x) / 6, c2x = p2.x - (p3.x - p1.x) / 6;
    // 제어점 y를 구간 두 점 사이로 제한해 곡선이 점 밖으로 튀지(오버슈트) 않게 → 0 바닥 아래로 안 처짐
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
    const clampY = v => Math.max(lo, Math.min(hi, v));
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
function monthlyLine(recs, year) {
  year = year || new Date().getFullYear();
  const months = [];
  for (let m = 0; m < 12; m++) months.push({ m, label: (m + 1), n: 0 });
  recs.forEach(r => {
    const d = new Date(r.createdAt);
    if (d.getFullYear() === year) months[d.getMonth()].n += 1;
  });
  const max = Math.max(1, ...months.map(x => x.n));
  const W = 760, H = 200, padX = 24, padTop = 28, padBot = 30;
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

/* ===== VOC 보드 ===== */
function renderVOCTable(list) {
  const rows = list.map(r => {
    const cls = r.pmStatus.replace(/\s/g, '');
    const groups = primaryGroupChip(r);
    return `<tr data-open="${r.id}">
      <td class="t-id">${esc(r.id)}</td>
      <td class="t-sum">${esc(r.aiSummary)}</td>
      <td>${groups}</td>
      <td><span class="status-tag ${cls}">${esc(r.pmStatus)}</span></td>
      <td>${avatarStack(r.assignees, 24)}</td>
      <td class="t-date">${fmtDate(r.createdAt)}</td>
    </tr>`;
  }).join('');
  return `<div class="card table-wrap"><table class="voc-table">
    <colgroup><col style="width:104px"><col><col style="width:150px"><col style="width:96px"><col style="width:104px"><col style="width:92px"></colgroup>
    <thead><tr><th>접수번호</th><th>요약</th><th>카테고리</th><th>상태</th><th>담당자</th><th>날짜</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderBoard() {
  const list = visibleRecords();
  const f = state.filters;
  const anyFilter = !!(f.group || f.status || f.impact || f.source || f.model || f.assignee || f.q);

  const actionRow = `
  <div class="board-actions">
    <div class="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" id="f-q" placeholder="요약·접수번호·담당자 검색" value="${esc(f.q)}">
    </div>
    <div class="spacer"></div>
    <div class="head-actions">
      <button class="btn" type="button" data-act="export">⤓ Export</button>
      <button class="btn primary" type="button" data-view="cs">＋ VOC 추가</button>
    </div>
  </div>`;

  const filterRow = `
  <div class="card toolbar">
    <div class="grp">${selectFilter('group', f.group, TYPE_GROUPS.map(g => g.key), '카테고리')}</div>
    <div class="grp">${selectFilter('status', f.status, STATUSES, '상태')}</div>
    <div class="grp">${selectFilter('impact', f.impact, IMPACTS, '영향범위')}</div>
    <div class="grp">${selectFilter('model', f.model, modelsFor(state.workspace), '모델')}</div>
    <div class="grp"><span class="lab">담당자</span><select data-filter="assignee"><option value="">전체</option>${team().map(m => `<option value="${esc(m.id)}" ${f.assignee === m.id ? 'selected' : ''}>${esc(m.en)}${m.ko ? ' ' + esc(m.ko) : ''}</option>`).join('')}</select></div>
    <div class="grp"><span class="lab">정렬</span><select id="f-sort"><option value="desc" ${state.sort === 'desc' ? 'selected' : ''}>최신순</option><option value="asc" ${state.sort === 'asc' ? 'selected' : ''}>오래된순</option></select></div>
  </div>`;

  const body = !list.length
    ? `<div class="card empty"><div class="big">조건에 맞는 VOC가 없습니다</div><div>필터를 변경하거나 ＋ VOC 추가로 새 VOC를 등록하세요.</div></div>`
    : renderVOCTable(list);

  return `
  ${actionRow}
  ${filterRow}
  <div class="result-count">${esc(WORKSPACE_LABEL[state.workspace])} · <b>${list.length}</b>건${anyFilter ? ' <span class="muted-s">(필터 적용됨)</span>' : ''}</div>
  ${body}`;
}

/* ===== 리포트 (기간 요약 · 카테고리 · 처리 추이 · 오래 묵은 VOC) ===== */
function renderReport() {
  const recs = wsRecords();
  const now = Date.now();
  const d = new Date(now);
  const period = ['h1', 'h2', 'year'].includes(state.reportPeriod) ? state.reportPeriod : (d.getMonth() < 6 ? 'h1' : 'h2');
  const yy = d.getFullYear() % 100;
  let start, end, periodLabel;
  if (period === 'year') {
    start = new Date(d.getFullYear(), 0, 1).getTime();
    end = new Date(d.getFullYear() + 1, 0, 1).getTime();
    periodLabel = `${yy}년 전체`;
  } else if (period === 'h2') {
    start = new Date(d.getFullYear(), 6, 1).getTime();
    end = new Date(d.getFullYear() + 1, 0, 1).getTime();
    periodLabel = `${yy}년 하반기`;
  } else {
    start = new Date(d.getFullYear(), 0, 1).getTime();
    end = new Date(d.getFullYear(), 6, 1).getTime();
    periodLabel = `${yy}년 상반기`;
  }
  const lastAt = (r, s) => { const h = (r.statusHistory || []).filter(x => x.status === s); return h.length ? h[h.length - 1].at : null; };
  const closedAt = r => lastAt(r, '완료') || lastAt(r, '반려');

  const intake = recs.filter(r => r.createdAt >= start && r.createdAt < end).length;
  const completed = recs.filter(r => { const t = lastAt(r, '완료'); return t != null && t >= start && t < end; }).length;
  const open = recs.filter(r => r.pmStatus !== '완료' && r.pmStatus !== '반려').length;
  const closedInPeriod = recs.filter(r => { const t = closedAt(r); return t != null && t >= start && t < end; });
  const avgDays = closedInPeriod.length
    ? Math.round(closedInPeriod.reduce((s, r) => s + (closedAt(r) - r.createdAt) / 864e5, 0) / closedInPeriod.length)
    : null;

  // 직전 기간 대비
  let prevStart;
  if (period === 'h2') prevStart = new Date(d.getFullYear(), 0, 1).getTime();
  else if (period === 'year') prevStart = new Date(d.getFullYear() - 1, 0, 1).getTime();
  else prevStart = new Date(d.getFullYear() - 1, 6, 1).getTime();
  const intakePrev = recs.filter(r => r.createdAt >= prevStart && r.createdAt < start).length;
  const completedPrev = recs.filter(r => { const t = lastAt(r, '완료'); return t != null && t >= prevStart && t < start; }).length;
  const closedPrev = recs.filter(r => { const t = closedAt(r); return t != null && t >= prevStart && t < start; });
  const avgPrev = closedPrev.length ? Math.round(closedPrev.reduce((s, r) => s + (closedAt(r) - r.createdAt) / 864e5, 0) / closedPrev.length) : null;
  const avgDelta = (avgDays != null && avgPrev != null) ? avgDays - avgPrev : null;
  const pword = period === 'year' ? '전년' : '직전 반기';
  const delta = (v, label, unit) => {
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '·';
    const sign = v > 0 ? '+' : '';
    return `<div class="delta ${cls}"><span class="ar">${arrow}</span> ${sign}${v}${unit || ''} <span class="dl">${label}</span></div>`;
  };
  const neutral = text => `<div class="delta flat"><span class="dl">${text}</span></div>`;

  const periodRecs = recs.filter(r => r.createdAt >= start && r.createdAt < end);
  const rate = periodRecs.length ? Math.round(periodRecs.filter(r => r.pmStatus === '완료').length / periodRecs.length * 100) : null;
  const prevRecs = recs.filter(r => r.createdAt >= prevStart && r.createdAt < start);
  const prevRate = prevRecs.length ? Math.round(prevRecs.filter(r => r.pmStatus === '완료').length / prevRecs.length * 100) : null;
  const rateDelta = (rate != null && prevRate != null) ? rate - prevRate : null;
  const over30 = recs.filter(r => r.pmStatus !== '완료' && r.pmStatus !== '반려' && (now - r.createdAt) / 864e5 >= 30).length;
  const cats = TYPE_GROUPS.map(g => ({ key: g.key, cls: g.cls, n: periodRecs.filter(r => groupsOfRecord(r).includes(g.key)).length }));
  const maxCat = Math.max(1, ...cats.map(c => c.n));

  const months = [];
  for (let m = 0; m < 12; m++) months.push(new Date(d.getFullYear(), m, 1));
  const monthData = months.map(m => {
    const ms = m.getTime(), me = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();
    return {
      label: (m.getMonth() + 1) + '월',
      inN: recs.filter(r => r.createdAt >= ms && r.createdAt < me).length,
      doneN: recs.filter(r => { const t = lastAt(r, '완료'); return t != null && t >= ms && t < me; }).length,
    };
  });
  const maxM = Math.max(1, ...monthData.flatMap(x => [x.inN, x.doneN]));

  const aging = recs.filter(r => r.pmStatus !== '완료' && r.pmStatus !== '반려')
    .map(r => ({ r, days: Math.floor((now - r.createdAt) / 864e5) }))
    .sort((a, b) => b.days - a.days).slice(0, 5);

  const periodSel = `<select id="rp-period" style="width:auto">
    <option value="h1" ${period === 'h1' ? 'selected' : ''}>${yy}년 상반기</option>
    <option value="h2" ${period === 'h2' ? 'selected' : ''}>${yy}년 하반기</option>
    <option value="year" ${period === 'year' ? 'selected' : ''}>${yy}년 전체</option>
  </select>`;

  const CAT_PAL = ['#1F47CD', '#00BEC9', '#00B17D', '#FFBB00', '#4389B9', '#008FFF', '#00AD2C', '#94C2DA'];
  const catBars = cats.map((c, i) => `
    <div class="rp-bar-row">
      <span class="rp-bar-lab">${esc(c.key)}</span>
      <span class="rp-track"><span class="rp-fill" style="width:${Math.round(c.n / maxCat * 100)}%;background:${CAT_PAL[i % CAT_PAL.length]}"></span></span>
      <span class="rp-bar-n">${c.n}</span>
    </div>`).join('');

  const trendBars = monthData.map(m => `
    <div class="rp-mcol">
      <div class="rp-mbars">
        <span class="rp-mb in" style="height:${Math.round(m.inN / maxM * 100)}%" title="접수 ${m.inN}"></span>
        <span class="rp-mb done" style="height:${Math.round(m.doneN / maxM * 100)}%" title="완료 ${m.doneN}"></span>
      </div>
      <span class="rp-mlab">${m.label}</span>
    </div>`).join('');

  const agingRows = aging.length ? aging.map(({ r, days }) => `
    <div class="rp-age-row" data-open="${esc(r.id)}">
      <span class="rp-age-id">${esc(r.id)}</span>
      <span class="rp-age-sum">${esc(r.aiSummary || r.body || '')}</span>
      <span class="status-tag ${statusClass(r.pmStatus)}">${esc(r.pmStatus)}</span>
      <span class="rp-age-days ${days >= 30 ? 'hot' : ''}">${days}일</span>
    </div>`).join('') : '<div class="empty-mini" style="padding:14px 0">미해결 VOC가 없습니다.</div>';

  return `
  <div class="page-head row" style="justify-content:flex-end">
    <div class="head-actions">
      ${periodSel}
      <button class="btn" type="button" data-act="export">⤓ 내보내기</button>
    </div>
  </div>

  <div class="dash-stats rp-stats">
    <div class="card stat"><div class="l">평균 처리일</div><div class="n">${avgDays == null ? '–' : avgDays + '일'}</div>${avgDelta == null ? neutral('비교 데이터 없음') : delta(avgDelta, pword + ' 대비', '일')}</div>
    <div class="card stat"><div class="l">완료율</div><div class="n">${rate == null ? '–' : rate + '%'}</div>${rateDelta == null ? neutral('비교 데이터 없음') : delta(rateDelta, pword + ' 대비', '%p')}</div>
    <div class="card stat"><div class="l">30일+ 미처리</div><div class="n">${over30}</div>${neutral('미해결 ' + open + '건 중')}</div>
  </div>

  <div class="rp-grid">
    <div class="card panel">
      <div class="panel-h">카테고리 분포 <span class="muted-s">${periodLabel} 접수 기준</span></div>
      <div class="rp-bars">${catBars}</div>
    </div>
    <div class="card panel">
      <div class="panel-h">월별 접수·완료 <span class="rp-legend"><span class="dot in"></span>접수 <span class="dot done"></span>완료</span></div>
      <div class="rp-trend">${trendBars}</div>
    </div>
  </div>

  <div class="card panel">
    <div class="panel-h">미해결 VOC <span class="muted-s">경과일 순</span></div>
    <div class="rp-age">${agingRows}</div>
  </div>`;
}

function bindReport() {
  const sel = document.getElementById('rp-period');
  if (sel) sel.onchange = () => { state.reportPeriod = sel.value; render(); };
  document.querySelectorAll('.rp-age-row[data-open]').forEach(row =>
    row.onclick = () => { state.detailId = row.dataset.open; state.view = 'detail'; render(); });
}

/* ===== 캘린더 (접수 히트맵 / 작업 기간 간트) ===== */
function renderCalendar() {
  const recs = wsRecords();
  const tab = state.calTab === 'gantt' ? 'gantt' : 'intake';
  const head = `
  <div class="page-head row" style="justify-content:flex-start">
    <div class="cal-tabs">
      <button type="button" data-caltab="intake" class="${tab === 'intake' ? 'on' : ''}">접수 히트맵</button>
      <button type="button" data-caltab="gantt" class="${tab === 'gantt' ? 'on' : ''}">작업 기간 (간트)</button>
    </div>
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
    const doneAt = lastEntered(r, '완료') || lastEntered(r, '반려');
    const devAt = lastEntered(r, '개발 요청') || lastEntered(r, '디자인 요청');
    const end = doneAt || now;
    const left = pct(r.createdAt);
    const width = Math.max(2, pct(end) - left);
    const cls = r.pmStatus.replace(/\s/g, '');
    const devMark = devAt ? `<span class="gmark" style="left:${pct(devAt)}%" title="요청 ${fmtDate(devAt)}"></span>` : '';
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
    <div class="roster-row" draggable="true" data-mid="${esc(m.id)}">
      <div class="rr-role"><span class="role-chip ${esc(m.role)}">${esc(m.role)}</span></div>
      <div class="rr-main">${avatarHTML(m.id, 28)}<span class="rr-name"><b>${esc(m.en)}</b>${m.ko ? ' ' + esc(m.ko) : ''}</span></div>
      <div class="rr-del"><button class="btn ghost sm" data-rm="${esc(m.id)}">삭제</button></div>
      <div class="rr-grip" title="드래그해서 순서 변경" aria-label="순서 이동"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg></div>
    </div>`).join('');

  return `
  <div class="page-head"><h1>Setting</h1><p>담당자 명단·연동을 관리합니다.</p></div>

  <div class="set-stack">
    <div class="card panel">
      <div class="panel-h">담당자 명단</div>
      <div class="roster-wrap"><div class="roster">${rows}</div></div>
      <div class="add-member">
        <div class="role-dd" id="nm-role-dd" data-role="UX">
          <button type="button" class="role-dd-btn" id="nm-role-btn"><span class="role-chip UX">UX</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="role-dd-menu" id="nm-role-menu" hidden>
            ${['UX', 'UI', 'PM', 'Dev', 'CS'].map(rr => `<button type="button" data-r="${rr}"><span class="role-chip ${rr}">${rr}</span></button>`).join('')}
          </div>
        </div>
        <input type="text" id="nm-en" placeholder="영문 (Hong)">
        <input type="text" id="nm-ko" placeholder="한글 (홍길동)">
        <button class="btn primary" id="nm-add">추가</button>
      </div>
      <div class="hint">아바타는 영문 첫 글자로 자동 생성됩니다.</div>
    </div>

    <div class="card panel">
      <div class="panel-h">분석 데이터 가져오기</div>
      <p style="margin:0 0 10px;color:var(--muted);font-size:13px">ChatGPT·Claude로 분류·요약한 VOC 엑셀(.xlsx)을 불러옵니다. <b>요약·유형·영향범위·출처</b>를 그대로 AI 결과로 사용하고, 레드마인 번호가 같은 건은 건너뜁니다.<br>빈 양식을 내려받아 같은 형식으로 채운 뒤 올리세요. (유형은 “ / ”로 복수 입력)</p>
      <div class="rm-row">
        <input type="file" id="imp-file" accept=".xlsx,.xls">
        <button class="btn" id="imp-tpl">양식</button>
        <button class="btn primary" id="imp-run">가져오기</button>
      </div>
      <div class="hint" id="imp-msg">양식 컬럼: No. / 날짜 / Model / 제목 / 내용 / 고객 출처 / VoC유형 / 영향 범위 / 요약</div>
    </div>

    <div class="card panel">
      <div class="panel-h">레드마인 연동</div>
      <div class="rm-row">
        <input type="text" id="rm-base" value="${esc(redmineBase())}" placeholder="https://redmine.example.com/issues/">
        <button class="btn primary" id="rm-save">저장</button>
      </div>
      <div class="hint" id="rm-note">티켓 번호를 붙여 원본 링크를 만듭니다.</div>
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
  const groupChips = primaryGroupChip(r);
  const typeChips = types.map(t => `<span class="chip type">${esc(t)}</span>`).join('');
  const pri = r.priority
    ? `<span class="pri ${r.priority}">${r.priority}</span>`
    : `<span class="pri none">우선순위 −</span>`;
  const status = `<span class="status-tag ${r.pmStatus.replace(/\s/g, '')}">${esc(r.pmStatus)}</span>`;

  return `
  <div class="card voc" data-open="${r.id}">
    <div class="col-id">
      <div class="recv-no">${esc(r.id)}</div>
      ${status}
    </div>
    <div class="col-body">
      <div class="ai-summary">
        <span class="ai-tag">${warnIcon()} AI 요약</span>
        ${esc(r.aiSummary)}
      </div>
      <div class="chips">
        ${groupChips}${typeChips}
      </div>
    </div>
    <div class="col-meta">
      ${pri}
      <div class="assignee">${avatarStack(r.assignees, 24)}</div>
    </div>
  </div>`;
}

/* ===== 상세 드로어 ===== */
/* 상세 폼 섹션들 — 전용 페이지에서 2단 배치 (동일 ID 재사용) */
/* 댓글 @멘션 — 본문 강조 + 멘션된 팀원 추출 */
function renderCommentText(text) {
  let html = esc(text);
  const names = [...new Set(team().flatMap(m => [m.en, m.ko].filter(Boolean)))].sort((a, b) => b.length - a.length);
  names.forEach(n => { html = html.split('@' + esc(n)).join('<span class="mention">@' + esc(n) + '</span>'); });
  return html;
}
function mentionedMembers(text) {
  return team().filter(m => [m.en, m.ko].filter(Boolean).some(n => text.includes('@' + n)));
}

function detailSections(r) {
  const types = effTypes(r);
  const typeChips = TYPES.map(t => `<button class="opt-chip ${types.includes(t) ? 'on' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('');
  const impactChips = IMPACTS.map(i => `<button class="${effImpact(r) === i ? 'on' : ''}" data-impact="${esc(i)}">${esc(i)}</button>`).join('');
  const priBtns = ['High', 'Mid', 'Low'].map(p => `<button class="${r.priority === p ? 'on ' + p : ''}" data-pri="${p}">${p}</button>`).join('');
  const modelOpts = modelOptionsHTML(r.brand || state.workspace, r.model);
  return {
    summary: `
    <div class="sec">
      <div class="sec-h sec-h-ai">AI 요약 <span class="ai-note-inline">${warnIcon()} ${esc(AI_NOTE)}</span></div>
      <div class="ai-cls-row">
        <span class="ai-cls-lab">AI 카테고리</span>
        ${[...new Set((r.aiTypes || []).map(groupOfType))].map(g => `<span class="chip grp ${clsOfGroup(g)}">${esc(g)}</span>`).join('') || '<span class="muted-s">분류 없음</span>'}
      </div>
      <div class="box ai">${esc(r.aiSummary)}</div>
    </div>`,
    orig: `
    <div class="sec grow">
      <div class="sec-h">원문</div>
      <div class="model-row"><span class="lab">모델</span><select id="m-model" class="model-sel">${modelOpts}</select></div>
      <textarea id="m-body" class="box orig edit grow-fill" style="min-height:160px">${esc(r.body)}</textarea>
    </div>`,
    classify: `
    <div class="sec">
      <div class="sec-h">분류 보정</div>
      <div class="edit-grid">
        <div><div class="sub-h">유형 (복수 선택)</div><div class="multi" id="m-types">${typeChips}</div></div>
        <div><div class="sub-h">영향 범위</div><div class="pri-pick" id="m-impact">${impactChips}</div></div>
        <div><div class="sub-h">우선순위 태깅</div><div class="pri-pick" id="m-pri">${priBtns}</div></div>
      </div>
    </div>`,
    pm: `
    <div class="sec pm-block">
      <div class="sec-h">개발 전달</div>
      <div class="sub-h">전달 메모</div>
      <textarea id="m-memo" class="box" style="min-height:90px;width:100%;margin-bottom:14px" placeholder="개발팀에 전달할 내용을 적으세요.">${esc(r.pmMemo)}</textarea>
      <div class="sub-h">담당자 <span class="info-ic" tabindex="0" role="button" aria-label="담당자 안내" data-tip="팀 큐 — 비워두면 처리팀이 직접 가져갑니다">i</span></div>
      <div class="assignee-pick" id="m-assignee">${team().map(m => `<button type="button" class="asg-chip ${(r.assignees || []).includes(m.id) ? 'on' : ''}" data-asg="${esc(m.id)}">${avatarHTML(m.id, 20)} ${esc(m.en)}</button>`).join('')}</div>
    </div>`,
    comments: `
    <div class="sec">
      <div class="sec-h">댓글 <span class="muted-s">${r.comments.length}</span></div>
      <div class="comments" id="m-comments">${r.comments.length ? r.comments.map((c, ci) => `<div class="cmt" data-ci="${ci}"><div class="cmt-h">${avatarHTML(c.author, 22)}<b>${(member(c.author) || {}).en || '알수없음'}</b><span class="cmt-at">${fmtDate(c.at)}${c.editedAt ? ' · 수정됨' : ''}</span>${c.author === DB.me ? `<span class="cmt-actions"><button type="button" class="cmt-act" data-cmt-edit="${ci}">수정</button><button type="button" class="cmt-act" data-cmt-del="${ci}">삭제</button></span>` : ''}</div><div class="cmt-body">${renderCommentText(c.text)}</div></div>`).join('') : '<div class="empty-mini">아직 댓글이 없습니다.</div>'}</div>
      <div class="cmt-add"><textarea id="m-cmt-input" placeholder="댓글 입력…  @로 팀원 멘션"></textarea><button class="btn sm" id="m-cmt-send">등록</button><div class="mention-pop" id="m-mention-pop" hidden></div></div>
    </div>`
  };
}

/* 상단 상태 바 — 안내문(좌) + 상태 변경 select(우). 현재 상태 배지는 앱바 제목 옆에 표시 */
function statusBar(r) {
  const opts = STATUSES.map(s => `<option value="${esc(s)}" ${r.pmStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  return `
  <div class="status-bar">
    <span class="hint" style="color:var(--ai);margin:0;font-weight:700">${warnIcon()} 유형·영향범위를 사람이 확인·보정하면 'AI 분류'가 '분류 확정'으로 넘어갑니다.</span>
    <span class="sbar-sp"></span>
    <span class="lab">상태 변경</span>
    <select id="m-status">${opts}</select>
  </div>`;
}

/* 전용 상세 페이지 (딥링크 가능) — 2단 + 댓글 1단 */
function renderDetailPage() {
  const r = DB.records.find(x => x.id === state.detailId);
  if (!r) { state.view = 'board'; state.detailId = null; return renderBoard(); }
  const s = detailSections(r);
  return `
  <div class="detail-form">
    ${statusBar(r)}
    <div class="detail-2col">
      <div class="dcol">${s.summary}${s.orig}</div>
      <div class="dcol">${s.classify}${s.pm}</div>
    </div>
  </div>
  <div class="save-bar detail-savebar">
    <span class="saved-msg" id="saved-msg" style="display:none">✓ 저장됨</span>
    <button class="btn primary" id="m-save" disabled>저장</button>
    <button class="btn danger" id="m-delete">삭제</button>
  </div>
  <hr class="detail-sep">
  <div class="detail-form">
    ${s.comments}
  </div>`;
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
  else if (state.view === 'report') bindReport();
  else if (state.view === 'settings') bindSettings();
  else bindDashboard();
}

function bindCalendar() {
  document.querySelectorAll('[data-caltab]').forEach(b =>
    b.onclick = () => { state.calTab = b.dataset.caltab; render(); });
  document.querySelectorAll('[data-open]').forEach(c =>
    c.onclick = () => { state.detailId = c.dataset.open; state.view = "detail"; render(); });
}

function bindSettings() {
  document.querySelectorAll('[data-rm]').forEach(b =>
    b.onclick = () => {
      const id = b.dataset.rm;
      DB.team = team().filter(m => m.id !== id);
      DB.records.forEach(r => {
        r.assignees = (r.assignees || []).filter(x => x !== id);
        if (r.assignee === id) r.assignee = r.assignees[0] || null;
      });
      if (DB.me === id) DB.me = DB.team[0] ? DB.team[0].id : null;
      save(); render();
    });

  // 담당자 명단 드래그 순서 변경
  let dragId = null;
  const clearMarks = () => document.querySelectorAll('.roster-row').forEach(r => r.classList.remove('drop-above', 'drop-below'));
  document.querySelectorAll('.roster-row[data-mid]').forEach(row => {
    row.addEventListener('dragstart', e => { dragId = row.dataset.mid; row.classList.add('dragging'); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); clearMarks(); });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      row.classList.toggle('drop-below', after);
      row.classList.toggle('drop-above', !after);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = row.dataset.mid;
      if (!dragId || dragId === targetId) { clearMarks(); return; }
      const list = team().slice();
      const from = list.findIndex(m => m.id === dragId);
      if (from < 0) { clearMarks(); return; }
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      const [moved] = list.splice(from, 1);
      let insert = list.findIndex(m => m.id === targetId);
      if (after) insert += 1;
      list.splice(insert, 0, moved);
      DB.team = list; save(); render();
    });
  });

  // 역할 커스텀 드롭다운
  const dd = $('#nm-role-dd');
  if (dd) {
    const btn = $('#nm-role-btn'), menu = $('#nm-role-menu');
    btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    menu.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const rr = b.dataset.r;
      dd.dataset.role = rr;
      btn.querySelector('.role-chip').className = 'role-chip ' + rr;
      btn.querySelector('.role-chip').textContent = rr;
      menu.hidden = true;
    });
    document.addEventListener('click', function od(ev) {
      if (!dd.contains(ev.target)) menu.hidden = true;
    });
  }

  const add = $('#nm-add');
  if (add) add.onclick = () => {
    const en = $('#nm-en').value.trim(), ko = $('#nm-ko').value.trim(), role = (dd && dd.dataset.role) || 'UX';
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

  const impTpl = $('#imp-tpl');
  if (impTpl) impTpl.onclick = () => downloadImportTemplate();

  const impRun = $('#imp-run');
  if (impRun) impRun.onclick = () => {
    const fEl = $('#imp-file'); const msg = $('#imp-msg');
    const file = fEl && fEl.files && fEl.files[0];
    if (!file) { if (msg) msg.textContent = '먼저 .xlsx 파일을 선택하세요.'; return; }
    if (msg) msg.textContent = '가져오는 중...';
    importAnalyzedXlsx(file, res => {
      if (res.error) { if (msg) msg.textContent = '오류: ' + res.error; return; }
      if (msg) msg.textContent = `완료 — ${res.added}건 추가${res.skipped ? `, ${res.skipped}건 중복 건너뜀` : ''}.`;
      render();
    });
  };
}

/* 엑셀(.xlsx) raw data 내보내기 — 현재 워크스페이스 전체 */
function exportXlsx() {
  const recs = wsRecords().slice().sort((a, b) => a.seq - b.seq);
  if (!recs.length) { alert('내보낼 VOC가 없습니다.'); return; }

  const header = ['접수번호', '등록일시', '브랜드', '모델', '출처', '레드마인',
    '카테고리', '유형', '영향범위', '검토여부', '우선순위', 'PM상태', 'PM메모',
    'AI유형', 'AI영향범위', 'VOC본문'];
  const rows = recs.map(r => [
    r.id,
    new Date(r.createdAt).toLocaleString('ko-KR'),
    WORKSPACE_LABEL[r.brand] || r.brand || 'AK',
    r.model, r.source, r.redmine || '',
    groupsOfRecord(r).join(', '), effTypes(r).join(', '), effImpact(r),
    isConfirmed(r) ? '분류 확정(사람)' : 'AI 분류',
    r.priority || '', r.pmStatus, r.pmMemo || '',
    (r.aiTypes || []).join(', '), r.aiImpact, r.body
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

/* 모델명 → 워크스페이스 추정 */
function wsOfModel(model) {
  const m = String(model || '').trim();
  for (const ws of WORKSPACES) {
    if (modelGroups(ws).some(g => g.models.includes(m))) return ws;
  }
  if (/activo/i.test(m)) return 'Activo';
  return 'AK';
}

/* (B) 반자동: LLM이 분류·요약한 분석 엑셀을 레코드로 가져오기 */
function importAnalyzedXlsx(file, cb) {
  if (!window.XLSX) { cb({ error: 'SheetJS 로드 실패' }); return; }
  const reader = new FileReader();
  reader.onload = e => {
    let added = 0, skipped = 0;
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      wb.SheetNames.forEach(sn => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
        rows.forEach(row => {
          const noRaw = String(row['No.'] ?? row['No'] ?? '').trim();
          const body = String(row['내용'] ?? '').trim();
          const summary = String(row['요약'] ?? '').trim();
          if (!noRaw && !body && !summary) return; // 빈 행
          const redmine = noRaw.replace(/^#/, '');
          if (redmine && DB.records.some(r => (r.redmine || '') === redmine)) { skipped++; return; }
          const model = (String(row['Model'] ?? row['모델'] ?? '').trim()) || '공통';
          const source = (String(row['고객 출처'] ?? '').trim()) || '국내';
          const typesRaw = String(row['VoC유형'] ?? row['VOC유형'] ?? '').trim();
          const normType = t => TYPES.find(T => T === t || T.startsWith(t) || t.startsWith(T)) || t;
          const types = typesRaw ? typesRaw.split(/\s*[\/,]\s*/).map(s => normType(s.trim())).filter(Boolean) : null;
          const impact = (String(row['영향 범위'] ?? row['영향범위'] ?? '').trim()) || null;
          const dt = row['날짜'];
          const ts = (dt instanceof Date ? dt.getTime() : (dt ? Date.parse(dt) : NaN)) || Date.now();
          DB.seq += 1;
          DB.records.push(makeRecord(wsOfModel(model), body || summary, model, source, redmine, ts, DB.seq, {
            aiSummary: summary || null, aiTypes: types, aiImpact: impact
          }));
          added++;
        });
      });
      save();
      cb({ added, skipped });
    } catch (err) { console.error(err); cb({ error: String(err.message || err) }); }
  };
  reader.readAsArrayBuffer(file);
}

/* 가져오기용 빈 양식(.xlsx) 내려받기 */
function downloadImportTemplate() {
  const header = ['No.', '날짜', 'Model', '제목', '내용', '고객 출처', 'VoC유형', '영향 범위', '요약'];
  const fname = 'VOC_가져오기_양식';
  if (window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet([header]);
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 50 }, { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 44 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VOC');
    XLSX.writeFile(wb, fname + '.xlsx');
  } else {
    const blob = new Blob(['\uFEFF' + header.map(h => `"${h}"`).join(',')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname + '.csv'; a.click();
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
    pushNotif('new', `${rec.id} · ${WORKSPACE_LABEL[rec.brand]}`, rec.id);
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
    c.onclick = () => { state.detailId = c.dataset.open; state.view = "detail"; render(); });
  document.querySelectorAll('[data-statusfilter]').forEach(b =>
    b.onclick = () => {
      state.filters = { group: '', impact: '', source: '', model: '', assignee: '', q: '', status: b.dataset.statusfilter };
      state.view = 'board'; render();
    });
  const ys = document.getElementById('dash-year');
  if (ys) ys.onchange = () => { state.dashYear = +ys.value; render(); };
}

function bindBoard() {
  document.querySelectorAll('[data-filter]').forEach(sel =>
    sel.onchange = () => { state.filters[sel.dataset.filter] = sel.value; render(); });
  const sortSel = $('#f-sort');
  if (sortSel) sortSel.onchange = () => { state.sort = sortSel.value === 'asc' ? 'asc' : 'desc'; render(); };
  document.querySelectorAll('[data-boardview]').forEach(b =>
    b.onclick = () => { state.boardView = b.dataset.boardview === 'card' ? 'card' : 'table'; render(); });
  const q = $('#f-q');
  if (q) {
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.filters.q = q.value; const pos = q.selectionStart; render(); const nq = $('#f-q'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } }, 250); };
  }
  document.querySelectorAll('[data-open]').forEach(c =>
    c.onclick = () => { state.detailId = c.dataset.open; state.view = "detail"; render(); });
}

function bindEditControls(r) {
  let editTypes = effTypes(r).slice();
  let editImpact = effImpact(r);
  let editAssignees = (r.assignees || []).slice();
  let touched = false;
  const markDirty = () => { const b = $('#m-save'); if (b) b.disabled = false; };

  document.querySelectorAll('#m-types .opt-chip').forEach(b =>
    b.onclick = () => {
      const t = b.dataset.type;
      if (editTypes.includes(t)) editTypes = editTypes.filter(x => x !== t);
      else editTypes.push(t);
      if (editTypes.length === 0) editTypes = [t];
      b.classList.toggle('on', editTypes.includes(t));
      touched = true; markDirty();
    });
  document.querySelectorAll('#m-impact button').forEach(b =>
    b.onclick = () => {
      editImpact = b.dataset.impact;
      document.querySelectorAll('#m-impact button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); touched = true; markDirty();
    });
  document.querySelectorAll('#m-pri button').forEach(b =>
    b.onclick = () => {
      const p = b.dataset.pri;
      r._pendingPri = (r._pendingPri === p || (!r._pendingPri && r.priority === p)) ? null : p;
      document.querySelectorAll('#m-pri button').forEach(x => x.className = '');
      if (r._pendingPri) b.className = 'on ' + r._pendingPri;
      markDirty();
    });
  document.querySelectorAll('#m-assignee .asg-chip').forEach(b =>
    b.onclick = () => {
      const id = b.dataset.asg;
      if (editAssignees.includes(id)) editAssignees = editAssignees.filter(x => x !== id);
      else editAssignees.push(id);
      b.classList.toggle('on', editAssignees.includes(id));
      markDirty();
    });
  $('#m-memo').oninput = markDirty;
  const badge = $('#m-status-badge');
  const statusEl = $('#m-status');
  if (statusEl) statusEl.onchange = () => {
    markDirty();
    const v = statusEl.value;
    if (badge) { badge.className = 'status-tag ' + v.replace(/\s/g, '') + ' status-badge'; badge.innerHTML = '<span class="bdot"></span>' + v; }
  };
  const _b = $('#m-body'); if (_b) _b.oninput = markDirty;
  const _m = $('#m-model'); if (_m) _m.onchange = markDirty;

  const cmtInput = $('#m-cmt-input');
  const mpop = $('#m-mention-pop');
  const hideMpop = () => { if (mpop) { mpop.hidden = true; mpop.innerHTML = ''; } };
  const showMentions = () => {
    if (!cmtInput || !mpop) return;
    const upto = cmtInput.value.slice(0, cmtInput.selectionStart ?? cmtInput.value.length);
    const m = upto.match(/@([^\s@]*)$/);
    if (!m) { hideMpop(); return; }
    const q = m[1].toLowerCase();
    const matches = team().filter(mem => (mem.en + (mem.ko || '')).toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { hideMpop(); return; }
    mpop.innerHTML = matches.map(mem => `<button type="button" class="mention-opt" data-mname="${esc(mem.en)}">${avatarHTML(mem.id, 18)} <b>${esc(mem.en)}</b>${mem.ko ? ` <span class="muted-s">${esc(mem.ko)}</span>` : ''}</button>`).join('');
    mpop.hidden = false;
    mpop.querySelectorAll('.mention-opt').forEach(b => b.onmousedown = e => {
      e.preventDefault();
      const name = b.dataset.mname;
      const start = cmtInput.selectionStart ?? cmtInput.value.length;
      const before = cmtInput.value.slice(0, start).replace(/@([^\s@]*)$/, '@' + name + ' ');
      cmtInput.value = before + cmtInput.value.slice(start);
      cmtInput.focus();
      try { cmtInput.setSelectionRange(before.length, before.length); } catch (e2) {}
      hideMpop();
    });
  };
  if (cmtInput) {
    cmtInput.addEventListener('input', showMentions);
    cmtInput.addEventListener('keyup', e => { if (e.key === 'Escape') hideMpop(); });
    cmtInput.addEventListener('blur', () => setTimeout(hideMpop, 150));
  }

  $('#m-cmt-send').onclick = () => {
    const ta = $('#m-cmt-input');
    const text = (ta.value || '').trim();
    if (!text) return;
    r.comments = r.comments || [];
    r.comments.push({ author: DB.me, text, at: Date.now() });
    const mentioned = mentionedMembers(text);
    if (mentioned.length) pushNotif('mention', `${r.id} · ${mentioned.map(m => m.en).join(', ')}`, r.id);
    save(); render();
  };

  document.querySelectorAll('[data-cmt-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.cmtDel;
    if (!confirm('이 댓글을 삭제할까요?')) return;
    r.comments.splice(i, 1); save(); render();
  });
  document.querySelectorAll('[data-cmt-edit]').forEach(b => b.onclick = () => {
    const i = +b.dataset.cmtEdit;
    const bodyEl = b.closest('.cmt').querySelector('.cmt-body');
    bodyEl.innerHTML = '<textarea class="cmt-edit-ta"></textarea><div class="cmt-edit-actions"><button type="button" class="btn sm" data-csave>저장</button><button type="button" class="btn ghost sm" data-ccancel>취소</button></div>';
    const ta = bodyEl.querySelector('.cmt-edit-ta'); ta.value = r.comments[i].text; ta.focus();
    bodyEl.querySelector('[data-csave]').onclick = () => {
      const v = ta.value.trim(); if (!v) return;
      r.comments[i].text = v; r.comments[i].editedAt = Date.now(); save(); render();
    };
    bodyEl.querySelector('[data-ccancel]').onclick = () => render();
  });

  $('#m-save').onclick = () => {
    if (touched) {
      r.types = editTypes.slice();
      r.impact = editImpact;
      r.reviewedAt = r.reviewedAt || Date.now();
    }
    if (r._pendingPri !== undefined) r.priority = r._pendingPri;
    delete r._pendingPri;
    r.pmMemo = $('#m-memo').value;
    const bodyEl = $('#m-body'); if (bodyEl) r.body = bodyEl.value.trim();
    const modelEl = $('#m-model'); if (modelEl) r.model = modelEl.value;
    let newStatus = $('#m-status').value;
    if (touched && newStatus === 'AI 분류') newStatus = '분류 확정';
    if (newStatus !== r.pmStatus) {
      r.statusHistory = r.statusHistory || [];
      r.statusHistory.push({ status: newStatus, at: Date.now() });
      r.pmStatus = newStatus;
      pushNotif('status', `${r.id} → ${newStatus}`, r.id);
      if (newStatus === '개발 요청' || newStatus === '디자인 요청') {
        const pms = team().filter(m => m.role === 'PM').map(m => m.en).join(', ');
        pushNotif('route', `${r.id} ${newStatus} · 팀 큐${pms ? ` (PM ${pms})` : ''}`, r.id);
      }
    }
    r.reviewed = isConfirmed(r);
    const added = editAssignees.filter(id => !(r.assignees || []).includes(id));
    r.assignees = editAssignees.slice();
    r.assignee = editAssignees[0] || null;
    if (added.includes(DB.me)) pushNotif('assign', `${r.id} · 나에게 배정`, r.id);
    save(); render();
    const msg = $('#saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => { const m = $('#saved-msg'); if (m) m.style.display = 'none'; }, 1400); }
  };

  $('#m-delete').onclick = () => {
    if (!confirm(`${r.id} VOC를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    DB.records = DB.records.filter(x => x.id !== r.id);
    save();
    state.view = 'board'; state.detailId = null;
    render();
  };
}

function bindDetailPage(r) {
  const back = $('#d-back');
  if (back) back.onclick = () => { state.view = 'board'; state.detailId = null; render(); };
  bindEditControls(r);
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
      state.filters = { group: '', impact: '', source: '', status: '', model: '', assignee: '', q: '' };
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
      <div class="notif-body"><div class="notif-title">${esc(notifTitle(n.kind))}</div><div class="notif-text">${esc(n.text)}</div><div class="notif-time">${relTime(n.at)}</div></div>
    </div>`).join('') : '<div class="empty-mini" style="padding:16px">새 알림이 없습니다.</div>';
  const panel = document.createElement('div');
  panel.id = 'notif-panel'; panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-head"><b>알림</b><div class="notif-actions"><button class="btn ghost sm" id="notif-readall">모두 읽음</button><button class="btn ghost sm" id="notif-clear">모두 삭제</button></div></div>
    <div class="notif-list">${list}</div>`;
  document.body.appendChild(panel);
  const bell = document.getElementById('bell');
  const rect = bell.getBoundingClientRect();
  panel.style.top = (rect.bottom + 8) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';

  panel.querySelector('#notif-readall').onclick = () => {
    (DB.notifs || []).forEach(n => n.read = true); save(); updateBell(); panel.remove();
  };
  panel.querySelector('#notif-clear').onclick = () => {
    DB.notifs = []; save(); updateBell(); panel.remove();
  };
  panel.querySelectorAll('[data-nopen]').forEach((el, i) => {
    el.onclick = () => {
      if (ns[i]) ns[i].read = true;
      const vid = el.dataset.nopen;
      save(); updateBell(); panel.remove();
      if (vid) {
        const rec = DB.records.find(r => r.id === vid);
        if (rec) { state.workspace = rec.brand || state.workspace; state.view = 'detail'; state.detailId = vid; render(); }
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
