"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toMessage } from "@/lib/errors";
import { mailConfigured, renderMail, sendMail } from "@/lib/mail";
import type { ActionState } from "@/lib/types";

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const n = (fd: FormData, key: string) => Number(fd.get(key) ?? 0) || 0;
const nullable = (v: string) => (v === "" ? null : v);
const initialPassword = () => process.env.INITIAL_PASSWORD || "000000";

function done(message = "저장되었습니다."): ActionState {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------- 사용자
type NewUser = {
  email: string;
  name: string;
  site_id: string | null;
  department_id: string | null;
  position: string | null;
  user_type: "employee" | "contractor";
  company_name: string | null;
  is_admin: boolean;
};

async function insertUser(u: NewUser): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: initialPassword(),
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  if (error) return toMessage(error);
  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, ...u, must_change_password: true });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return toMessage(pErr);
  }
  return null;
}

export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = s(fd, "email").toLowerCase();
  const name = s(fd, "name");
  if (!email || !name) return { error: "이메일과 이름은 필수입니다." };
  const userType = s(fd, "user_type") === "contractor" ? "contractor" : "employee";
  const err = await insertUser({
    email,
    name,
    site_id: nullable(s(fd, "site_id")),
    department_id: nullable(s(fd, "department_id")),
    position: nullable(s(fd, "position")),
    user_type: userType,
    company_name: userType === "contractor" ? nullable(s(fd, "company_name")) : null,
    is_admin: fd.get("is_admin") === "on",
  });
  if (err) return { error: err };
  return done(`${name}님 계정을 만들었습니다. 초기 비밀번호: ${initialPassword()}`);
}

// 일괄 등록 : 한 줄에 "이메일, 이름, 부서명, 직위"
export async function bulkCreateUsers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const siteId = s(fd, "site_id");
  const userType = s(fd, "user_type") === "contractor" ? "contractor" : "employee";
  const company = nullable(s(fd, "company_name"));
  if (!siteId) return { error: "사업장을 선택해 주세요." };

  const supabase = await createClient();
  const { data: depts } = await supabase.from("departments").select("id, name").eq("site_id", siteId);
  const deptId = (name: string) => depts?.find((d) => d.name === name)?.id ?? null;

  const lines = s(fd, "rows").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "등록할 사용자를 입력해 주세요." };

  const failed: string[] = [];
  let ok = 0;
  for (const line of lines) {
    const [email, name, dept, position] = line.split(/[,\t]/).map((x) => x?.trim() ?? "");
    if (!email?.includes("@") || !name) {
      failed.push(`${line} → 형식 오류`);
      continue;
    }
    const dId = dept ? deptId(dept) : null;
    if (dept && !dId) {
      failed.push(`${email} → 부서 '${dept}' 없음`);
      continue;
    }
    const err = await insertUser({
      email: email.toLowerCase(),
      name,
      site_id: siteId,
      department_id: dId,
      position: nullable(position ?? ""),
      user_type: userType,
      company_name: userType === "contractor" ? company : null,
      is_admin: false,
    });
    if (err) failed.push(`${email} → ${err}`);
    else ok++;
  }
  revalidatePath("/", "layout");
  if (failed.length) return { error: `${ok}명 등록, ${failed.length}건 실패\n${failed.join("\n")}` };
  return { ok: true, message: `${ok}명 등록 완료. 초기 비밀번호: ${initialPassword()}` };
}

export async function updateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = s(fd, "id");
  const userType = s(fd, "user_type") === "contractor" ? "contractor" : "employee";
  const isAdmin = fd.get("is_admin") === "on";
  const isActive = fd.get("is_active") === "on";
  if (id === me.id && (!isAdmin || !isActive)) return { error: "본인의 관리자 권한이나 사용 상태는 해제할 수 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      name: s(fd, "name"),
      site_id: nullable(s(fd, "site_id")),
      department_id: nullable(s(fd, "department_id")),
      position: nullable(s(fd, "position")),
      user_type: userType,
      company_name: userType === "contractor" ? nullable(s(fd, "company_name")) : null,
      is_admin: isAdmin,
      is_active: isActive,
    })
    .eq("id", id);
  if (error) return { error: toMessage(error) };

  // 사용 중지 계정은 로그인 자체를 차단
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: isActive ? "none" : "876000h" });
  return done();
}

export async function resetPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = s(fd, "id");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: initialPassword() });
  if (error) return { error: toMessage(error) };
  await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
  return done(`비밀번호를 초기화했습니다: ${initialPassword()} (다음 로그인 시 변경 필요)`);
}

export async function savePermissions(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = s(fd, "id");
  const supabase = await createClient();
  const { data: modules } = await supabase.from("modules").select("code");
  for (const m of modules ?? []) {
    const level = s(fd, `perm_${m.code}`);
    if (level === "default" || level === "") {
      await supabase.from("user_permissions").delete().eq("user_id", id).eq("module_code", m.code);
    } else {
      const { error } = await supabase.from("user_permissions").upsert({ user_id: id, module_code: m.code, level });
      if (error) return { error: toMessage(error) };
    }
  }
  return done("권한을 저장했습니다.");
}

