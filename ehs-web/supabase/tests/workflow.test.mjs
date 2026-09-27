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

for (const file of ["0001_init.sql", "0002_seed.sql", "0003_notifications.sql"]) {
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
const PROD = await dept("생산팀"), QA = await dept("품질팀"), EHS = await dept("환경안전팀");
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

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
