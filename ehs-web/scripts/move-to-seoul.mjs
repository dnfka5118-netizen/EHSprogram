// 시드니 → 서울 Supabase 이전 (사용자·설정만, 점검/허가서/JSA/결재 등 문서는 옮기지 않음)
//
// 준비
//   1) 기존(시드니) 프로젝트 SQL Editor 에서 scripts/move-to-seoul/export-auth.sql 실행
//   2) 새(서울) 프로젝트 SQL Editor 에서 migrations 0001~0007 실행
//   3) ehs-web/.env.seoul 에 새 프로젝트 값 3개 (.env.local 과 같은 이름)
//
// 실행
//   node scripts/move-to-seoul.mjs          → 확인만 (아무것도 바꾸지 않음)
//   node scripts/move-to-seoul.mjs --apply  → 실제 이전
//
// 비밀번호는 암호화된 값 그대로 옮기므로 각자 쓰던 비밀번호로 로그인된다.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

function readEnv(file) {
  return Object.fromEntries(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
const client = (env) =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const oldEnv = readEnv(".env.local");
const newEnv = readEnv(".env.seoul");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!newEnv[k]) throw new Error(`.env.seoul 에 ${k} 값이 없습니다.`);
}
if (oldEnv.NEXT_PUBLIC_SUPABASE_URL === newEnv.NEXT_PUBLIC_SUPABASE_URL) throw new Error(".env.seoul 이 기존 프로젝트 주소와 같습니다.");
const src = client(oldEnv);
const dst = client(newEnv);

const must = (label) => ({ data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const all = (db, table) => db.from(table).select("*").range(0, 9999).then(must(`${table} 조회`));

// ── 1. 확인 ─────────────────────────────────────────────
const users = await src.rpc("_export_auth_users").then(must("기존 사용자 조회 (export-auth.sql 을 기존 프로젝트에서 실행했는지 확인)"));
const S = {};
for (const t of ["sites", "departments", "profiles", "modules", "user_permissions", "locations", "sub_locations", "finding_types", "approval_template_steps"]) {
  S[t] = await all(src, t);
}
const dstModules = await all(dst, "modules").catch(() => null);
if (!dstModules) throw new Error("새 프로젝트에 테이블이 없습니다. 0001~0007 SQL 을 먼저 실행하세요.");
await dst.from("profiles").select("favorites").limit(1).then(must("새 프로젝트에 0007 이 적용되지 않았습니다"));
const dstProfiles = await all(dst, "profiles");
const dstUsers = (await dst.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? [];
if (dstProfiles.length || dstUsers.length) throw new Error(`새 프로젝트에 이미 사용자가 ${Math.max(dstProfiles.length, dstUsers.length)}명 있습니다. 빈 프로젝트에서만 실행합니다.`);
const noHash = users.filter((u) => !u.encrypted_password);

console.log("옮길 내용");
console.log(`  사용자        ${users.length}명 (비밀번호 없음 ${noHash.length}명 → 기본 비밀번호로)`);
for (const [t, rows] of Object.entries(S)) console.log(`  ${t.padEnd(24)} ${rows.length}`);
if (!APPLY) {
  console.log("\n확인만 했습니다. 실제 이전은 --apply 를 붙여 실행하세요.");
  process.exit(0);
}

// ── 2. 새 프로젝트의 기본(시드) 설정 지우기 ───────────────
const wipe = (t, col = "id") => dst.from(t).delete().not(col, "is", null).then(must(`${t} 비우기`));
await wipe("approval_template_steps");
await wipe("sub_locations");
await wipe("locations");
await wipe("finding_types");
await wipe("departments");
await wipe("sites");

// ── 3. 설정·사용자 넣기 (id 그대로) ──────────────────────
const put = (t, rows) => (rows.length ? dst.from(t).insert(rows).then(must(`${t} 넣기`)) : null);
const upsert = (t, rows, onConflict) => (rows.length ? dst.from(t).upsert(rows, { onConflict }).then(must(`${t} 넣기`)) : null);

await put("sites", S.sites);
await put("departments", S.departments.map((d) => ({ ...d, assigner_id: null, approver_id: null })));
await upsert("modules", S.modules, "code");

let done = 0;
for (const u of users) {
  const { error } = await dst.auth.admin.createUser({
    id: u.id,
    email: u.email,
    email_confirm: true,
    user_metadata: u.raw_user_meta_data ?? {},
    ...(u.encrypted_password ? { password_hash: u.encrypted_password } : { password: oldEnv.INITIAL_PASSWORD || "0000" }),
  });
  if (error) throw new Error(`사용자 ${u.email}: ${error.message}`);
  if (++done % 20 === 0) console.log(`  사용자 ${done}/${users.length}`);
}
await put("profiles", S.profiles);
for (const d of S.departments.filter((x) => x.assigner_id || x.approver_id)) {
  await dst.from("departments").update({ assigner_id: d.assigner_id, approver_id: d.approver_id }).eq("id", d.id).then(must("부서 지정자·승인자"));
}
await put("user_permissions", S.user_permissions);
await put("locations", S.locations);
await put("sub_locations", S.sub_locations);
await put("finding_types", S.finding_types);
await put("approval_template_steps", S.approval_template_steps);

// ── 4. 결과 확인 ─────────────────────────────────────────
console.log("\n이전 완료. 새 프로젝트 건수");
for (const t of Object.keys(S)) {
  const { count } = await dst.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(24)} ${count} ${count === S[t].length ? "✓" : `(기존 ${S[t].length})`}`);
}
