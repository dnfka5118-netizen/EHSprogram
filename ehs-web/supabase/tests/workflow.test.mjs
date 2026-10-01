// DB 처리 흐름 테스트 (PGlite 로 Supabase 없이 실행) : npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const MIG = new URL("../migrations/", import.meta.url);
const db = new PGlite();

// ---- Supabase 환경 흉내 : auth / storage 스키마, 역할
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
  alter table storage.objects enable row level security;
  -- Supabase 기본 권한 : 새로 만드는 테이블·함수에 자동 부여
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant select on storage.objects to authenticated;
  alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);

for (const file of ["0001_init.sql", "0002_seed.sql", "0003_notifications.sql", "0004_approvals.sql", "0005_jsa.sql", "0006_permit.sql", "0007_favorites.sql", "0008_inspector.sql", "0009_inspection_with_findings.sql", "0010_register_finding.sql", "0011_finding_examples.sql"]) {
  await db.exec(readFileSync(new URL(file, MIG), "utf8"));
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
async function expectError(label, sql, p = [], contains) {
  try { await db.query(sql, p); ok(false, `${label} (오류가 나야 함)`); }
  catch (e) { ok(!contains || e.message.includes(contains), `${label} → "${e.message}"`); }
}

const counts = await one(`select (select count(*) from locations)::int loc, (select count(*) from sub_locations)::int sub,
  (select count(*) from departments)::int dept, (select count(*) from finding_types)::int typ`);
console.log("seed:", counts);
ok(counts.loc === 11 && counts.sub === 32 && counts.dept === 6 && counts.typ === 9, "초기 데이터 개수");

// ---- 사용자
const site = (await one(`select id from sites where code='CA'`)).id;
const dept = async (n) => (await one(`select id from departments where name=$1`, [n])).id;
const PROD = await dept("생산팀"), QA = await dept("품질팀"), EHS = await dept("EHS부서");
const U = {};
for (const [k, name, d, type, admin] of [
  ["A", "관리자", EHS, "employee", true], ["I", "점검자", EHS, "employee", false],
  ["S", "생산지정자", PROD, "employee", false], ["H", "생산팀장", PROD, "employee", false],
  ["W1", "작업자1", PROD, "employee", false], ["W2", "작업자2", PROD, "employee", false],
  ["Q", "품질직원", QA, "employee", false], ["C", "협력업체", PROD, "contractor", false],
]) {
  const id = (await one(`insert into auth.users values (gen_random_uuid()) returning id`)).id;
  await db.query(`insert into profiles (id,email,name,site_id,department_id,user_type,is_admin) values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, `${k.toLowerCase()}@test.kr`, name, site, d, type, admin]);
  U[k] = id;
}
await db.query(`update departments set assigner_id=$1, approver_id=$2 where id=$3`, [U.S, U.H, PROD]);

console.log("\n[권한]");
await as(U.I); ok((await one(`select perm_level('insp_ceo') v`)).v === 2, "임직원 기본 = 작성");
await as(U.C); ok((await one(`select perm_level('insp_ceo') v`)).v === 0, "협력업체 기본 = 없음");
await expectError("협력업체 점검 등록 차단", `select create_inspection('insp_ceo',$1,'2026-09-10','t',null,null)`, [site], "권한");
await as(null); await db.query(`insert into user_permissions values ($1,'insp_ceo','read')`, [U.C]);
await as(U.C); ok((await one(`select perm_level('insp_ceo') v`)).v === 1, "협력업체에 열람 부여");

console.log("\n[등록]");
await as(U.I);
const insp = (await one(`select create_inspection('insp_ceo',$1,'2026-09-10','2026년 9월 CEO 안전점검','대표이사',null) id`, [site])).id;
const fid = "11111111-1111-1111-1111-111111111111";
const loc = (await one(`select id from locations where name='HBC-C2'`)).id;
const sub = (await one(`select id from sub_locations where name='PLP'`)).id;
const typ = (await one(`select id from finding_types where name='설비'`)).id;
await expectError("사진 경로 검증", `select create_finding($1,$2,$3,$4,null,$5,'문제',$6,array['other/x.jpg'])`, [fid, insp, loc, sub, typ, PROD], "경로");
await db.query(`select create_finding($1,$2,$3,$4,null,$5,'PLP Hose 꺾임',$6,array[$7])`, [fid, insp, loc, sub, typ, PROD, `${fid}/before-1.jpg`]);
let f = await one(`select * from finding_overview where id=$1`, [fid]);
ok(f.status === "assign_wait" && f.seq === 1 && f.location_name === "HBC-C2" && f.sub_location_name === "PLP", "등록 → 담당자 지정 대기, 뷰 조회");

console.log("\n[담당자 지정]");
await as(U.W1); await expectError("일반 부서원 지정 차단", `select assign_finding($1, array[$2]::uuid[])`, [fid, U.W1], "권한");
await as(U.S); await expectError("타 부서원 지정 차단", `select assign_finding($1, array[$2,$3]::uuid[])`, [fid, U.W1, U.Q], "소속");
await db.query(`select assign_finding($1, array[$2,$3]::uuid[])`, [fid, U.W1, U.W2]);
f = await one(`select * from finding_overview where id=$1`, [fid]);
ok(f.status === "plan_wait" && f.assignee_names === "작업자1, 작업자2", "지정 → 계획 수립 대기, 담당자 2명");
await db.query(`select assign_finding($1, array[$2]::uuid[])`, [fid, U.W1]);
ok((await one(`select detail from finding_events where finding_id=$1 order by created_at desc limit 1`, [fid])).detail === "작업자1, 작업자2 → 작업자1", "담당자 변경 이력");

console.log("\n[조치계획]");
await as(U.W2); await expectError("지정 해제된 사람 계획 등록 차단", `select save_plan($1,'[]')`, [fid], "조치담당자");
await as(U.W1);
await expectError("계획 없이 저장 차단", `select save_plan($1,'[]')`, [fid], "1개 이상");
await expectError("목표일 누락 차단", `select save_plan($1,'[{"kind":"short","content":"x"}]')`, [fid], "목표일");
const today = (await one(`select kst_today()::text d`)).d;
const plus = async (n) => (await one(`select (kst_today() + $1::int)::text d`, [n])).d;
await db.query(`select save_plan($1,$2)`, [fid, JSON.stringify([
  { kind: "immediate", content: "비닐 커버", target_date: today },
  { kind: "short", content: "배관 교체", target_date: await plus(30) },
  { kind: "long", content: "설비 고정화", target_date: await plus(90) },
])]);
f = await one(`select * from finding_overview where id=$1`, [fid]);
ok(f.status === "in_progress" && f.next_due.toISOString().slice(0, 10) === today, "계획 등록 → 조치 중, 다음 목표일 = 즉시조치 목표일");
const M = Object.fromEntries((await db.query(`select kind,id from finding_measures where finding_id=$1`, [fid])).rows.map((r) => [r.kind, r.id]));

console.log("\n[결과 보고]");
const items = (d) => JSON.stringify(Object.entries(d).map(([k, v]) => ({ measure_id: M[k], done: v[0], new_target_date: v[1] ?? null })));
await expectError("미완료인데 사유 없음", `select report_progress($1,$2,'','',null)`, [fid, items({ immediate: [true], short: [false], long: [false] })], "미완료 이유");
const newShort = await plus(45);
ok((await one(`select report_progress($1,$2,'자재 입고 지연','견적 진행 중',null) r`, [fid, items({ immediate: [true], short: [false, newShort], long: [false] })])).r === "in_progress", "미완료 보고 + 단기 목표일 재수립");
const sm = await one(`select * from finding_measures where id=$1`, [M.short]);
ok(sm.target_date.toISOString().slice(0, 10) === newShort && sm.reschedule_count === 1, "목표일 변경 횟수/이력 기록");
ok((await one(`select count(*)::int c from measure_date_history where measure_id=$1`, [M.short])).c === 1, "날짜 변경 이력 1건");

// 기한 초과 시뮬레이션
await as(null); await db.query(`update finding_measures set target_date = kst_today() - 3 where id=$1`, [M.long]);
f = await one(`select * from finding_overview where id=$1`, [fid]);
ok(f.is_overdue === true, "목표일 경과 → 기한 초과 표시");
await as(U.W1);
await expectError("기한 지난 조치 새 목표일 필수", `select report_progress($1,$2,'a','b',null)`, [fid, items({ short: [false], long: [false] })], "다시 정해야");
await expectError("과거 날짜로 재수립 차단", `select report_progress($1,$2,'a','b',null)`, [fid, items({ long: [false, "2020-01-01"] })], "오늘 이후");
await expectError("전부 완료인데 개선 후 사진 없음", `select report_progress($1,$2,'','',null)`, [fid, items({ short: [true], long: [true] })], "사진");
ok((await one(`select is_done from finding_measures where id=$1`, [M.short])).is_done === false, "오류 시 완료 처리 롤백");
ok((await one(`select report_progress($1,$2,'','완료',array[$3]) r`, [fid, items({ short: [true], long: [true] }), `${fid}/after-1.jpg`])).r === "approval_wait", "완료 보고 → 승인 대기");

console.log("\n[승인]");
await as(U.S); await expectError("지정자는 승인 불가", `select approve_finding($1,null)`, [fid], "권한");
await as(U.H);
await expectError("반려 사유 필수", `select reject_finding($1,'')`, [fid], "사유");
await db.query(`select reject_finding($1,'사진 불명확, 재촬영 요망')`, [fid]);
ok((await one(`select status from findings where id=$1`, [fid])).status === "in_progress", "반려 → 조치 중으로 복귀");
await as(U.W1);
ok((await one(`select report_progress($1,$2,'','재촬영',array[$3]) r`, [fid, items({ immediate: [true], short: [true], long: [true] }), `${fid}/after-2.jpg`])).r === "approval_wait", "재보고 → 승인 대기");
await as(U.H); await db.query(`select approve_finding($1,'확인')`, [fid]);
f = await one(`select * from finding_overview where id=$1`, [fid]);
ok(f.status === "closed" && f.is_overdue === false, "승인 → 종결");
await as(U.S); await expectError("종결 건 담당자 변경 차단", `select assign_finding($1, array[$2]::uuid[])`, [fid, U.W2], "종결");

console.log("\n[삭제 / 코멘트]");
await as(U.I); await expectError("지정 후 등록자 삭제 차단", `select delete_finding($1)`, [fid], "삭제할 수 없습니다");
await as(U.C); await db.query(`select add_comment($1,'확인했습니다',false)`, [fid]);
ok((await one(`select count(*)::int c from finding_comments where finding_id=$1`, [fid])).c === 1, "열람 권한자 코멘트 등록");
const events = (await db.query(`select action from finding_events where finding_id=$1 order by created_at`, [fid])).rows.map((r) => r.action);
console.log("  이력:", events.join(" → "));

console.log("\n[RLS : 실제 로그인 사용자 역할로 조회]");
await db.exec(`set role authenticated`);
const visible = async (uid) => { await as(uid); return (await one(`select count(*)::int c from finding_overview`)).c; };
ok((await visible(U.W1)) === 1, "임직원 조회 가능");
ok((await visible(U.C)) === 1, "열람 권한 협력업체 조회 가능");
await db.exec(`reset role`); await as(null);
await db.query(`delete from user_permissions where user_id=$1`, [U.C]);
await db.query(`update profiles set department_id=null where id=$1`, [U.C]);
await db.exec(`set role authenticated`);
ok((await visible(U.C)) === 0, "권한 없는 협력업체 조회 불가");
ok((await visible(null)) === 0, "비로그인 조회 불가");
await db.exec(`reset role`);
const stranger = (await one(`insert into auth.users values (gen_random_uuid()) returning id`)).id;
await db.exec(`set role authenticated`);
await as(stranger);
ok((await one(`select count(*)::int c from profiles`)).c === 0, "프로필 없는 가입자 직원명단 조회 불가");
await as(U.C);
ok((await one(`select count(*)::int c from profiles`)).c > 0, "등록 사용자 직원명단 조회 가능");
ok((await db.query(`select * from storage.objects`)).rows.length === 0, "storage 정책 실행 오류 없음");
await db.exec(`reset role`);

console.log("\n[이메일 알림 대기열]");
await as(U.A); await db.query(`select add_comment($1,'현장 재확인 요망',true)`, [fid]);
await as(null);
const mails = (await db.query(`select n.kind, p.name from notifications n join profiles p on p.id=n.user_id order by n.created_at, p.name`)).rows;
const got = (kind) => mails.filter((m) => m.kind === kind).map((m) => m.name).sort().join(",");
console.log("  " + mails.map((m) => `${m.kind}:${m.name}`).join("  "));
ok(got("request") === "생산지정자,생산팀장", "등록 → 부서 지정자·승인자에게 조치 요청");
ok(got("assigned") === "작업자1,작업자2", "지정 → 새로 지정된 사람에게만 (변경 시 기존 담당자 재발송 없음)");
ok(got("approval") === "생산팀장,생산팀장", "완료 보고(2회) → 부서장에게 승인 요청");
ok(got("rejected") === "작업자1", "반려 → 조치담당자");
ok(got("closed") === "작업자1,점검자", "종결 → 조치담당자·등록자");
ok(got("directive") === "생산팀장,작업자1", "지시사항 → 조치담당자·부서장");
ok(!mails.some((m) => m.name === "관리자"), "본인 행동(지시 등록)은 본인에게 알리지 않음");
const sample = await one(`select subject, body from notifications where kind='assigned' limit 1`);
ok(sample.subject.includes("CEO 안전점검 #1 (26.09)") && sample.body.includes("HBC-C2 / PLP"), "메일 제목·본문 내용");
const claimed = (await db.query(`select * from claim_notifications(5)`)).rows;
ok(claimed.length === 5 && claimed[0].email.endsWith("@test.kr"), "발송기 대기열 가져오기 (5건)");
await db.query(`select finish_notification($1,true,null)`, [claimed[0].id]);
ok((await one(`select count(*)::int c from notifications where status='sending'`)).c === 4, "발송 상태 갱신");
await db.exec(`set role authenticated`); await as(U.W1);
await expectError("일반 사용자는 발송 대기열 조작 불가", `select * from claim_notifications(5)`, [], "permission");
await db.exec(`reset role`); await as(null);

console.log("\n[공통 전자결재]");
ok((await one(`select count(*)::int c from departments where name='EHS부서'`)).c === 1 && (await one(`select count(*)::int c from departments where name='환경안전팀'`)).c === 0, "부서명 환경안전팀 → EHS부서");
const tpl = (await db.query(`select step_order, step_kind, label, resolver, department_id from approval_template_steps where module_code='permit' order by step_order`)).rows;
ok(tpl.map((t) => t.label).join(">") === "담당>검토(EHS부서장)>협조(관련부서)>승인(해당부서장)" && tpl[1].department_id === EHS, "허가서 기본 결재선 · 검토 = EHS부서 부서장");
await db.query(`delete from notifications`);
const docId = "22222222-2222-2222-2222-222222222222";
const line = (arr) => JSON.stringify(arr.map(([k, l, a]) => ({ step_kind: k, label: l, approver_id: a })));
await as(U.I);
await expectError("결재자 누락 차단", `select _submit_approval('permit',$1,'t',$2,$3,$4)`, [docId, site, PROD, line([["담당", "담당", U.I], ["검토", "검토", null]])], "결재자를 지정");
await expectError("작성자만 있는 결재선 차단", `select _submit_approval('permit',$1,'t',$2,$3,$4)`, [docId, site, PROD, line([["담당", "담당", U.I]])], "1명 이상");
const apId = (await one(`select _submit_approval('permit',$1,'R-201 맨홀 작업',$2,$3,$4) id`, [docId, site, PROD,
  line([["담당", "담당", U.I], ["검토", "검토(EHS부서장)", U.A], ["협조", "협조(품질팀)", U.Q], ["승인", "승인(해당부서장)", U.H]])])).id;
const st = async () => (await db.query(`select label, status from approval_steps where approval_id=$1 and round=(select round from approvals where id=$1) order by step_order`, [apId])).rows.map((r) => `${r.label}:${r.status}`).join(" ");
ok((await st()) === "담당:approved 검토(EHS부서장):pending 협조(품질팀):waiting 승인(해당부서장):waiting", "상신 → 담당 자동 결재, 검토 차례");
await expectError("재상신 중복 차단", `select _submit_approval('permit',$1,'t',$2,$3,$4)`, [docId, site, PROD, line([["검토", "검토", U.A]])], "이미 결재");
await as(U.H); await expectError("차례 아닌 사람 결재 차단", `select approve_step($1,null)`, [apId], "차례가 아닙니다");
await as(U.A); await db.query(`select approve_step($1,'확인')`, [apId]);
await as(U.I); await expectError("결재 진행 후 상신 취소 차단", `select withdraw_approval($1)`, [apId], "취소할 수 없습니다");
await as(U.Q); await expectError("반려 사유 필수", `select reject_step($1,'')`, [apId], "사유");
await db.query(`select reject_step($1,'작업 인원 명단 누락')`, [apId]);
ok((await one(`select status from approvals where id=$1`, [apId])).status === "rejected" && (await st()).endsWith("협조(품질팀):rejected 승인(해당부서장):skipped"), "협조 반려 → 문서 반려, 이후 단계 생략");
await as(U.I);
await db.query(`select _submit_approval('permit',$1,'R-201 맨홀 작업 (수정)',$2,$3,$4)`, [docId, site, PROD, line([["담당", "담당", U.I], ["검토", "검토", U.A], ["승인", "승인", U.H]])]);
ok((await one(`select round, status from approvals where id=$1`, [apId])).round === 2 && (await st()) === "담당:approved 검토:pending 승인:waiting", "반려 후 재상신 → 2차, 결재선 변경 반영");
await as(U.A); ok((await one(`select approve_step($1,null) r`, [apId])).r === "in_review", "검토 승인 → 다음 단계");
await as(U.H); ok((await one(`select approve_step($1,'승인') r`, [apId])).r === "approved", "최종 승인 → 결재 완료");
ok((await one(`select count(*)::int c from approval_steps where approval_id=$1`, [apId])).c === 7, "1차·2차 결재 이력 모두 보존");
await as(null);
const apMails = (await db.query(`select n.kind, p.name, n.link from notifications n join profiles p on p.id=n.user_id order by n.created_at`)).rows;
console.log("  " + apMails.map((m) => `${m.kind}:${m.name}`).join("  "));
ok(apMails.filter((m) => m.kind === "approval_request").map((m) => m.name).join(",") === "관리자,품질직원,관리자,생산팀장", "결재 차례마다 결재 요청 메일");
ok(apMails.some((m) => m.kind === "approval_rejected" && m.name === "점검자") && apMails.some((m) => m.kind === "approval_approved" && m.name === "점검자"), "반려·완료 결과 메일 → 상신자");
ok(apMails.every((m) => m.link === `/permit/${docId}`), "메일 링크 = 문서 화면");
await db.exec(`set role authenticated`); await as(U.W1);
await expectError("양식 RPC 거치지 않은 직접 상신 차단", `select _submit_approval('permit',gen_random_uuid(),'t',null,null,'[]')`, [], "permission");
await db.exec(`reset role`); await as(null);

console.log("\n[수시 위험성평가 JSA]");
const jsaData = (over = {}) => JSON.stringify({
  department_id: PROD, eval_date: "2026-09-27", work_name: "R-201 맨홀 개방 후 배관 용접", super_count: "1", worker_count: "2",
  steps: [
    { cat: "준비작업", content: "질소 치환", safe: "가스농도 측정", hazards: [{ type: "질식", content: "산소결핍", freq: "2", sev: "4" }, { type: "화재/폭발", content: "잔류가스", freq: "2", sev: "5" }],
      control: { needed: true, checks: ["공학적"], desc: "치환 후 산소 18% 확인", impNo: "IMP-01", target: "2026-10-01", owner: "최안전", done: "", postFreq: "1", postSev: "3" } },
  ],
  ...over,
});
await as(U.C); await expectError("협력업체 작성 차단", `select save_jsa(null,$1)`, [jsaData()], "권한");
await as(U.I);
const jsaId = (await one(`select save_jsa(null,$1) id`, [jsaData()])).id;
const jr = await one(`select eval_no, max_risk, super_count, created_by from jsa_evals where id=$1`, [jsaId]);
ok(/^RA-\d{8}-001$/.test(jr.eval_no) && jr.max_risk === 10 && jr.super_count === 1 && jr.created_by === U.I, `저장 → 일련번호 ${jr.eval_no}, 최대위험도 10`);
const jsa2 = (await one(`select save_jsa(null,$1) id`, [jsaData({ work_name: "" })])).id;
ok((await one(`select eval_no from jsa_evals where id=$1`, [jsa2])).eval_no.endsWith("-002"), "같은 날 두 번째 → -002 (덮어쓰기 없음)");
await expectError("작업명 없이 상신 차단", `select submit_jsa($1,$2)`, [jsa2, line([["담당", "담당", U.I], ["검토", "검토", U.A]])], "작업명");
await db.query(`select save_jsa($1,$2)`, [jsa2, jsaData({ steps: [{ cat: "", content: "x", hazards: [{ type: "질식", content: "", freq: "7", sev: "2" }], control: { needed: false } }] })]);
await expectError("빈도 범위 초과 상신 차단", `select submit_jsa($1,$2)`, [jsa2, line([["담당", "담당", U.I], ["검토", "검토", U.A]])], "1~5");
await as(U.W1); await expectError("타인 평가서 수정 차단", `select save_jsa($1,$2)`, [jsaId, jsaData()], "작성자만");
await as(U.I);
const jsaAp = (await one(`select submit_jsa($1,$2) id`, [jsaId, line([["담당", "담당", U.I], ["검토", "검토(EHS부서장)", U.A], ["승인", "승인(해당부서장)", U.H]])])).id;
ok((await one(`select approval_status from jsa_overview where id=$1`, [jsaId])).approval_status === "in_review", "상신 → 결재 중");
await expectError("결재 중 수정 차단", `select save_jsa($1,$2)`, [jsaId, jsaData()], "수정할 수 없습니다");
await expectError("결재 중 삭제 차단", `select delete_jsa($1)`, [jsaId], "삭제할 수 없습니다");
await as(U.A); await db.query(`select approve_step($1,null)`, [jsaAp]);
await as(U.H); await db.query(`select approve_step($1,null)`, [jsaAp]);
ok((await one(`select approval_status from jsa_overview where id=$1`, [jsaId])).approval_status === "approved", "결재 완료");
ok((await one(`select link from notifications where kind='approval_approved' order by created_at desc limit 1`)).link === `/risk/adhoc/${jsaId}`, "완료 메일 링크 = 평가서 화면");
await as(U.I); await db.query(`select delete_jsa($1)`, [jsa2]);
ok((await one(`select count(*)::int c from jsa_evals where id=$1`, [jsa2])).c === 0, "작성 중 평가서 삭제");
await db.exec(`set role authenticated`);
await as(U.W1); ok((await one(`select count(*)::int c from jsa_overview`)).c === 1, "임직원 목록 조회");
await as(U.C); ok((await one(`select count(*)::int c from jsa_overview`)).c === 0, "권한 없는 협력업체 조회 불가");
await expectError("번호 발급 함수 직접 호출 차단", `select next_doc_no('RA')`, [], "permission");
await db.exec(`reset role`); await as(null);

console.log("\n[안전작업허가서]");
const pData = (over = {}) => JSON.stringify({
  department_id: PROD, work_type: "화기", supp: ["confined", "bogus"], grade: "B", work_name: "R-201 맨홀 용접보수",
  work_place: "2공장 반응동", start_dt: "2026-09-28T09:00", end_dt: "2026-09-28T15:00",
  managers: [{ org: "생산팀", name: "작업자1", phone: "010" }], witnesses: [{ org: "EHS부서", name: "", phone: "" }],
  checks: { docs_0: true, docs_risk: true, docs_0_ok: true }, fields: { risk_no: "" }, ...over,
});
await as(U.C); await expectError("협력업체 허가서 작성 차단", `select save_permit(null,$1)`, [pData()], "권한");
await as(U.I);
const pId = (await one(`select save_permit(null,$1) id`, [pData()])).id;
const pr = await one(`select permit_no, supp, checks from permits where id=$1`, [pId]);
ok(/^CF430-\d{8}-001$/.test(pr.permit_no) && pr.supp.join() === "confined" && pr.checks.docs_0_ok === undefined, `저장 → ${pr.permit_no}, 잘못된 보충작업·○확인 키 제거`);
const pLine = line([["담당", "담당", U.I], ["검토", "검토(EHS부서장)", U.A], ["승인", "승인(해당부서장)", U.H]]);
await expectError("B등급 입회자 누락 차단", `select submit_permit($1,$2)`, [pId, pLine], "입회자");
await db.query(`select save_permit($1,$2)`, [pId, pData({ witnesses: [{ org: "EHS부서", name: "관리자", phone: "" }] })]);
await expectError("위험성평가 미연결·번호 없음 차단", `select submit_permit($1,$2)`, [pId, pLine], "위험성평가서를 불러오거나");
// 결재 완료 전 JSA 연결 차단
const draftJsa = (await one(`select save_jsa(null,$1) id`, [jsaData()])).id;
await db.query(`select save_permit($1,$2)`, [pId, pData({ witnesses: [{ name: "관리자" }], risk_eval_id: draftJsa })]);
await expectError("미결재 위험성평가 연결 차단", `select submit_permit($1,$2)`, [pId, pLine], "결재 완료되지");
// 1년 넘은 결재완료 JSA
await as(null); await db.query(`update jsa_evals set eval_date='2025-01-10' where id=$1`, [jsaId]); await as(U.I);
await db.query(`select save_permit($1,$2)`, [pId, pData({ witnesses: [{ name: "관리자" }], risk_eval_id: jsaId })]);
await expectError("1년 경과 위험성평가 차단", `select submit_permit($1,$2)`, [pId, pLine], "1년 이상");
await as(null); await db.query(`update jsa_evals set eval_date='2026-09-20' where id=$1`, [jsaId]); await as(U.I);
await expectError("현장 기록은 발급 전 불가", `select save_permit_field($1,'{}')`, [pId], "발급된");
const pAp = (await one(`select submit_permit($1,$2) id`, [pId, pLine])).id;
await expectError("결재 중 신청 내용 수정 차단", `select save_permit($1,$2)`, [pId, pData()], "수정할 수 없습니다");
await as(U.A); await db.query(`select approve_step($1,null)`, [pAp]);
await as(U.H); await db.query(`select approve_step($1,null)`, [pAp]);
const pv = await one(`select status, phase, risk_eval_no from permit_overview where id=$1`, [pId]);
ok(pv.status === "issued" && pv.risk_eval_no?.startsWith("RA-"), "최종 승인 → 발급, 위험성평가 번호 표시");
await as(U.W1);
const fieldData = (sigs, done = "") => JSON.stringify({ checks_ok: { docs_0_ok: true }, sigs, fields: { complete_time: done }, acks: [{ id: "a1", name: "작업자1", sig: "data:x" }] });
await db.query(`select save_permit_field($1,$2)`, [pId, fieldData({ prework_mgr: "data:x" })]);
ok((await one(`select field->'checks_ok'->>'docs_0_ok' v, field_saved_by from permits where id=$1`, [pId])).v === "true", "다른 임직원도 현장 기록 저장");
await expectError("입회자 서명 없이 완료 차단", `select complete_permit($1)`, [pId], "입회자 서명");
await db.query(`select save_permit_field($1,$2)`, [pId, fieldData({ prework_mgr: "d", prework_wit: "d" })]);
await expectError("EHS 확인 서명 없이 완료 차단", `select complete_permit($1)`, [pId], "EHS 확인");
await db.query(`select save_permit_field($1,$2)`, [pId, fieldData({ prework_mgr: "d", prework_wit: "d", prework_ehs: "d" })]);
await expectError("완료 시간 없이 완료 차단", `select complete_permit($1)`, [pId], "완료 시간");
await db.query(`select save_permit_field($1,$2)`, [pId, fieldData({ prework_mgr: "d", prework_wit: "d", prework_ehs: "d", complete_mgr: "d", complete_wit: "d" }, "2026-09-28T15:10")]);
await expectError("TBM 일시 필수", `select save_permit_tbm($1,'{}')`, [pId], "TBM 일시");
await db.query(`select save_permit_tbm($1,$2)`, [pId, JSON.stringify({ tbm_dt: "2026-09-28T08:50", content: "질식 주의" })]);
await db.query(`select complete_permit($1)`, [pId]);
const pc = await one(`select status, has_tbm from permit_overview where id=$1`, [pId]);
ok(pc.status === "completed" && pc.has_tbm, "작업완료 + TBM 기록");
await expectError("완료 후 현장 기록 수정 차단", `select save_permit_field($1,'{}')`, [pId], "발급된");
await as(U.I); await expectError("발급된 허가서 삭제 차단", `select delete_permit($1)`, [pId], "삭제할 수 없습니다");
await db.exec(`set role authenticated`); await as(U.C);
ok((await one(`select count(*)::int c from permit_overview`)).c === 0, "권한 없는 협력업체 허가서 조회 불가");
await db.exec(`reset role`); await as(null);

console.log("\n[즐겨찾기]");
await as(U.W1); await db.query("select set_favorites($1)", [["/permit", "/insp/ceo", "/permit", "javascript:alert(1)"]]);
await as(null);
const fav = (await one("select favorites from profiles where id=$1", [U.W1])).favorites;
ok(fav.length === 2 && fav.includes("/permit") && fav.includes("/insp/ceo"), "중복·잘못된 주소 제거 후 저장");
ok((await one("select favorites from profiles where id=$1", [U.I])).favorites.length === 0, "다른 사람 즐겨찾기는 그대로");

console.log("\n[점검자 고정]");
await as(null); await db.query("update profiles set position='과장' where id=$1", [U.I]);
await as(U.I);
const insId = async (m) => (await one(`select create_inspection($1,$2,'2026-10-01','t','참여자A',null) id`, [m, site])).id;
const insOf = async (id) => one("select inspector, inspectors from inspections where id=$1", [id]);
ok((await insOf(await insId("insp_ceo"))).inspector === "대표이사", "CEO 안전점검 점검자 = 대표이사");
ok((await insOf(await insId("insp_plant"))).inspector === "공장장", "공장장 안전점검 점검자 = 공장장");
const mo = await insOf(await insId("insp_monthly"));
ok(mo.inspector === "점검자 과장" && mo.inspectors === "참여자A", "월간점검 점검자 = 등록한 사람(이름 직위), 참여자는 따로");
await as(null);

console.log("\n[점검 등록 = 지적사항 1건, 회차 자동]");
await db.exec("update inspections set inspection_date = date '2000-01-01'"); // 앞선 테스트의 회차가 오늘 날짜와 겹치지 않도록
const loc1 = (await one(`select id from locations where site_id=$1 order by sort_order limit 1`, [site])).id;
const typ1 = (await one(`select id from finding_types order by sort_order limit 1`)).id;
const fd = (problem, d = PROD) => {
  const id = crypto.randomUUID();
  return JSON.stringify({ id, location_id: loc1, sub_location_id: "", sub_location_text: "", type_id: typ1, problem, department_id: d, photos: [`${id}/a.jpg`] });
};
const reg = async (m, who, problem, parts = "") => {
  await as(who);
  const r = (await one(`select register_finding($1,$2,$3) id`, [m, parts, fd(problem)])).id;
  await as(null);
  return r;
};
const inspCount = async () => (await one(`select count(*)::int c from inspections`)).c;
const r1 = await reg("insp_ceo", U.I, "난간 파손", "홍길동");
const r2 = await reg("insp_ceo", U.Q, "소화기 위치", "김철수, 홍길동");
const s1 = await one(`select inspection_date::text d, inspector, inspectors, title, site_id from inspections where id=$1`, [r1]);
const today2 = (await one(`select kst_today()::text d`)).d;
ok(r1 === r2, "CEO 점검 : 같은 날 다른 사람이 등록해도 같은 회차(점검자=대표이사)");
ok(s1.d === today2 && s1.site_id === site && s1.inspector === "대표이사", "점검일 = 오늘, 사업장 = 등록자 사업장, 점검자 고정");
ok(/^\d{4}년 \d{1,2}월 \d{1,2}일 CEO 안전점검$/.test(s1.title), `점검명 자동 : ${s1.title}`);
ok(s1.inspectors.split(", ").sort().join() === ["김철수", "홍길동"].sort().join(), "참여자 합치기 (중복 제외)");
const seqs = (await db.query(`select seq from findings where inspection_id=$1 order by seq`, [r1])).rows.map((x) => x.seq);
ok(seqs.join() === "1,2", "회차 안에서 순번 1, 2");
const m1 = await reg("insp_monthly", U.I, "월간1");
const m2 = await reg("insp_monthly", U.Q, "월간2");
const m3 = await reg("insp_monthly", U.I, "월간3");
ok(m1 === m3 && m1 !== m2, "월간점검 : 점검자(로그인한 사람)별로 회차가 나뉨");
const before = await inspCount();
await as(U.I);
await expectError("문제점 없으면 차단", `select register_finding('insp_plant','',$1)`, [fd("")], "문제점");
ok((await inspCount()) === before, "실패하면 회차도 만들어지지 않음");
await as(null);
await db.query("update profiles set site_id=null where id=$1", [U.W2]);
await as(U.W2);
await expectError("사업장 없는 사용자 차단", `select register_finding('insp_plant','',$1)`, [fd("x")], "사업장");
await as(U.C);
await expectError("권한 없는 사람 차단", `select register_finding('insp_monthly','',$1)`, [fd("x")], "권한");
await as(null);
await db.query("update profiles set site_id=$1 where id=$2", [site, U.W2]);

console.log("\n[비슷한 과거 지적 사례]");
await db.query("insert into finding_examples (problem, emb) values ('소화기 압력 미달', 'AAAA')");
await db.exec("set role authenticated");
await as(U.I); ok((await one("select count(*)::int c from finding_examples")).c === 1, "등록 사용자는 사례 조회");
await as(null); ok((await one("select count(*)::int c from finding_examples")).c === 0, "로그인 안 한 상태는 조회 불가");
await as(U.I);
let blocked = false;
try { await db.query("insert into finding_examples (problem, emb) values ('x','x')"); } catch { blocked = true; }
ok(blocked, "화면 사용자는 사례를 넣을 수 없음");
await db.exec("reset role"); await as(null);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
