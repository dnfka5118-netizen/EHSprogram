# EHS 통합관리 프로그램

환경안전팀장이 수기로 하던 환경안전 업무(점검, 위험성평가, 안전작업허가 등)를 웹으로 옮기는 프로젝트.
사용 예정 인원 약 200명(임직원 + 협력업체). 현재는 **공식 오픈 전 개발 단계**이며, 팀장과 대화하며 기능을 하나씩 추가한다.

## 진행 상황
| 구분 | 상태 |
|---|---|
| 공통 기반 (로그인, 조직, 권한, 환경설정) | 완료 |
| 사내점검 : CEO 안전점검 / 월간환경안전점검 / 공장장 안전점검 (같은 양식) | 완료 |
| 이메일 알림 (단계별 + 매일 08:00 요약) | 코드 완료 · SMTP 계정 미설정 |
| 기존 엑셀 이관 스크립트 (`ehs-web/scripts/import-legacy.mjs`) | 완료 · 실제 반영 전 (사용자 등록 선행 필요) |
| 사내점검 : 유해화학물질 자체점검, 관리감독자 일일점검 | 예정 |
| 공통 전자결재 (양식별 기본 결재선 · 상신 시 수정 · 전자결재함) | 완료 (0004) |
| 수시 위험성평가 JSA (CF112-01/02 R02, 엑셀 불러오기/내보내기, 인쇄) | 완료 (0005) |
| 안전작업허가서 (CF430-01 R04, 현장 기록·손서명, TBM, 금일 작업 현황, 인쇄+JSA 첨부) | 완료 (0006) |
| 사외점검(외부점검), 정기 위험성평가 | 예정 |

## 구조
- 앱: `ehs-web/` (Next.js 16 App Router, Tailwind 4) — Next.js 16 은 이전 버전과 다름. 코드 작성 전 `ehs-web/node_modules/next/dist/docs/` 확인 (`middleware` → `proxy.ts`, 요청 API 는 모두 async).
- DB: Supabase (서울 리전). 스키마는 `ehs-web/supabase/migrations/000N_*.sql` 을 **번호 순서대로 SQL Editor 에서 실행**해 적용. 이미 적용된 파일은 수정하지 말고 새 번호 파일을 추가한다.
- 배포: GitHub `dnfka5118-netizen/EHSprogram` 의 `main` 에 push 하면 Vercel 이 자동 배포 (Root Directory = `ehs-web`, 함수 리전 icn1). 운영 주소 https://sypcehs-web.vercel.app
- 로컬 개발과 Vercel 이 **같은 Supabase DB** 를 사용 중 (오픈 전에는 개발/운영 DB 분리 검토).

## 원본 자료
- 허가서·JSA 는 팀장이 Claude 웹에서 만든 HTML 아티팩트(안전작업허가서, 작업 위험성평가서)를 이식한 것. 체크리스트 문구·부표1·인쇄 셀 배치는 원본 그대로 `src/lib/permit.ts`, `src/lib/jsa.ts`, `src/components/print/*` 에 있다.
- 결재가 있는 양식은 공통 전자결재(`_submit_approval`, `approval_template_steps`)를 재사용하고, 결재 결과 후처리는 `_on_approval_result` 를 확장한다.

## 설계 원칙
- 처리 단계 전환과 권한 검사는 화면이 아니라 DB 의 `security definer` RPC 함수에서 강제한다. 테이블 쓰기는 RPC 로만, 조회는 RLS 정책으로.
- 모든 처리는 `finding_events` 에 이력을 남기고, 알림은 이 이력의 트리거로 `notifications` 대기열에 적재한다.
- 권한: 임직원은 기본 '작성', 협력업체는 기본 '없음' → `user_permissions` 로 프로세스별 개별 부여.
- 사진은 브라우저에서 압축(긴 변 1600px JPEG) 후 Storage `findings` 버킷 `{지적사항ID}/` 경로에 업로드.
- 엑셀 보고서(사진 포함)는 Vercel 응답 크기 제한 때문에 브라우저에서 생성.

## 검증
- `cd ehs-web && npm run test:db` : PGlite 로 DB 처리 흐름·권한·알림 테스트 (Supabase 불필요). DB 를 바꾸면 테스트도 함께 추가.
- `npx tsc --noEmit`, `npx eslint src scripts`, `npx next build`

## 주의
- 원본 엑셀·이관 CSV 에는 현장 사진과 직원 이름이 있으므로 저장소에 올리지 않는다 (루트 `.gitignore`).
- `ehs-web/.env.local` 에 Supabase secret 키가 있다. 내용을 출력하거나 대화에 노출하지 말 것 (확인이 필요하면 키 이름·앞부분·길이만).
- 팀장은 개발자가 아니다. 안내는 한국어로, 클릭할 메뉴 경로를 구체적으로 적고, 가능한 작업(클립보드 복사, 파일 생성, 명령 실행)은 직접 해 준다.
프로젝트 구조는 아키텍쳐.md파일을 확인 해. 그리고 프로젝트 구조가 변경될때마다 아키텍쳐.md 파일을 업데이트 해줘.
요청받은 사항이 구현이 완료되면 git add . commit push 까지 항상 완료해줘