// ---------------------------------------------------------------- 공통 삭제
// 이미 점검·지적사항에서 쓰인 항목은 과거 기록 보호를 위해 삭제 대신 "사용 해제" 를 안내
async function removeRow(table: string, id: string, label: string): Promise<ActionState> {
  if (!id) return { error: "삭제할 항목을 찾지 못했습니다." };
  const supabase = await createClient();
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503")
      return {
        error:
          `이 ${label}은(는) 이미 등록된 점검·지적사항에서 사용 중이라 삭제할 수 없습니다.\n` +
          "'사용' 체크를 해제하고 저장하면 새로 입력할 때 목록에서 숨겨집니다 (과거 기록은 유지).",
      };
    return { error: toMessage(error) };
  }
  if (!count) return { error: "삭제하지 못했습니다. 이미 삭제되었는지 확인해 주세요." };
  return done(`${label}을(를) 삭제했습니다.`);
}

// ---------------------------------------------------------------- 사업장 / 부서
export async function saveSite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("intent") === "delete") return removeRow("sites", s(fd, "id"), "사업장");
  const supabase = await createClient();
  const id = s(fd, "id");
  const row = { code: s(fd, "code").toUpperCase(), name: s(fd, "name"), sort_order: n(fd, "sort_order"), is_active: id ? fd.get("is_active") === "on" : true };
  if (!row.code || !row.name) return { error: "코드와 사업장명은 필수입니다." };
  const { error } = id ? await supabase.from("sites").update(row).eq("id", id) : await supabase.from("sites").insert(row);
  return error ? { error: toMessage(error) } : done();
}

export async function saveDepartment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("intent") === "delete") return removeRow("departments", s(fd, "id"), "부서");
  const supabase = await createClient();
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return { error: "부서명을 입력해 주세요." };
  const { error } = id
    ? await supabase
        .from("departments")
        .update({
          name,
          sort_order: n(fd, "sort_order"),
          is_active: fd.get("is_active") === "on",
          assigner_id: nullable(s(fd, "assigner_id")),
          approver_id: nullable(s(fd, "approver_id")),
        })
        .eq("id", id)
    : await supabase.from("departments").insert({ site_id: s(fd, "site_id"), name, sort_order: n(fd, "sort_order") });
  return error ? { error: toMessage(error) } : done();
}

// ---------------------------------------------------------------- 장소 / 유형
export async function saveLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("intent") === "delete") return removeRow("locations", s(fd, "id"), "장소");
  const supabase = await createClient();
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return { error: "장소명을 입력해 주세요." };
  const { error } = id
    ? await supabase.from("locations").update({ name, sort_order: n(fd, "sort_order"), is_active: fd.get("is_active") === "on" }).eq("id", id)
    : await supabase.from("locations").insert({ site_id: s(fd, "site_id"), name, sort_order: n(fd, "sort_order") });
  return error ? { error: toMessage(error) } : done();
}

export async function saveSubLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("intent") === "delete") return removeRow("sub_locations", s(fd, "id"), "세부장소");
  const supabase = await createClient();
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return { error: "세부장소명을 입력해 주세요." };
  const { error } = id
    ? await supabase.from("sub_locations").update({ name, sort_order: n(fd, "sort_order"), is_active: fd.get("is_active") === "on" }).eq("id", id)
    : await supabase.from("sub_locations").insert({ location_id: s(fd, "location_id"), name, sort_order: n(fd, "sort_order") });
  return error ? { error: toMessage(error) } : done();
}

export async function saveType(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (fd.get("intent") === "delete") return removeRow("finding_types", s(fd, "id"), "유형");
  const supabase = await createClient();
  const id = s(fd, "id");
  const name = s(fd, "name");
  if (!name) return { error: "유형명을 입력해 주세요." };
  const row = { name, sort_order: n(fd, "sort_order"), is_active: id ? fd.get("is_active") === "on" : true };
  const { error } = id ? await supabase.from("finding_types").update(row).eq("id", id) : await supabase.from("finding_types").insert(row);
  return error ? { error: toMessage(error) } : done();
}

// ---------------------------------------------------------------- 메일
export async function sendTestMail(): Promise<ActionState> {
  const me = await requireAdmin();
  if (!mailConfigured()) return { error: "SMTP 설정이 없습니다. 환경변수를 확인해 주세요." };
  const { html, text } = renderMail(me.name, "EHS 통합관리 메일 발송 테스트입니다.\n이 메일이 보이면 알림 설정이 정상입니다.", process.env.APP_URL ?? null);
  try {
    await sendMail(me.email, "[EHS] 메일 발송 테스트", html, text);
    return { ok: true, message: `${me.email} 로 테스트 메일을 보냈습니다.` };
  } catch (e) {
    return { error: `발송 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}
