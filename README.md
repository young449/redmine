# VOC 콘솔 — VOC 전달 자동화 & 대시보드

CS가 레드마인 VOC를 이메일로 수동 전달하던 비효율을 없애고, 전용 입력 화면과 UX·PM 공용 대시보드로 한 번에 처리하는 내부 콘솔. (Redmine PRD v1.1 기반) **AK·Activo 멀티 워크스페이스**를 지원합니다.

## 화면 구성
- **CS 입력** — VOC 본문·모델·출처(국내/해외)·레드마인 번호 입력, 제출 시 워크스페이스별 접수번호 자동 부여(AK001 / AC001)
- **Dashboard** — 현황 통계, 월별 추이, 카테고리 분포 요약
- **VOC Board** — VOC 목록, AI 요약·분류(면책 표시), 유형/카테고리/상태/모델/출처/담당자 필터, 반복 이슈·우선순위 배지
- **Report** — 기간 요약, 카테고리 분포, 월별 접수·완료 추이, 오래 묵은 VOC
- **상세** — AI 요약 · 분류 보정 · 원문 · 처리 작업(담당자 배정 + 처리 항목 체크리스트, 항목 배정 시 담당자 알림)
- **Settings** — 담당자 명단, 레드마인 연동, 분석 데이터(엑셀) 가져오기, 계정·비밀번호 관리

## 계정 / 인증 (Supabase)
- 아이디 + 비밀번호 로그인 (도메인 선택: `iriver.com` / `astellnkern.com` / `meewang.kr`)
- 비밀번호 변경(설정) · 비밀번호 찾기(재설정 메일 → 새 비밀번호 설정)
- 계정 생성은 Supabase 대시보드(Authentication → Users)에서. 로그인 후 변경사항은 Supabase에 자동 동기화됩니다.

## 로컬 실행 / 배포
정적 사이트. 빌드 없이 그대로 엽니다.

```bash
python3 -m http.server 8080   # → http://localhost:8080
```

GitHub Pages: `index.html`·`styles.css`·`app.js`를 같은 폴더에 올리고 Settings → Pages에서 브랜치 게시. (세 파일이 함께 있어야 정상 표시됨)

## 알아둘 점
- **데이터**: 로그인 시 Supabase에 동기화. 미설정·비로그인 시 브라우저 `localStorage` 로컬 모드.
- **Supabase 설정**: 계정 생성 + URL Configuration(Site URL·Redirect URLs)에 앱 주소 등록 + (재설정 메일은) SMTP 설정 필요.
- **AI 요약·분류**: 실제 LLM이 아닌 키워드 휴리스틱 대체 구현(운영 시 서버 AI로 교체). 면책 표시 적용.
- **레드마인 URL**: `app.js`의 `REDMINE_BASE` 상수를 실제 주소로 교체.
- **필터 공유**: 필터 상태가 URL 해시에 반영되어 링크로 공유 가능.
- **반응형**: 모바일은 햄버거 드로어 메뉴.

## 파일
| 파일 | 역할 |
| --- | --- |
| `index.html` | 진입점 / 레이아웃 (폴백 스타일 포함) |
| `styles.css` | 디자인 시스템 (amber=AI, green=완료, red=반복/긴급) |
| `app.js` | 데이터·인증(Supabase)·휴리스틱 분류·렌더링·라우팅 |
