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

for (const file of ["0001_init.sql", "0002_seed.sql", "0003_notifications.sql", "0004_approvals.sql", "0005_jsa.sql", "0006_permit.sql", "0007_favorites.sql", "0008_inspector.sql", "0009_inspection_with_findings.sql", "0010_register_finding.sql", "0011_finding_examples.sql", "0012_self_assign.sql", "0013_org_hierarchy.sql", "0014_department_roles.sql", "0015_register_finding_on.sql", "0016_approval_cc_exec.sql", "0017_reminders_kpi.sql", "0018_supervisor_daily.sql", "0019_daily_substitute_backfill.sql", "0020_edit_finding.sql", "0021_daily_points.sql", "0022_chem_inspection.sql", "0023_chem_substitute.sql", "0024_rename_risk_adhoc.sql", "0025_approval_guard_permit_merge.sql", "0026_example_type_review.sql", "0027_location_default_dept.sql", "0028_suggestions.sql", "0029_daily_dept_report.sql", "0030_daily_team_head.sql", "0031_daily_overview_perm.sql", "0032_mail_digest.sql", "0033_report_by_dept_member.sql", "0034_notify_settings.sql", "0035_audit_log.sql", "0036_approver_parts.sql", "0037_part_approvers.sql", "0038_user_responsibilities.sql", "0039_report_photo_optional.sql", "0040_perf_indexes.sql", "0041_comment_edit.sql", "0042_skip_resolved_mail.sql"]) {
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
await db.query(`insert into department_roles (department_id, user_id, role) values ($1,$2,'assigner'), ($1,$3,'approver')`, [PROD, U.S, U.H]);

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
await as(U.Q); await expectError("다른 부서원은 완료 처리 불가", `select report_progress($1,$2,'','',null)`, [fid, items({ short: [true], long: [true] })], "부서원만");
await as(U.C); await expectError("같은 부서라도 협력업체는 완료 처리 불가", `select report_progress($1,$2,'','',null)`, [fid, items({ short: [true], long: [true] })], "부서원만");
await as(U.W2); await expectError("조치 요청 부서원은 담당자가 아니어도 완료 처리 가능 (권한 검사 통과)", `select report_progress($1,$2,'a','b',null)`, [fid, items({ long: [false] })], "다시 정해야");
await as(U.W1);
await expectError("일부 조치 오류", `select report_progress($1,$2,'a','b',null)`, [fid, items({ short: [true], long: [false] })], "다시 정해야");
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
const cm = (await one(`select id from finding_comments where finding_id=$1`, [fid])).id;
await as(U.I); await expectError("남의 코멘트 수정 차단", `select edit_comment($1,'바꿈')`, [cm], "본인");
await as(U.C); await db.query(`select edit_comment($1,'확인했습니다 (수정)')`, [cm]);
ok((await one(`select body, updated_at is not null u from finding_comments where id=$1`, [cm])).u, "쓴 사람 코멘트 수정 · 수정 시각");
ok((await one(`select detail from finding_events where finding_id=$1 and action='코멘트 수정'`, [fid])).detail.includes("확인했습니다"), "수정 전 내용이 처리 이력에 남음");
await as(U.I); await expectError("남의 코멘트 삭제 차단", `select delete_comment($1)`, [cm], "본인");
await as(U.A); await db.query(`select delete_comment($1)`, [cm]);
ok((await one(`select count(*)::int c from finding_comments where finding_id=$1`, [fid])).c === 0, "관리자 코멘트 삭제");
ok((await one(`select count(*)::int c from finding_events where finding_id=$1 and action='코멘트 삭제'`, [fid])).c === 1, "삭제 이력");
await as(U.C); await db.query(`select add_comment($1,'확인했습니다',false)`, [fid]);
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
const mailDefault = (await one("select mail_immediate() m")).m; // 0032 기본 : 아침에 모아서
await db.query("update app_settings set value='{\"immediate\": true}' where key='mail'"); // 이 부분은 바로 보내기로 시험
// 이 시점에 종결된 건의 지정·승인 요청은 '이미 처리됨'으로 빠짐 (0042) → 남은 것만 꺼냄
const avail = (await one(`select count(*)::int c from notifications n where status='pending' and not _notification_done(n)`)).c;
const claimed = (await db.query(`select * from claim_notifications(5)`)).rows;
ok(avail > 0 && claimed.length === Math.min(5, avail) && claimed[0].email.endsWith("@test.kr"), "발송기 대기열 가져오기 (처리 안 된 것 최대 5건)");
await db.query(`select finish_notification($1,true,null)`, [claimed[0].id]);
ok((await one(`select count(*)::int c from notifications where status='sending'`)).c === claimed.length - 1, "발송 상태 갱신");
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
// 수신참조(품질직원) · 시행자(작업자1) 를 함께 넘김
const pLineCc = JSON.stringify([...JSON.parse(pLine), { step_kind: "참조", label: "수신참조", approver_id: U.Q }, { step_kind: "시행", label: "시행", approver_id: U.W1 }]);
const pAp = (await one(`select submit_permit($1,$2) id`, [pId, pLineCc])).id;
const cc = await one(`select cc_ids, exec_ids, (select count(*)::int from approval_steps where approval_id=$1) n from approvals where id=$1`, [pAp]);
ok(cc.cc_ids.length === 1 && cc.exec_ids.length === 1 && cc.n === 3, "수신참조·시행자는 결재 단계가 아니라 목록으로 저장");
await expectError("결재 중 신청 내용 수정 차단", `select save_permit($1,$2)`, [pId, pData()], "수정할 수 없습니다");
await as(U.A); await db.query(`select approve_step($1,null)`, [pAp]);
await as(U.H); await db.query(`select approve_step($1,null)`, [pAp]);
const pv = await one(`select status, phase, risk_eval_no from permit_overview where id=$1`, [pId]);
ok(pv.status === "issued" && pv.risk_eval_no?.startsWith("RA-"), "최종 승인 → 발급, 위험성평가 번호 표시");
await as(null);
ok((await one(`select count(*)::int c from notifications where kind='approval_cc' and user_id = any($1::uuid[])`, [[U.Q, U.W1]])).c === 2, "결재 완료 → 수신참조·시행자에게 알림");
await db.exec("set role authenticated"); await as(U.Q);
ok((await one(`select count(*)::int c from approvals where id=$1`, [pAp])).c === 1, "수신참조자는 결재 문서 조회 가능");
await db.exec("reset role");
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

console.log("\n[자진 담당]");
const sa = await reg("insp_plant", U.I, "자진 담당 테스트");
const saF = (await one(`select id from findings where inspection_id=$1 order by seq desc limit 1`, [sa])).id;
await as(U.Q);
await expectError("다른 부서 직원은 자진 담당 불가", `select self_assign_finding($1)`, [saF], "조치 요청 부서");
await as(U.W1);
await db.query(`select self_assign_finding($1)`, [saF]);
await as(null);
const saR = await one(`select f.status, a.assigned_by = a.user_id self from findings f join finding_assignees a on a.finding_id=f.id where f.id=$1 and a.user_id=$2`, [saF, U.W1]);
ok(saR.status === "plan_wait" && saR.self, "요청 부서 직원이 자진 담당 → 계획 수립 단계, 자진 표시");
ok((await one(`select count(*)::int c from finding_events where finding_id=$1 and action='자진 담당'`, [saF])).c === 1, "처리 이력에 '자진 담당' 기록");
await as(U.W1); await expectError("이미 담당자면 중복 불가", `select self_assign_finding($1)`, [saF], "이미");
await as(U.W2); await db.query(`select self_assign_finding($1)`, [saF]); await as(null);
ok((await one(`select count(*)::int c from finding_assignees where finding_id=$1`, [saF])).c === 2, "다른 직원도 함께 자진 담당 가능");

console.log("\n[조직 : 부문 › 부서 › 파트]");
await db.query("update departments set division='천안공장' where id=$1", [PROD]);
const PART = (await one(`insert into departments (site_id, name, parent_id, assigner_id) values ($1,'HBC-C2',$2,$3) returning id, division, assigner_id`, [site, PROD, U.S]));
ok(PART.division === "천안공장" && PART.assigner_id === null, "파트는 상위 부서의 부문을 따르고 지정자·승인자는 비움");
let nested = false;
try { await db.query(`insert into departments (site_id, name, parent_id) values ($1,'하위파트',$2)`, [site, PART.id]); } catch { nested = true; }
ok(nested, "파트 아래 파트는 만들 수 없음");
await db.query("update profiles set department_id=$1 where id=$2", [PART.id, U.W2]);
await as(U.I);
await expectError("파트로 조치 요청 차단", `select register_finding('insp_plant','',$1)`, [JSON.stringify({ ...JSON.parse(fd("파트 요청")), department_id: PART.id })], "부서(팀) 단위");
await as(null);
const hp = await reg("insp_plant", U.I, "파트 소속 직원 지정");
const hpF = (await one(`select id from findings where inspection_id=$1 order by seq desc limit 1`, [hp])).id;
await as(U.S); await db.query(`select assign_finding($1,$2)`, [hpF, [U.W2]]); await as(null);
ok((await one(`select count(*)::int c from finding_assignees where finding_id=$1 and user_id=$2`, [hpF, U.W2])).c === 1, "파트(HBC-C2) 직원을 생산팀 건의 담당자로 지정");
const hp2 = await reg("insp_plant", U.I, "파트 직원 자진 담당");
const hp2F = (await one(`select id from findings where inspection_id=$1 order by seq desc limit 1`, [hp2])).id;
await as(U.W2); await db.query(`select self_assign_finding($1)`, [hp2F]); await as(null);
ok((await one(`select count(*)::int c from finding_assignees where finding_id=$1 and user_id=$2`, [hp2F, U.W2])).c === 1, "파트 직원도 생산팀 건 자진 담당");
await db.query("update profiles set department_id=$1 where id=$2", [PROD, U.W2]);

console.log("\n[지정자·승인자 여러 명]");
ok((await one("select approver_id from departments where id=$1", [PROD])).approver_id === U.H, "첫 번째 승인자가 부서장(결재선용)으로 유지");
await as(U.H); await expectError("관리자 아닌 사람은 목록 변경 불가", "select set_department_roles($1,$2,$3)", [PROD, [U.S], [U.H]], "관리자"); await as(null);
await as(U.A); await db.query("select set_department_roles($1,$2,$3)", [PROD, [U.S, U.W1], [U.H, U.Q]]); await as(null);
const mr = await reg("insp_plant", U.I, "여러 승인자");
const mrF = (await one("select id from findings where inspection_id=$1 order by seq desc limit 1", [mr])).id;
ok((await one("select count(distinct user_id)::int c from notifications where finding_id=$1 and kind='request'", [mrF])).c === 4, "등록 알림 → 지정자 2명 + 승인자 2명");
await as(U.W1); await db.query("select assign_finding($1,$2)", [mrF, [U.W2]]); await as(null);
ok((await one("select status from findings where id=$1", [mrF])).status === "plan_wait", "두 번째 지정자도 담당자 지정");
await as(U.W2);
await db.query("select save_plan($1,$2)", [mrF, JSON.stringify([{ kind: "immediate", content: "조치", target_date: today }])]);
const mrM = (await one("select id from finding_measures where finding_id=$1", [mrF])).id;
await db.query("select report_progress($1,$2,'','완료',$3)", [mrF, JSON.stringify([{ measure_id: mrM, done: true }]), [`${mrF}/after.jpg`]]);
await as(null);
await as(U.Q); await db.query("select approve_finding($1,'')", [mrF]); await as(null);
ok((await one("select status from findings where id=$1", [mrF])).status === "closed", "두 번째 승인자가 종결 승인");
await as(U.A); await db.query("select set_department_roles($1,$2,$3)", [PROD, [U.S], [U.H]]); await as(null);
ok((await one("select approver_id from departments where id=$1", [PROD])).approver_id === U.H, "목록을 바꾸면 부서장도 첫 번째 사람으로 맞춰짐");

console.log("\n[엑셀로 추가 (지난 날짜 등록)]");
await as(U.I);
const past = (await one("select (kst_today() - 3)::text d")).d;
const ex1 = (await one("select register_finding_on('insp_ceo',$1,'',$2,'xlsx-up:t1') id", [past, fd("오프라인 1")])).id;
const exI = await one("select inspection_date::text d, inspector from inspections where id=$1", [ex1]);
ok(exI.d === past && exI.inspector === "대표이사", "지난 날짜 회차로 등록 · 점검자 고정");
await expectError("같은 키 두 번 등록 차단", "select register_finding_on('insp_ceo',$1,'',$2,'xlsx-up:t1')", [past, fd("오프라인 1")], "이미 등록된");
await expectError("미래 날짜 차단", "select register_finding_on('insp_ceo',kst_today()+1,'',$1,null)", [fd("미래")], "오늘 이전");
const ex2 = (await one("select register_finding_on('insp_ceo',$1,'',$2,'xlsx-up:t2') id", [past, fd("오프라인 2")])).id;
ok(ex1 === ex2, "같은 날 엑셀 건은 같은 회차로");
ok((await one("select register_finding('insp_ceo','',$1) id", [fd("화면 등록")])).id !== ex1, "화면 등록(register_finding)은 오늘 회차");
await as(null);

console.log("\n[영업일 · 단계별 알림]");
ok((await one("select biz_days_between('2026-10-16','2026-10-19') n")).n === 1, "금요일 → 월요일 = 1영업일");
await db.query("insert into holidays values ('2026-10-19','시험 공휴일')");
ok((await one("select biz_days_between('2026-10-16','2026-10-20') n")).n === 1, "공휴일은 영업일에서 뺌");
await db.query("delete from holidays");
const rmF = (await one("select id from findings where inspection_id=$1 order by seq desc limit 1", [await reg("insp_plant", U.I, "알림 시험 - 담당자 미지정")])).id;
await db.query("update findings set created_at='2026-10-16 09:00+09' where id=$1", [rmF]);
const rmCount = async (uid, f, stage) => (await one("select count(*)::int c from reminder_log where user_id=$1 and finding_id=$2 and stage=$3", [uid, f, stage])).c;
await db.query("select queue_reminders('2026-10-19')");
ok((await rmCount(U.S, rmF, "assign")) === 0, "1영업일 지남 → 아직 안 보냄");
await db.query("select queue_reminders('2026-10-20')");
ok((await rmCount(U.S, rmF, "assign")) === 1, "2영업일 지남 → 부서 조치담당자 지정자에게");
const dig = await one("select subject, body from notifications where user_id=$1 and kind='reminder' order by created_at desc limit 1", [U.S]);
ok(dig.body.includes("조치담당자 지정이 필요한 건") && dig.body.includes("알림 시험"), "하루 한 통 요약 메일 내용");
await db.query("select queue_reminders('2026-10-21')");
ok((await rmCount(U.S, rmF, "assign")) === 1, "다시 알림 간격(2영업일) 전에는 반복 안 함");
await db.query("select queue_reminders('2026-10-22')");
ok((await rmCount(U.S, rmF, "assign")) === 2, "2영업일 뒤 다시 알림");
ok((await one("select queue_reminders('2026-10-24') n")).n === 0, "토요일에는 보내지 않음");
await db.query("update app_settings set value = jsonb_set(value, '{assign_days}', '5') where key='reminder'");
ok((await one("select count(*)::int c from _reminder_targets('2026-10-20') where finding_id=$1 and stage='assign'", [rmF])).c === 0, "기한 숫자는 환경설정 값을 따름");
await db.query("update app_settings set value = jsonb_set(value, '{assign_days}', '2') where key='reminder'");
// 계획 미수립 · 목표일 임박
await as(U.S); await db.query("select assign_finding($1,$2)", [rmF, [U.W1]]); await as(null);
await db.query("update finding_assignees set assigned_at='2026-10-16 10:00+09' where finding_id=$1", [rmF]);
ok((await one("select count(*)::int c from _reminder_targets('2026-10-20') where finding_id=$1 and stage='plan' and user_id=$2", [rmF, U.W1])).c === 1, "지정 후 2영업일 계획 미수립 → 조치담당자");
await as(U.W1); await db.query("select save_plan($1,$2)", [rmF, JSON.stringify([{ kind: "short", content: "보강", target_date: "2026-10-23" }])]); await as(null);
ok((await one("select count(*)::int c from _reminder_targets('2026-10-22') where finding_id=$1 and stage='due_soon'", [rmF])).c === 1, "목표일 1영업일 전 → 조치담당자");
ok((await one("select count(*)::int c from _reminder_targets('2026-10-27') where finding_id=$1 and stage='overdue'", [rmF])).c === 1, "목표일 지남 → 조치담당자");

console.log("\n[점검 지표 · 권한]");
const yr = Number((await one("select extract(year from kst_today())::int y")).y);
await db.exec("set role authenticated");
await as(U.I); await expectError("기본은 지표 열람 불가 (임직원도)", "select kpi_year($1)", [yr], "권한");
await as(U.A); const k1 = (await one("select kpi_year($1) k", [yr])).k;
const iRow = k1.people.find((p) => p.uid === U.I);
ok(iRow && iRow.found >= 3, `관리자는 열람 · 등록자 발굴 실적 집계 (점검자 ${iRow?.found}건)`);
ok(k1.months.length === 12, "월별 추이 12개월");
await db.exec("reset role"); await as(null);
await db.query("insert into user_permissions values ($1,'insp_kpi','read') on conflict (user_id, module_code) do update set level='read'", [U.H]);
await db.exec("set role authenticated"); await as(U.H);
ok(!!(await one("select kpi_year($1) k", [yr])).k, "권한을 준 사람은 열람 가능");
await db.exec("reset role"); await as(null);
// 점검 주기 : 3주 전부터 매주 → 끝난 주에 등록이 없으면 미진행
await db.query("insert into inspection_schedules (module_code, user_id, period, start_date) values ('insp_daily',$1,'weekly', kst_today() - 21)", [U.Q]);
let q = (await one("select _kpi_compute($1) k", [yr])).k.people.find((p) => p.uid === U.Q);
ok(q && q.expected >= 2 && q.missed === q.expected, `점검 미진행 : 끝난 주기 ${q?.expected}회 모두 미실시`);
await db.query("insert into inspection_checks (module_code, user_id, done_on) values ('insp_daily',$1, kst_today() - 14)", [U.Q]);
q = (await one("select _kpi_compute($1) k", [yr])).k.people.find((p) => p.uid === U.Q);
ok(q.missed === q.expected - 1, "'지적사항 없이 점검 완료' 기록이 있는 주는 실시로 봄");
// 조치 · 지연 : 종결 건 × 조치담당자, 원래 목표일 넘김 = 지연
const kpiAll = (await one("select _kpi_compute($1) k", [yr])).k;
const w2 = kpiAll.people.find((p) => p.uid === U.W2);
ok(w2 && w2.closed >= 1, `조치담당자 개인 조치 건 집계 (작업자2 ${w2?.closed}건)`);
const prodTeam = kpiAll.teams.find((t) => t.team === PROD);
ok(prodTeam && prodTeam.due >= prodTeam.late, `팀 지연 집계 (생산팀 지연 ${prodTeam?.late}/${prodTeam?.due})`);
// 확정 저장
await as(U.A); await db.query("select confirm_kpi($1,'시험')", [yr - 1]);
await expectError("올해는 확정 불가", "select confirm_kpi($1)", [yr], "해가 바뀐 뒤");
ok(!!(await one("select kpi_year($1) k", [yr - 1])).k.confirmed_at, "지난해는 확정본으로 조회");
await as(null);

console.log("\n[관리감독자 일일점검]");
await as(null);
ok((await one("select count(*)::int c from daily_form_items")).c === 106, "양식 4종 항목 106개 (원본 엑셀)");
ok((await one("select count(*)::int c from daily_form_items where form_code='A' and cycle='M'")).c === 6, "A형 월간(M) 항목 6개");
ok((await one("select form from modules where code='insp_daily'")).form === "finding", "일일점검 = 지적사항형 모듈 (현황·알림·지표 공통)");
await as(U.A);
const area = (await one(`insert into daily_areas (site_id, name, form_code, department_id, location_id) values ($1,'HBC-C2 제조실','A',$2,$3) returning id, qr_token`, [site, PROD, loc]));
const pt = await one("insert into daily_points (site_id, name, location_id) values ($1,'HBC-C2 제조실',$2) returning id, qr_token", [site, loc]);
await db.query("insert into daily_area_points values ($1,$2)", [area.id, pt.id]);
await db.query("select set_daily_area_members($1, array[$2]::uuid[])", [area.id, U.W1]);
await as(U.W2);
await expectError("담당 아닌 사람은 대체 점검으로만 저장", "select submit_daily_check($1,'[]')", [pt.qr_token], "누구 대신");
await expectError("없는 QR 차단", "select daily_open('nope')", [], "QR");
await as(U.W1);
let opened = (await one("select daily_open($1) d", [pt.qr_token])).d;
ok(opened.is_member && opened.area.name === "HBC-C2 제조실" && opened.items.length === 36, `QR 열기 → A형 오늘 할 항목 ${opened.items.length}개`);
const dItems = opened.items;
const allO = (over = {}) => JSON.stringify(dItems.map((i) => ({ item_id: i.id, result: "O", ...(over[i.code] ?? {}) })));
await expectError("판정 누락 차단", "select submit_daily_check($1,$2)", [pt.qr_token, JSON.stringify(dItems.slice(1).map((i) => ({ item_id: i.id, result: "O" })))], "판정하지 않은");
await expectError("부적합 내용 필수", "select submit_daily_check($1,$2)", [pt.qr_token, allO({ "1-2": { result: "X" } })], "내용");
await expectError("부적합 처리 방법 필수", "select submit_daily_check($1,$2)", [pt.qr_token, allO({ "1-2": { result: "X", note: "누액" } })], "처리 방법");
const fx1 = "22222222-0000-0000-0000-000000000001", fx2 = "22222222-0000-0000-0000-000000000002";
await expectError("즉시 조치는 개선 후 사진 필수", "select submit_daily_check($1,$2)", [pt.qr_token, allO({ "1-2": { result: "X", note: "누액", action: "immediate", finding: { id: fx1, photos: [`${fx1}/b.jpg`], fix: "조임" } } })], "개선 후 사진");
const res = (await one("select submit_daily_check($1,$2,now()) r", [pt.qr_token, allO({
  "1-2": { result: "X", note: "플랜지 누액", action: "immediate", finding: { id: fx1, photos: [`${fx1}/b.jpg`], after_photos: [`${fx1}/a.jpg`], fix: "볼트 재체결" } },
  "1-3": { result: "X", note: "본체 부식", action: "request", finding: { id: fx2, photos: [`${fx2}/b.jpg`] } },
  "3-1": { result: "△", note: "아차사고 1건 보고" },
  "7-5": { result: "-" },
})])).r;
ok(res.findings === 2, "부적합 2건 → 지적사항 2건");
const f1 = await one("select status, problem, module_code from findings where id=$1", [fx1]);
const f2 = await one("select status from findings where id=$1", [fx2]);
ok(f1.status === "approval_wait" && f1.problem.startsWith("[1-2 "), "즉시 조치 → 바로 승인 대기 (부서장 확인만)");
ok(f2.status === "assign_wait", "개선 요청 → 담당자 지정 대기 (기존 흐름)");
ok((await one("select count(*)::int c from notifications where finding_id=$1 and kind='request'", [fx1])).c === 0
   && (await one("select count(*)::int c from notifications where finding_id=$1 and kind='approval'", [fx1])).c >= 1, "즉시 조치 건은 지정 요청 메일 없이 부서장 승인 요청만");
ok((await one("select count(*)::int c from notifications where finding_id=$1 and kind='request'", [fx2])).c >= 1, "개선 요청 건은 부서 지정자에게 조치 요청");
ok((await one("select count(*)::int c from inspection_checks where module_code='insp_daily' and user_id=$1 and done_on=kst_today()", [U.W1])).c === 1, "점검 실시 → 점검 지표 미진행에서 빠짐");
// 같은 날 다시 저장 : 지적사항 중복 없음, X → O 변경 차단
await db.query("select submit_daily_check($1,$2)", [pt.qr_token, allO({ "1-2": { result: "X", note: "플랜지 누액" }, "1-3": { result: "X", note: "본체 부식" } })]);
ok((await one("select count(*)::int c from findings where module_code='insp_daily'")).c === 2, "같은 날 다시 저장해도 지적사항 중복 없음");
await expectError("지적사항이 된 항목은 X 에서 변경 불가", "select submit_daily_check($1,$2)", [pt.qr_token, allO()], "바꿀 수 없습니다");
// 주간·월간 : 이번 기간에 이미 한 항목은 오늘 할 항목에서 빠짐
await as(null);
await db.query("update daily_checks set check_date = kst_today() - 1 where area_id=$1", [area.id]);
await as(U.W1);
opened = (await one("select daily_open($1) d", [pt.qr_token])).d;
const m11 = opened.items.find((i) => i.code === "1-1");
const sameMonth = (await one("select date_trunc('month', kst_today() - 1) = date_trunc('month', kst_today()) s")).s;
ok(!sameMonth || !!m11.done_on, "월간 항목은 이번 달에 했으면 '이미 함' 표시");
// 월간 일지 · 전자결재
const logId = (await one("select open_daily_log($1, kst_today()) id", [area.id])).id;
await as(U.Q); await expectError("담당 아닌 사람 일지 생성 차단", "select open_daily_log($1, kst_today())", [area.id], "담당");
await as(U.W1);
await db.query("select submit_daily_log($1,$2)", [logId, JSON.stringify([{ step_kind: "담당", label: "작성", approver_id: U.W1 }, { step_kind: "승인", label: "승인", approver_id: U.H }])]);
const ap = await one("select status, title from approvals where module_code='insp_daily' and doc_id=$1", [logId]);
ok(ap.status === "in_review" && ap.title.includes("일일업무일지(A형)"), "월간 일지 상신 → 결재 진행");
ok((await one("select approval_doc_path('insp_daily',$1) p", [logId])).p === `/insp/daily/logs/${logId}`, "전자결재함 → 일지 화면 연결");
await as(U.A); ok((await one("select length(reissue_daily_point_qr($1)) n", [pt.id])).n === 32, "QR 재발급");
await as(U.W1); await expectError("재발급 후 이전 QR 무효", "select daily_open($1)", [pt.qr_token], "QR");
await as(null);


console.log("\n[일일점검 : 대체 점검 · 소급 입력]");
await as(U.A);
const area2 = await one(`insert into daily_areas (site_id, name, form_code, department_id) values ($1,'C형 사무동','C',$2) returning id, qr_token`, [site, PROD]);
await db.query("select set_daily_area_members($1, array[$2]::uuid[])", [area2.id, U.W2]);
ok(!!(await one("select 1 x from inspection_schedules where module_code='insp_daily' and user_id=$1 and period='daily' and is_active", [U.W2])), "담당 지정 → 점검 주기(매일) 자동 등록");
const cItems = (await one("select daily_open($1) d", [area2.qr_token])).d.items;
const allC = JSON.stringify(cItems.map((i) => ({ item_id: i.id, result: "O" })));
await as(U.Q);
let op2 = (await one("select daily_open($1) d", [area2.qr_token])).d;
ok(!op2.is_member && op2.can_substitute && op2.member_list.length === 1, "담당 아닌 임직원 : 대체 점검 가능, 대신할 담당자 목록");
await expectError("대체 점검은 누구 대신인지 필수", "select submit_daily_check($1,$2)", [area2.qr_token, allC], "누구 대신");
await expectError("대체 점검 사유 필수", "select submit_daily_check($1,$2,now(),$3,'')", [area2.qr_token, allC, U.W2], "사유");
await db.query("select submit_daily_check($1,$2,now(),$3,'휴가')", [area2.qr_token, allC, U.W2]);
const sc = await one("select c.substitute_for, c.sub_reason, p.name from daily_checks c join profiles p on p.id=c.user_id where c.area_id=$1", [area2.id]);
ok(sc.substitute_for === U.W2 && sc.sub_reason === "휴가" && sc.name === "품질직원", "대체 점검 기록 (점검자 · 대신한 담당자 · 사유)");
ok((await one("select count(*)::int c from inspection_checks where module_code='insp_daily' and user_id=$1 and done_on=kst_today()", [U.W2])).c === 1, "대신한 담당자는 그날 미진행에서 빠짐");
// 소급
await as(null); await db.query("delete from daily_checks where area_id=$1", [area2.id]); await db.query("delete from inspection_checks where user_id=$1 and module_code='insp_daily'", [U.W2]);
await as(U.Q); await expectError("담당 아닌 사람 소급 차단", "select submit_daily_backfill($1, kst_today()-1, $2, '누락')", [area2.id, allC], "담당");
await as(U.W2);
await expectError("오늘은 소급 불가", "select submit_daily_backfill($1, kst_today(), $2, '누락')", [area2.id, allC], "지난 날짜");
await expectError("소급 사유 필수", "select submit_daily_backfill($1, kst_today()-1, $2, '')", [area2.id, allC], "사유");
const bo = (await one("select daily_backfill_open($1, kst_today()-1) d", [area2.id])).d;
ok(bo.items.length === cItems.length, "소급 입력 화면 : 그날 할 항목");
const bx = "33333333-0000-0000-0000-000000000001";
await db.query("select submit_daily_backfill($1, kst_today()-1, $2, '외근으로 누락, 현장 확인함')", [area2.id, JSON.stringify(cItems.map((i, k) => (k === 0 ? { item_id: i.id, result: "X", note: "멀티탭 과열", action: "request", finding: { id: bx } } : { item_id: i.id, result: "O" })))]);
const bk = await one("select is_backfill, backfill_reason from daily_checks where area_id=$1 and check_date=kst_today()-1", [area2.id]);
ok(bk.is_backfill && bk.backfill_reason.startsWith("외근"), "소급 기록 (표시 · 사유)");
ok((await one("select status from findings where id=$1", [bx])).status === "assign_wait", "소급 입력 부적합도 개선 요청 (사진 없이 가능)");
ok((await one("select count(*)::int c from inspection_checks where module_code='insp_daily' and user_id=$1", [U.W2])).c === 0, "소급 입력한 날은 점검 지표에서 미진행으로 셈");
await expectError("이미 기록 있는 날 소급 차단", "select submit_daily_backfill($1, kst_today()-1, $2, '중복')", [area2.id, allC], "이미 점검 기록");
// 상신된 달은 소급 불가
const lg = (await one("select open_daily_log($1, kst_today()-1) id", [area2.id])).id;
await db.query("select submit_daily_log($1,$2)", [lg, JSON.stringify([{ step_kind: "담당", label: "작성", approver_id: U.W2 }, { step_kind: "승인", label: "승인", approver_id: U.H }])]);
await expectError("상신된 달은 소급 차단", "select submit_daily_backfill($1, kst_today()-2, $2, '누락')", [area2.id, allC], "상신");
await as(U.A); await db.query("select set_daily_area_members($1, '{}'::uuid[])", [area2.id]);
ok((await one("select end_date is not null or not is_active x from inspection_schedules where module_code='insp_daily' and user_id=$1", [U.W2])).x, "담당 해제 → 점검 주기 종료");
await as(null);


console.log("\n[지적사항 수정]");
await as(U.I);
const ef = "44444444-0000-0000-0000-000000000001";
await db.query("select register_finding('insp_monthly','',$1)", [JSON.stringify({ id: ef, location_id: loc, problem: "소화기 압력 미달", department_id: PROD, photos: [] })]);
const loc2 = (await one("select id from locations where name<>'HBC-C2' order by name limit 1")).id;
const edit = (o) => JSON.stringify({ location_id: loc2, sub_location_id: null, sub_location_text: "2층 복도", type_id: typ, problem: "소화기 압력 미달 (게이지 적색)", department_id: PROD, ...o });
await as(U.W1); await expectError("등록자·관리자 아니면 수정 차단", "select update_finding($1,$2)", [ef, edit({})], "수정할 수 없습니다");
await as(U.I);
await expectError("세부장소-장소 불일치 차단", "select update_finding($1,$2)", [ef, edit({ sub_location_id: sub })], "세부장소");
await db.query("select update_finding($1,$2)", [ef, edit({})]);
let ed = await one("select location_id, sub_location_text, finding_type_id, problem from findings where id=$1", [ef]);
ok(ed.location_id === loc2 && ed.sub_location_text === "2층 복도" && ed.finding_type_id === typ && ed.problem.includes("게이지"), "등록자가 장소·유형·문제점 수정");
ok((await one("select detail from finding_events where finding_id=$1 and action='수정'", [ef])).detail.includes("문제점"), "수정 내용이 처리 이력에 남음");
await db.query("select update_finding($1,$2)", [ef, edit({ department_id: QA })]);
ok((await one("select request_department_id d from findings where id=$1", [ef])).d === QA, "담당자 지정 전 : 조치 요청 부서 변경");
ok((await one("select count(*)::int c from notifications where finding_id=$1 and kind='request' and subject like '%조치 요청%'", [ef])).c >= 1, "새 부서에 조치 요청 알림");
await as(U.A); await db.query("select assign_finding($1, array[$2]::uuid[])", [ef, U.Q]);
await as(U.I); await expectError("담당자 지정 후 등록자는 부서 변경 불가", "select update_finding($1,$2)", [ef, edit({ department_id: PROD })], "관리자");
await db.query("select update_finding($1,$2)", [ef, edit({ department_id: QA, problem: "소화기 압력 미달 (교체 필요)" })]);
ok((await one("select problem from findings where id=$1", [ef])).problem.includes("교체"), "담당자 지정 후에도 문제점 수정 가능");
await as(U.A); await db.query("select update_finding($1,$2)", [ef, edit({ department_id: PROD })]);
const rs = await one("select status, request_department_id d, (select count(*)::int from finding_assignees where finding_id=$1) n from findings where id=$1", [ef]);
ok(rs.status === "assign_wait" && rs.d === PROD && rs.n === 0, "관리자 부서 변경 → 담당자 초기화 · 담당자 지정 대기");
await as(null);


console.log("\n[일일점검 : 사람별 Area · 장소별 QR · QR 없는 양식]");
await as(null);
const site2 = site;
const ptA = await one("insert into daily_points (site_id, name) values ($1,'1분석실') returning id, qr_token", [site2]);
const arA = await one("insert into daily_areas (site_id, name, form_code, department_id) values ($1,'품질직원 (B형)','B',$2) returning id, qr_token", [site2, QA]);
const arB = await one("insert into daily_areas (site_id, name, form_code, department_id) values ($1,'생산팀장 (B형)','B',$2) returning id, qr_token", [site2, QA]);
await db.query("insert into daily_area_members values ($1,$2), ($3,$4)", [arA.id, U.Q, arB.id, U.H]);
await db.query("insert into daily_area_points values ($1,$3), ($2,$3)", [arA.id, arB.id, ptA.id]);
await as(U.Q);
let o = (await one("select daily_open($1) d", [ptA.qr_token])).d;
ok(o.area?.id === arA.id && o.point === "1분석실", "같은 QR 을 여러 명이 담당 → 찍은 사람 본인의 점검표");
await as(U.H);
o = (await one("select daily_open($1) d", [ptA.qr_token])).d;
ok(o.area?.id === arB.id, "다른 담당자는 자기 점검표");
await as(U.W1);
o = (await one("select daily_open($1) d", [ptA.qr_token])).d;
ok(o.choose && o.areas.length === 2, "담당 아닌 사람 → 이 장소 담당자 목록 (대체할 사람 선택)");
o = (await one("select daily_open($1,$2) d", [ptA.qr_token, arA.id])).d;
ok(o.area.id === arA.id && !o.is_member, "고른 담당자의 점검표 열기 (대체 점검)");
const bItems = o.items.map((i) => ({ item_id: i.id, result: "O" }));
await db.query("select submit_daily_check($1,$2,now(),$3,'외근',$4)", [ptA.qr_token, JSON.stringify(bItems), U.Q, arA.id]);
const ck = await one("select point_id, substitute_for from daily_checks where area_id=$1 and check_date=kst_today()", [arA.id]);
ok(ck.point_id === ptA.id && ck.substitute_for === U.Q, "대체 점검 저장 · 찍은 QR 지점 기록");
await expectError("A·B형은 담당 Area 링크로 열 수 없음 (현장 QR 필수)", "select daily_open($1)", [arA.qr_token], "현장에 붙은 QR");
await as(null);
const arC = await one("insert into daily_areas (site_id, name, form_code, department_id) values ($1,'부서장 (D형)','D',$2) returning id, qr_token", [site2, QA]);
await db.query("insert into daily_area_members values ($1,$2)", [arC.id, U.Q]);
await as(U.Q);
o = (await one("select daily_open($1) d", [arC.qr_token])).d;
ok(o.area.id === arC.id && o.form.use_qr === false, "C·D형은 QR 없이 [점검하기] 로 열림");
ok((await one("select daily_area_label($1) l", [arA.id])).l === "1분석실", "담당 Area 표시 = 묶인 장소");
await as(null);


console.log("\n[유해화학물질 자체점검]");
await as(null);
ok((await one("select count(*)::int c from chem_items")).c === 12, "점검 항목 12개 (별지 제42호서식)");
ok((await one("select form, is_enabled from modules where code='insp_chem'")).is_enabled, "유해화학물질 자체점검 사용");
const cg = await one("insert into chem_groups (site_id, name, department_id) values ($1,'생산팀 (시험)',$2) returning id", [site, PROD]);
const cp1 = await one("insert into chem_places (group_id, name, sort_order) values ($1,'과수 TANK',10) returning id", [cg.id]);
const cp2 = await one("insert into chem_places (group_id, name, sort_order) values ($1,'WLC',20) returning id", [cg.id]);
await as(U.A); await db.query("select set_chem_group_members($1, array[$2]::uuid[])", [cg.id, U.W1]);
ok(!!(await one("select 1 x from inspection_schedules where module_code='insp_chem' and user_id=$1 and period='weekly'", [U.W1])), "점검자 지정 → 점검 주기(매주) 자동 등록");
await as(U.W2); await expectError("점검자 아닌 사람 차단", "select open_chem_check($1)", [cg.id], "점검자만");
await as(U.W1);
const cid = (await one("select open_chem_check($1) id", [cg.id])).id;
ok((await one("select open_chem_check($1) id", [cg.id])).id === cid, "같은 주에는 점검대장 1장");
const chemItems = (await db.query("select id, code from chem_items order by sort_order")).rows;
const grid = (over = {}) => JSON.stringify(chemItems.flatMap((i) => [cp1.id, cp2.id].map((p) => ({ item_id: i.id, place_id: p, result: over[`${i.code}|${p}`] ?? "ok" }))));
await expectError("빈 칸 차단", "select save_chem_check($1, kst_today(), '10:00 ~ 11:00', $2, '[]')", [cid, JSON.stringify([])], "표시하지 않은");
await expectError("재점검 항목은 비고 필수", "select save_chem_check($1, kst_today(), '', $2, '[]')", [cid, grid({ [`⑫|${cp1.id}`]: "recheck" })], "비고");
const r = (await one("select save_chem_check($1, kst_today(), '13:00 ~ 14:00', $2, $3) r", [cid, grid({ [`⑫|${cp1.id}`]: "recheck", [`①|${cp2.id}`]: "fixed" }), JSON.stringify([{ item_id: chemItems[11].id, note: "방류벽 균열 및 바닥 들뜸" }, { item_id: chemItems[0].id, note: "밸브 체결" }])])).r;
ok(r.findings === 1, "정밀 재점검 필요 → 지적사항 1건");
const cf = await one("select f.status, f.module_code, f.sub_location_text from chem_notes n join findings f on f.id = n.finding_id where n.check_id=$1", [cid]);
ok(cf.status === "assign_wait" && cf.module_code === "insp_chem" && cf.sub_location_text === "과수 TANK", "재점검 지적사항 : 개선 부서 담당자 지정 대기 · 장소");
await db.query("select save_chem_check($1, kst_today(), '13:00 ~ 14:00', $2, $3)", [cid, grid({ [`⑫|${cp1.id}`]: "recheck" }), JSON.stringify([{ item_id: chemItems[11].id, note: "방류벽 균열" }])]);
ok((await one("select count(*)::int c from findings where module_code='insp_chem'")).c === 1, "다시 저장해도 지적사항 중복 없음");
ok((await one("select count(*)::int c from inspection_checks where module_code='insp_chem' and user_id=$1", [U.W1])).c === 1, "점검 지표 실시 기록");
await db.query("select submit_chem_check($1,$2)", [cid, JSON.stringify([{ step_kind: "담당", label: "점검자", approver_id: U.W1 }, { step_kind: "협조", label: "EHS부서장", approver_id: U.A }, { step_kind: "승인", label: "해당부서장", approver_id: U.H }])]);
ok((await one("select status from approvals where module_code='insp_chem' and doc_id=$1", [cid])).status === "in_review", "상신 → 결재 진행");
await expectError("결재 중 수정 차단", "select save_chem_check($1, kst_today(), '', $2, '[]')", [cid, grid()], "결재 중");
ok((await one("select approval_doc_path('insp_chem',$1) p", [cid])).p === `/insp/chem/checks/${cid}`, "전자결재함 → 점검대장 연결");
await as(null);


console.log("\n[유해화학물질 자체점검 : 대체 점검]");
await as(null);
const sg = await one("insert into chem_groups (site_id, name, department_id) values ($1,'품질 (시험)',$2) returning id", [site, QA]);
const sp = await one("insert into chem_places (group_id, name) values ($1,'분석실') returning id", [sg.id]);
await as(U.A); await db.query("select set_chem_group_members($1, array[$2]::uuid[])", [sg.id, U.Q]);
await as(U.W2); await expectError("대체 점검자 명단에 없으면 차단", "select open_chem_check($1)", [sg.id], "대체 점검자만");
await as(U.A); await db.query("select set_chem_substitutes(array[$1]::uuid[])", [U.W2]);
await as(U.W2);
const sid = (await one("select open_chem_check($1) id", [sg.id])).id;
const sItems = (await db.query("select id from chem_items where is_active")).rows;
const sGrid = JSON.stringify(sItems.map((i) => ({ item_id: i.id, place_id: sp.id, result: "ok" })));
await expectError("대체 점검 사유 필수", "select save_chem_check($1, kst_today(), '', $2, '[]')", [sid, sGrid], "대체 점검 사유");
await db.query("select save_chem_check($1, kst_today(), '09:00 ~ 09:30', $2, '[]', '휴가')", [sid, sGrid]);
const subCk = await one("select sub_reason, user_id from chem_checks where id=$1", [sid]);
ok(subCk.sub_reason === "휴가" && subCk.user_id === U.W2, "대체 점검 저장 (점검한 사람 · 사유)");
ok((await one("select count(*)::int c from inspection_checks where module_code='insp_chem' and user_id=$1 and note like '%대체 점검%'", [U.Q])).c === 1, "원래 점검자도 이번 주 실시");
await as(U.Q);
await db.query("select save_chem_check($1, kst_today(), '09:00 ~ 09:30', $2, '[]')", [sid, sGrid]);
ok((await one("select sub_reason from chem_checks where id=$1", [sid])).sub_reason === null, "점검자 본인이 다시 저장하면 대체 표시 없음");
await as(null);


console.log("\n[결재선 검사 · 결재자 변경 · 허가서 동시 저장]");
{
const apLine = (...s) => JSON.stringify(s.map(([k, u]) => ({ step_kind: k, label: k, approver_id: u })));
const apSub = "select _submit_approval('risk_adhoc', gen_random_uuid(), '시험', $1, $2, $3) id";
await as(U.W1);
await expectError("본인 승인 차단", apSub, [site, PROD, apLine(["담당", U.W1], ["승인", U.W1])], "본인은 결재자");
await expectError("필수 결재자(해당부서장) 누락 차단", apSub, [site, PROD, apLine(["담당", U.W1], ["검토", U.W2])], "필수 결재자");
await expectError("협력업체 결재자 차단", apSub, [site, PROD, apLine(["담당", U.W1], ["검토", U.C], ["승인", U.H])], "협력업체");
const apId = (await one(apSub, [site, PROD, apLine(["담당", U.W1], ["검토", U.W2], ["승인", U.H])])).id;
ok(!!apId, "올바른 결재선은 상신");
await as(U.H);
ok(!!(await one(apSub, [site, PROD, apLine(["담당", U.H], ["승인", U.S])])).id, "부서장이 상신하면 본인 대신 다른 결재자로 상신 가능");
await as(U.W1); await expectError("관리자 아니면 결재자 변경 불가", "select admin_change_approver((select id from approval_steps where approval_id=$1 and status='pending'), $2, '퇴사')", [apId, U.Q], "관리자만");
await as(U.A);
await db.query("select admin_change_approver((select id from approval_steps where approval_id=$1 and status='pending'), $2, '퇴사')", [apId, U.Q]);
const ps = await one("select approver_id, comment from approval_steps where approval_id=$1 and status='pending'", [apId]);
ok(ps.approver_id === U.Q && ps.comment.includes("결재자 변경"), "관리자 결재자 변경 (사유 기록)");
ok((await one("select count(*)::int c from notifications where user_id=$1 and kind='approval_request'", [U.Q])).c >= 1, "새 결재자에게 결재 요청 알림");
await as(null); await db.query("update profiles set is_active=false where id=$1", [U.H]);
await as(U.A);
ok((await db.query("select * from stuck_approvals() where approval_id=$1", [apId])).rows.length === 1, "결재자가 사용 중지된 결재 목록");
await db.query("select admin_reject_approval($1, '결재자 퇴사로 다시 상신')", [apId]);
ok((await one("select status from approvals where id=$1", [apId])).status === "rejected", "관리자 반려");
await as(null); await db.query("update profiles set is_active=true where id=$1", [U.H]);
const un = (await one(`select _jsonb_union('[{"id":"a","v":1},{"id":"b","v":1}]', '[{"id":"b","v":2},{"id":"c","v":1}]') u`)).u;
ok(un.length === 3 && un.find((x) => x.id === "b").v === 2, "허가서 기록 합치기 : 양쪽 기록 모두 · 같은 id 는 새 값");
ok(JSON.stringify((await one(`select _jsonb_nonempty('{"a":"x","b":"","c":null}') j`)).j) === '{"a":"x"}', "빈 서명은 다른 사람 서명을 덮지 않음");
}


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

console.log("\n[유형 정리]");
const rvA = (await one("insert into finding_examples (problem, emb, type_name) values ('소화기 압력 게이지 미달', 'AAAA', '부착물') returning id")).id;
const rvB = (await one("insert into finding_examples (problem, emb, type_name) values ('소화기 위치 표시', 'AAAA', '3정5S') returning id")).id;
await as(U.I);
await expectError("관리자 아니면 유형 정리 불가", "select review_example_types($1, '{}', '전기')", [[rvA]], "관리자만");
await as(U.A);
await expectError("없는 유형으로는 정리 불가", "select review_example_types($1, '{}', '없는유형')", [[rvA]], "유형을 선택");
ok((await one("select review_example_types($1, $2, '전기') n", [[rvA], [rvB]])).n === 2, "유형 정리 : 고른 사례 1건 변경 + 1건 그대로 확인");
const rvRows = (await db.query("select type_name, type_checked from finding_examples where id = any($1) order by id", [[rvA, rvB]])).rows;
ok(rvRows[0].type_name === "전기" && rvRows[1].type_name === "3정5S" && rvRows.every((r) => r.type_checked), "바꾼 사례는 새 유형, 그대로 둔 사례는 유지 · 모두 확인 표시");
await as(null);

console.log("\n[장소별 조치 부서]");
const ldExpect = (await one("select count(*)::int c from findings where location_id=$1 and request_department_id=$2", [loc, PROD])).c;
await as(U.I);
const ld = (await db.query("select * from location_dept_stats($1) where location_id=$2 and department_id=$3", [site, loc, PROD])).rows;
ok(ldExpect > 0 && ld.reduce((a, r) => a + r.n, 0) === ldExpect, "과거 기록 장소별 조치 부서 건수 (열람 권한과 무관)");
await as(null);
ok((await db.query("select * from location_dept_stats($1)", [site])).rows.length === 0, "로그인 안 한 상태는 건수 조회 불가");
await db.query("update locations set default_department_id=$1 where id=$2", [QA, loc]);
ok((await one("select default_department_id d from locations where id=$1", [loc])).d === QA, "장소 기본 조치 부서 저장");
await db.query("update locations set default_department_id=null where id=$1", [loc]);

console.log("\n[개선 의견 게시판]");
const sgId = (await one("select gen_random_uuid() id")).id;
await as(U.W1);
await expectError("사진 경로 검증", "select create_suggestion($1,'점검','제목','내용',true,array['other/x.jpg'])", [sgId], "경로");
await expectError("제목 필수", "select create_suggestion($1,'점검','  ','내용',true,'{}')", [sgId], "제목");
await db.query("select create_suggestion($1,'점검','사진 여러 장 한 번에','앨범에서 여러 장 고르기',true,array[$2])", [sgId, `suggestions/${sgId}/a.jpg`]);
ok((await one("select count(*)::int c from notifications where kind='suggestion' and user_id=$1", [U.I])).c === 1, "새 의견 → EHS팀 알림");
ok((await one("select count(*)::int c from notifications where kind='suggestion' and user_id=$1", [U.W1])).c === 0, "작성자 본인에게는 알림 없음");
await as(U.Q);
let sgRow = (await one("select * from list_suggestions(null, false) where id=$1", [sgId]));
ok(sgRow.author_name === "익명" && !sgRow.is_mine, "다른 사용자 목록 : 익명 작성자 가림");
ok((await one("select get_suggestion($1) j", [sgId])).j.author_name === "익명", "다른 사용자 상세 : 익명 작성자 가림");
await as(U.W1);
ok((await one("select * from list_suggestions(null, true) where id=$1", [sgId])).author_name === "익명 (나)", "본인 : 내 글 표시");
await as(U.A);
ok((await one("select get_suggestion($1) j", [sgId])).j.author_name === "작업자1 (익명)", "관리자 : 익명 글 실명 확인");
await db.exec("set role authenticated");
await as(U.Q); ok((await db.query("select * from suggestions")).rows.length === 0, "표 직접 조회로 작성자 확인 불가 (본인·관리자만)");
await as(U.W1); ok((await db.query("select * from suggestions")).rows.length === 1, "본인 글은 직접 조회 가능");
await db.exec("reset role");
await as(U.W2);
await expectError("EHS팀 아니면 처리 불가", "select answer_suggestion($1,'accepted','반영')", [sgId], "EHS팀만");
await expectError("남의 글 수정 불가", "select update_suggestion($1,'점검','x','y',false,'{}')", [sgId], "작성자만");
await as(U.I);
await db.query("select answer_suggestion($1,'reviewing',null)", [sgId]);
await as(U.W1);
await expectError("접수 후 수정 불가", "select update_suggestion($1,'점검','x','y',false,'{}')", [sgId], "접수한 뒤");
await expectError("접수 후 작성자 삭제 불가", "select delete_suggestion($1)", [sgId], "접수 대기");
await as(U.I);
await expectError("미수용은 사유 필수", "select answer_suggestion($1,'rejected','  ')", [sgId], "사유");
await expectError("수용 전 반영 완료 불가", "select answer_suggestion($1,'done',null)", [sgId], "수용한 의견만");
await db.query("select answer_suggestion($1,'accepted','11월 중 반영 예정')", [sgId]);
await db.query("select answer_suggestion($1,'done',null)", [sgId]);
const sgD = (await one("select get_suggestion($1) j", [sgId])).j;
ok(sgD.status === "done" && sgD.answer === "11월 중 반영 예정" && sgD.answered_by_name === "점검자", "수용 → 반영 완료 (답변 유지)");
ok(sgD.events.map((e) => e.action).join(",") === "created,reviewing,accepted,done", "처리 이력 기록");
ok((await one("select count(*)::int c from notifications where kind='suggestion' and user_id=$1", [U.W1])).c === 3, "상태 변경마다 작성자 알림");
await as(U.W1);
await db.query("select add_suggestion_comment($1,'감사합니다')", [sgId]);
ok((await one("select count(*)::int c from notifications where kind='suggestion' and user_id=$1 and subject like '%댓글%'", [U.I])).c === 1, "작성자 댓글 → 답변한 EHS 담당자 알림");
ok((await one("select get_suggestion($1) j", [sgId])).j.comments[0].author_name === "익명 (나) · 작성자", "익명 작성자의 댓글도 이름 가림");
await as(U.A);
ok(JSON.stringify((await one("select delete_suggestion($1) p", [sgId])).p) === JSON.stringify([`suggestions/${sgId}/a.jpg`]), "관리자 삭제 → 지울 사진 경로");
await as(null);
ok((await db.query("select * from list_suggestions(null, false)")).rows.length === 0, "로그인 안 한 상태는 목록 조회 불가");

console.log("\n[관리감독자 일지 → 부서장 일괄 승인]");
ok((await one("select daily_log_deadline('2026-10-01') d")).d.toISOString().slice(0, 10) === "2026-11-06", "마감 = 다음 달 첫째 주 금요일 (10월 → 11/6)");
ok((await one("select daily_log_deadline('2026-04-01') d")).d.toISOString().slice(0, 10) === "2026-05-01", "다음 달 1일이 금요일이면 그날");
await as(U.W1);
const prevLog = (await one("select open_daily_log($1, (date_trunc('month', kst_today()) - interval '1 month')::date) id", [area.id])).id;
const curLog = (await one("select open_daily_log($1, kst_today()) id", [area.id])).id;
await expectError("이전 방식(전자결재)으로 상신된 일지는 새 제출 불가", "select submit_daily_log_to_head($1)", [curLog], "이전 방식");
await as(U.Q); await expectError("담당 아닌 사람 제출 불가", "select submit_daily_log_to_head($1)", [prevLog], "담당 관리감독자만");
await as(U.W1);
await db.query("select submit_daily_log_to_head($1)", [prevLog]);
ok((await one("select status from daily_logs where id=$1", [prevLog])).status === "submitted", "관리감독자 제출");
ok((await one("select count(*)::int c from notifications where user_id=$1 and kind='daily_log' and subject like '%제출%'", [U.H])).c === 1, "제출 → 부서장 알림");
await expectError("제출 후 소급 입력 막힘", "select _daily_backfill_check($1, (date_trunc('month', kst_today()) - interval '1 month')::date + 1)", [area.id], "상신(제출)");
await expectError("이중 제출 차단", "select submit_daily_log_to_head($1)", [prevLog], "이미 제출");
await as(null); await db.query("insert into department_roles (department_id, user_id, role, sort_order) values ($1,$2,'approver',99)", [PROD, U.W2]);
ok((await one("select approver_id from departments where id=$1", [PROD])).approver_id === U.H, "부서장은 그대로 생산팀장");
await as(U.W2); await expectError("종결 승인자 역할만 있으면 일지 승인 불가 (부서장 1명만)", "select approve_daily_logs($1)", [[prevLog]], "부서장만");
await as(null); await db.query("delete from department_roles where department_id=$1 and user_id=$2 and role='approver'", [PROD, U.W2]);
await as(U.H);
await expectError("반려 사유 필수", "select reject_daily_log($1, ' ')", [prevLog], "사유");
await db.query("select reject_daily_log($1, '3일 미점검 사유 기재 필요')", [prevLog]);
ok((await one("select status, reject_reason from daily_logs where id=$1", [prevLog])).reject_reason === "3일 미점검 사유 기재 필요", "부서장 반려 (사유)");
ok((await one("select count(*)::int c from notifications where user_id=$1 and kind='daily_log' and subject like '%반려%'", [U.W1])).c === 1, "반려 → 제출자 알림");
await as(U.W1);
await db.query("select submit_daily_log_to_head($1)", [prevLog]);
await db.query("select cancel_daily_log_submit($1)", [prevLog]);
ok((await one("select status from daily_logs where id=$1", [prevLog])).status === "draft", "승인 전 제출 취소");
await db.query("select submit_daily_log_to_head($1)", [prevLog]);
await as(U.H);
ok((await one("select approve_daily_logs($1) n", [[prevLog]])).n === 1, "부서장 일괄 승인");
const apr = await one("select status, approved_by from daily_logs where id=$1", [prevLog]);
ok(apr.status === "approved" && apr.approved_by === U.H, "승인 상태 · 승인자 기록");
await expectError("승인된 일지 다시 승인 불가", "select approve_daily_logs($1)", [[prevLog]], "제출 상태가 아닙니다");
await as(U.W1); await expectError("승인 후 제출 취소 불가", "select cancel_daily_log_submit($1)", [prevLog], "승인 대기");
await as(null);
const area3 = (await one("insert into daily_areas (site_id, name, form_code, department_id) values ($1,'알림 구역','C',$2) returning id", [site, PROD])).id;
await db.query("insert into daily_area_members values ($1,$2)", [area3, U.W2]);
const remDay = (await one("select daily_log_deadline(kst_today()) d")).d;
const remN = (await one("select queue_daily_log_reminders($1) n", [remDay])).n;
ok(remN >= 1 && (await one("select count(*)::int c from notifications where user_id=$1 and kind='reminder' and subject like '%일지 제출 마감%'", [U.W2])).c === 1, "마감일 미제출 관리감독자 알림");
ok((await one("select queue_daily_log_reminders($1) n", [remDay])).n === 0, "같은 날 두 번 알리지 않음");
ok((await one("select queue_daily_log_reminders(($1::date) - 1) n", [remDay])).n === 0, "마감 2일 전·당일이 아니면 알림 없음");

console.log("\n[관리감독자 전체 현황 권한]");
await as(U.W1); ok((await one("select perm_level('insp_daily_overview') l")).l === 0, "임직원 기본값은 없음 (권한 받은 사람만)");
await as(U.A); ok((await one("select perm_level('insp_daily_overview') l")).l === 2, "관리자는 항상 볼 수 있음");
await as(null); await db.query("insert into user_permissions values ($1,'insp_daily_overview','read')", [U.W1]);
await as(U.W1); ok((await one("select perm_level('insp_daily_overview') l")).l === 1, "환경설정에서 열람 권한 주면 볼 수 있음");
await as(null);

console.log("\n[알림 메일 : 매일 아침 한 번에]");
await db.query("update notifications set status='sent' where status in ('pending','failed')");
const evId = (await one("insert into notifications (user_id, kind, subject, body) values ($1,'assign','[EHS] 조치담당자로 지정되었습니다 : 시험','본문') returning id", [U.W2])).id;
await db.query("insert into notifications (user_id, kind, subject, body) values ($1,'approval_request','[EHS] 결재 요청 : 시험','본문')", [U.W2]);
ok(mailDefault === false, "기본은 바로 보내지 않음 (매일 아침 한 번에)");
await db.query("update app_settings set value='{\"immediate\": false}' where key='mail'");
ok((await db.query("select * from claim_notifications(50)")).rows.length === 0, "단계별 알림은 바로 꺼내 가지 않음 (대기)");
const bizMon = "2026-11-02"; // 월요일
ok((await one("select queue_event_digest($1) n", [bizMon])).n === 1, "아침 메일 : 사람마다 한 통");
ok((await one("select status from notifications where id=$1", [evId])).status === "digested", "원래 알림은 아침 메일에 들어감 표시");
const dg = await one("select subject, body from notifications where user_id=$1 and kind='digest'", [U.W2]);
ok(dg.subject.includes("새 알림 2건") && dg.body.includes("조치담당자로 지정되었습니다 : 시험") && dg.body.includes("결재 요청 : 시험"), "아침 메일 내용 : 새 알림 목록");
const cl = (await db.query("select * from claim_notifications(50)")).rows;
ok(cl.length === 1 && cl[0].subject.includes("오늘의 알림"), "아침 메일만 발송 대기열에서 꺼냄");
ok((await one("select queue_event_digest('2026-11-01') n")).n === 0, "휴일(일요일)에는 모으지 않음");
await db.query("insert into app_settings (key, value) values ('mail','{\"immediate\": true}') on conflict (key) do update set value=excluded.value");
await db.query("insert into notifications (user_id, kind, subject, body) values ($1,'assign','[EHS] 바로','본문')", [U.W2]);
ok((await db.query("select * from claim_notifications(50)")).rows.some((r) => r.subject === "[EHS] 바로"), "바로 보내기로 바꾸면 즉시 발송");
ok((await one("select queue_event_digest($1) n", [bizMon])).n === 0, "바로 보내기일 때는 아침에 모으지 않음");
await db.query("update app_settings set value='{\"immediate\": false}' where key='mail'");

console.log("\n[알림 종류별 설정]");
await db.query("update notifications set status='sent' where status in ('pending','failed','sending')");
const setNotify = (v) => db.query("update app_settings set value=$1 where key='notify'", [JSON.stringify(v)]);
await setNotify({ kinds: { request: "immediate", assigned: "off", approval_result: "immediate" }, stages: {}, daily_deadline: true });
const nOff = (await one("insert into notifications (user_id, kind, subject, body) values ($1,'assigned','[EHS] 끔','b') returning id", [U.W2])).id;
await db.query("insert into notifications (user_id, kind, subject, body) values ($1,'request','[EHS] 요청 바로','b'), ($1,'approval_rejected','[EHS] 결재 반려 바로','b'), ($1,'closed','[EHS] 종결 아침','b')", [U.W2]);
const got2 = (await db.query("select subject from claim_notifications(50)")).rows.map((r) => r.subject);
ok(got2.includes("[EHS] 요청 바로") && got2.includes("[EHS] 결재 반려 바로") && !got2.includes("[EHS] 종결 아침") && !got2.includes("[EHS] 끔"), "종류별 : 바로 보낼 종류만 즉시 (결재 결과는 한 묶음)");
await db.query("select queue_event_digest($1)", [bizMon]);
ok((await one("select status from notifications where id=$1", [nOff])).status === "expired", "보내지 않음으로 정한 종류는 만료");
ok((await one("select body from notifications where user_id=$1 and kind='digest' order by created_at desc limit 1", [U.W2])).body.includes("종결 아침"), "아침 종류는 아침 메일에");
await setNotify({ kinds: {}, stages: { overdue: false }, daily_deadline: false });
ok((await db.query("select * from _reminder_targets(kst_today() + 30) where stage='overdue'")).rows.length === 0, "끈 단계(목표일 지남)는 아침 알림에서 빠짐");
ok((await one("select queue_daily_log_reminders($1) n", [remDay])).n === 0, "일지 마감 알림 끄기");
await setNotify({ kinds: {}, stages: {}, daily_deadline: true });

console.log("\n[감사 로그]");
const al = async (where, p = []) => (await db.query(`select * from audit_log where ${where} order by id`, p)).rows;
ok((await al("target_table='approvals' and action='상신'")).length > 0, "결재 상신 기록");
const apOk = await al("target_table='approval_steps' and action='승인'");
ok(apOk.length > 0 && apOk.every((r) => r.actor_name) && apOk[0].changes.status[1] === "approved", "결재 승인 기록 (처리자 · 이전→이후)");
ok((await al("target_table='approval_steps' and action='반려'")).length > 0, "결재 반려 기록");
ok((await al("target_table='approval_steps' and action='결재자 변경'")).length > 0, "관리자 결재자 변경 기록");
ok((await al("target_table='approval_steps' and action like '결재 단계%'")).length === 0, "차례 넘어가는 자동 변경은 기록 안 함");
await as(U.A);
await db.query("update profiles set is_admin=true where id=$1", [U.W2]);
await db.query("update profiles set position='대리', is_admin=false where id=$1", [U.W2]);
const auPr = await al("target_table='profiles' and target_id=$1 and actor_id=$2", [U.W2, U.A]);
ok(auPr.some((r) => r.action === "관리자 지정") && auPr.some((r) => r.action === "관리자 해제" && r.changes.position[1] === "대리"), "계정 : 관리자 지정/해제 · 정보 수정 (처리자 = 관리자)");
await db.query("insert into user_permissions values ($1,'insp_kpi','read') on conflict (user_id, module_code) do update set level='read'", [U.W2]);
ok((await al("target_table='user_permissions' and category='권한' and actor_id=$1", [U.A])).length > 0, "권한 부여 기록");
await db.query("select audit_note('계정','비밀번호 초기화','profiles',$1,'작업자2',null)", [U.W2]);
ok((await al("action='비밀번호 초기화'")).length === 1, "화면에서 한 일(비밀번호 초기화) 기록");
await as(U.W1); await expectError("관리자 아니면 기록 추가 불가", "select audit_note('계정','x','profiles','x','x',null)", [], "관리자만");
await as(null);
await expectError("감사 로그 수정 불가 (관리자·DB 직접도)", "update audit_log set action='x' where id=(select min(id) from audit_log)", [], "수정하거나 삭제할 수 없습니다");
await expectError("감사 로그 삭제 불가", "delete from audit_log", [], "수정하거나 삭제할 수 없습니다");
await db.exec("set role authenticated");
await as(U.W1); ok((await db.query("select * from audit_log")).rows.length === 0, "일반 사용자는 감사 로그 조회 불가");
await as(U.A); ok((await db.query("select * from audit_log")).rows.length > 0, "관리자는 조회");
await db.exec("reset role"); await as(null);

console.log("\n[파트 종결 승인자]");
const P3 = (await one(`insert into departments (site_id, name, parent_id) values ($1,'HBC-C3',$2) returning id`, [site, PROD])).id;
for (const [k, name, d] of [["L2", "C2리더", PART.id], ["L3", "C3리더", P3], ["M2", "C2작업자", PART.id]]) {
  const id = (await one(`insert into auth.users values (gen_random_uuid()) returning id`)).id;
  await db.query(`insert into profiles (id,email,name,site_id,department_id,user_type) values ($1,$2,$3,$4,$5,'employee')`, [id, `${k.toLowerCase()}@test.kr`, name, site, d]);
  U[k] = id;
}
await as(U.A);
await expectError("파트에는 지정자를 둘 수 없음", "select set_department_roles($1,$2,$3)", [PART.id, [U.L2], [U.L2]], "종결 승인자만");
await db.query("select set_department_roles($1,'{}',$2)", [PART.id, [U.L2]]);
await db.query("select set_department_roles($1,'{}',$2)", [P3, [U.L3]]);
await as(null);
ok((await one("select approver_id from departments where id=$1", [PART.id])).approver_id === null, "파트 승인자는 결재선 부서장(departments.approver_id)에 들어가지 않음");
ok((await one("select approver_id from departments where id=$1", [PROD])).approver_id === U.H, "부서 결재선 부서장은 그대로");
const finishBy = async (who, problem) => {
  const ap = await reg("insp_plant", U.I, problem);
  const apF = (await one("select id from findings where inspection_id=$1 order by seq desc limit 1", [ap])).id;
  await as(U.S); await db.query("select assign_finding($1,$2)", [apF, [who]]);
  await as(who); await db.query("select save_plan($1,$2)", [apF, JSON.stringify([{ kind: "immediate", content: "조치", target_date: today }])]);
  const apM = (await one("select id from finding_measures where finding_id=$1", [apF])).id;
  await db.query("select report_progress($1,$2,'','완료',$3)", [apF, JSON.stringify([{ measure_id: apM, done: true }]), [`${apF}/after.jpg`]]);
  await as(null);
  return apF;
};
const approvalTo = async (id) => (await db.query("select distinct user_id from notifications where finding_id=$1 and kind='approval'", [id])).rows.map((r) => r.user_id).sort();
const c2F = await finishBy(U.M2, "C2 파트 건");
ok(JSON.stringify(await approvalTo(c2F)) === JSON.stringify([U.H, U.L2].sort()), "C2 파트 건 종결 승인 요청 → 부서장 + C2 리더만 (C3 리더 제외)");
await as(U.L2); ok((await db.query("select * from my_approval_findings() id where id=$1", [c2F])).rows.length === 1, "C2 리더 내 할 일에 표시");
await as(U.L3); ok((await db.query("select * from my_approval_findings() id where id=$1", [c2F])).rows.length === 0, "C3 리더 내 할 일에는 없음");
await as(null);
ok((await db.query("select distinct user_id from _reminder_targets(kst_today() + 30) where finding_id=$1 and stage='approve'", [c2F])).rows.length === 2, "아침 승인 대기 알림도 부서장 + C2 리더");
const teamF = await finishBy(U.W1, "부서 직속 직원 건");
ok(JSON.stringify(await approvalTo(teamF)) === JSON.stringify([U.H]), "파트가 없는 건 → 부서 승인자(부서장)만");
ok((await one("select count(*)::int c from notifications where finding_id=$1 and kind='request' and user_id=$2", [c2F, U.L2])).c === 0, "파트 리더는 등록(조치 요청) 메일 안 받음");
await as(U.L3); await expectError("다른 파트 리더는 승인 불가", "select approve_finding($1,'')", [c2F], "권한"); await as(null);
await as(U.L2); await db.query("select approve_finding($1,'')", [c2F]); await as(null);
ok((await one("select status from findings where id=$1", [c2F])).status === "closed", "C2 리더가 자기 파트 건 종결 승인");
await as(U.A); await db.query("select set_department_roles($1,'{}','{}')", [PART.id]); await db.query("select set_department_roles($1,'{}','{}')", [P3]); await as(null);

console.log("\n[퇴사 전 역할 확인·빼기]");
{
  const rid = (await one(`insert into auth.users values (gen_random_uuid()) returning id`)).id;
  await db.query(`insert into profiles (id,email,name,site_id,department_id,user_type) values ($1,'r@test.kr','퇴사자',$2,$3,'employee')`, [rid, site, PROD]);
  await as(U.A); await db.query("select set_department_roles($1,$2,$3)", [PROD, [U.S], [U.H, rid]]); await db.query("select set_department_roles($1,'{}',$2)", [PART.id, [rid]]); await as(null);
  const rf = await reg("insp_plant", U.I, "퇴사자 담당 건");
  const rfF = (await one("select id from findings where inspection_id=$1 order by seq desc limit 1", [rf])).id;
  await as(U.S); await db.query("select assign_finding($1,$2)", [rfF, [rid]]); await as(null);
  await as(U.W1); await expectError("관리자 아니면 조회 불가", "select * from user_responsibilities($1)", [rid], "관리자만"); await as(null);
  await as(U.A);
  const before = (await db.query("select * from user_responsibilities($1)", [rid])).rows;
  ok(before.filter((r) => r.kind === "부서·결재자").length === 2 && before.some((r) => r.kind === "진행 중인 지적사항" && r.link === `/findings/${rfF}` && !r.releasable), "부서·파트 승인자 2건 + 진행 중인 지적사항 표시");
  ok((await one("select release_user_roles($1) n", [rid])).n === 2, "역할 지정 한 번에 빼기");
  const after = (await db.query("select * from user_responsibilities($1)", [rid])).rows;
  ok(after.length === 1 && after[0].kind === "진행 중인 지적사항", "지적사항은 남겨 두고 다른 사람으로 바꾸도록 안내");
  await as(null);
  ok((await one("select approver_id from departments where id=$1", [PROD])).approver_id === U.H, "부서장(첫 번째 승인자)은 그대로");
}

console.log("\n[개선 후 사진 없이 완료 처리]");
{
  const np = await reg("insp_plant", U.I, "사진 필요 없는 조치");
  const npF = (await one("select id from findings where inspection_id=$1 order by seq desc limit 1", [np])).id;
  await as(U.S); await db.query("select assign_finding($1,$2)", [npF, [U.W1]]);
  await as(U.W1); await db.query("select save_plan($1,$2)", [npF, JSON.stringify([{ kind: "immediate", content: "교육 실시", target_date: today }])]);
  const npM = (await one("select id from finding_measures where finding_id=$1", [npF])).id;
  ok((await one("select report_progress($1,$2,'','교육 완료',null) r", [npF, JSON.stringify([{ measure_id: npM, done: true }])])).r === "approval_wait", "개선 후 사진 없이 완료 보고 → 승인 대기");
  await as(null);
}

console.log("\n[속도 개선 : 장소 조건 목록]");
{
  await as(U.W1);
  const pairs = (await db.query("select * from finding_location_pairs($1)", [["insp_plant"]])).rows;
  const raw = (await db.query("select distinct request_department_id, location_id from findings where module_code=$1 and location_id is not null", ["insp_plant"])).rows;
  ok(pairs.length > 0 && pairs.length === raw.length, "장소 조건 (부서, 장소) 쌍을 중복 없이 한 번에");
  await as(null);
}

console.log("\n[이미 처리한 건은 메일로 보내지 않음]");
{
  await as(null);
  await db.query("update notifications set status='sent' where status in ('pending','failed','sending')");
  const waitF = (await one("select id from findings where status='approval_wait' limit 1")).id;
  const add = async (kind, f, subject, link = null) =>
    (await one("insert into notifications (user_id, finding_id, kind, subject, body, link) values ($1,$2,$3,$4,'b',$5) returning id", [U.W2, f, kind, subject, link])).id;
  const done = {
    request: await add("request", fid, "[EHS] 조치담당자 지정 요청 : 종결 건"),
    assigned: await add("assigned", fid, "[EHS] 조치담당자로 지정 : 종결 건"),
    approval: await add("approval", fid, "[EHS] 종결 승인 요청 : 종결 건"),
    rejected: await add("rejected", fid, "[EHS] 반려 : 종결 건"),
    suggestion: await add("suggestion", null, "[EHS] 새 개선 의견 #1 : 지워진 의견", "/suggestions/" + sgId),
  };
  const keepApproval = await add("approval", waitF, "[EHS] 종결 승인 요청 : 승인 대기 건");
  const keepClosed = await add("closed", fid, "[EHS] 종결되었습니다 : 종결 건");
  await db.query("select queue_event_digest($1)", ["2026-11-02"]);
  const st = async (id) => one("select status, last_error from notifications where id=$1", [id]);
  for (const [k, id] of Object.entries(done)) {
    const r = await st(id);
    ok(r.status === "expired" && r.last_error === "이미 처리됨", `처리 끝난 알림은 빼기 : ${k}`);
  }
  ok((await st(keepApproval)).status === "digested", "아직 승인 대기인 건의 승인 요청은 아침 메일에 들어감");
  ok((await st(keepClosed)).status === "digested", "종결 소식은 그대로 보냄");
  const body = (await one("select body from notifications where user_id=$1 and kind='digest' order by created_at desc limit 1", [U.W2])).body;
  ok(body.includes("승인 대기 건") && !body.includes("종결 승인 요청 : 종결 건"), "아침 메일 내용에 처리된 건이 없음");
  await db.query(`insert into app_settings (key, value) values ('mail','{"immediate": true}') on conflict (key) do update set value=excluded.value`);
  const imm = await add("approval", fid, "[EHS] 바로 : 이미 종결");
  const got = (await db.query("select subject from claim_notifications(50)")).rows.map((r) => r.subject);
  ok(!got.includes("[EHS] 바로 : 이미 종결") && (await st(imm)).status === "expired", "바로 보내기에서도 처리된 건은 빼기");
  await db.query(`update app_settings set value='{"immediate": false}' where key='mail'`);
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
