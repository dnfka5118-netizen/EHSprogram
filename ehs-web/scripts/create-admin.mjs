// 첫 관리자 계정 생성 : node scripts/create-admin.mjs 이메일 이름
// .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_PASSWORD 사용
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const [email, name] = process.argv.slice(2);
if (!email || !name) {
  console.error("사용법: node scripts/create-admin.mjs 이메일 이름");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const password = env.INITIAL_PASSWORD || "000000";

const { data: site } = await supabase.from("sites").select("id").eq("code", "CA").maybeSingle();
const { data: dept } = site
  ? await supabase.from("departments").select("id").eq("site_id", site.id).in("name", ["EHS부서", "환경안전팀"]).limit(1)
      .maybeSingle()
  : { data: null };

const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error("계정 생성 실패:", error.message);
  process.exit(1);
}
const { error: pErr } = await supabase.from("profiles").insert({
  id: data.user.id,
  email: email.toLowerCase(),
  name,
  site_id: site?.id ?? null,
  department_id: dept?.id ?? null,
  is_admin: true,
  must_change_password: true,
});
if (pErr) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error("프로필 생성 실패:", pErr.message);
  process.exit(1);
}
console.log(`관리자 생성 완료: ${email} / 초기 비밀번호 ${password} (첫 로그인 시 변경)`);
