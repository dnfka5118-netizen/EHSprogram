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
  // 부문은 부서에만 적고 파트는 상위 부서를 따름 (DB 가 맞춤), 파트의 지정자·승인자는 비움
  const parent = nullable(s(fd, "parent_id"));
  const division = parent ? null : nullable(s(fd, "division"));
  const { error } = id
    ? await supabase
        .from("departments")
        .update({
          name,
          division,
          parent_id: parent,
          sort_order: n(fd, "sort_order"),
          is_active: fd.get("is_active") === "on",
        })
        .eq("id", id)
    : await supabase.from("departments").insert({ site_id: s(fd, "site_id"), name, division, parent_id: parent, sort_order: n(fd, "sort_order") });
  if (error) return { error: toMessage(error) };
  // 지정자·승인자 여러 명 (부서만, 순서 = 고른 순서 · 첫 번째 승인자 = 결재선 부서장)
  if (id && !parent) {
    const ids = (k: string) => fd.getAll(k).map(String).filter(Boolean);
    const r = await supabase.rpc("set_department_roles", { p_dept: id, p_assigners: ids("assigner_ids"), p_approvers: ids("approver_ids") });
    if (r.error) return { error: toMessage(r.error) };
  }
  return done();
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

// ---------------------------------------------------------------- 양식별 기본 결재선
export type TemplateInput = {
  step_kind: string;
  label: string;
  resolver: string;
  department_id: string | null;
  user_id: string | null;
  required: boolean;
};

export async function saveApprovalTemplate(moduleCode: string, steps: TemplateInput[]): Promise<ActionState> {
  await requireAdmin();
  if (steps.length === 0) return { error: "결재 단계를 1개 이상 등록해 주세요." };
  for (const [i, st] of steps.entries()) {
    if (!st.label.trim()) return { error: `${i + 1}단계 표시명을 입력해 주세요.` };
    if (st.resolver === "dept_head" && !st.department_id) return { error: `${i + 1}단계 : 부서를 선택해 주세요.` };
    if (st.resolver === "user" && !st.user_id) return { error: `${i + 1}단계 : 결재자를 선택해 주세요.` };
  }
  const supabase = await createClient();
  const { error: delErr } = await supabase.from("approval_template_steps").delete().eq("module_code", moduleCode);
  if (delErr) return { error: toMessage(delErr) };
  const { error } = await supabase.from("approval_template_steps").insert(
    steps.map((st, i) => ({
      module_code: moduleCode,
      step_order: i + 1,
      step_kind: st.step_kind,
      label: st.label.trim(),
      resolver: st.resolver,
      department_id: st.resolver === "dept_head" ? st.department_id : null,
      user_id: st.resolver === "user" ? st.user_id : null,
      required: st.required,
    })),
  );
  if (error) return { error: toMessage(error) };
  return done("결재선을 저장했습니다. 다음 상신부터 적용됩니다.");
}

// ---------------------------------------------------------------- 단계별 알림 · 공휴일 · 점검 주기
const REMINDER_KEYS = ["assign_days", "plan_days", "due_before_days", "approve_days", "repeat_days"] as const;

export async function saveReminderSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const value: Record<string, number> = {};
  for (const k of REMINDER_KEYS) {
    const v = Number(fd.get(k));
    if (!Number.isInteger(v) || v < (k === "due_before_days" ? 0 : 1) || v > 30) return { error: "일수는 1 ~ 30 사이 정수로 입력해 주세요 (목표일 전 알림은 0 가능)." };
    value[k] = v;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ key: "reminder", value, updated_at: new Date().toISOString() });
  return error ? { error: toMessage(error) } : done();
}

export async function saveHoliday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const day = s(fd, "day");
  if (fd.get("intent") === "delete") {
    const { error } = await supabase.from("holidays").delete().eq("day", day);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "날짜를 선택해 주세요." };
  const { error } = await supabase.from("holidays").upsert({ day, name: s(fd, "name") });
  return error ? { error: toMessage(error) } : done();
}

export async function saveSchedule(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { error } = await supabase.from("inspection_schedules").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const period = s(fd, "period");
  if (!["daily", "weekly", "monthly"].includes(period)) return { error: "주기를 선택해 주세요." };
  const start = s(fd, "start_date");
  const end = nullable(s(fd, "end_date"));
  if (end && start && end < start) return { error: "종료일이 시작일보다 빠릅니다." };
  const row = { period, end_date: end, note: nullable(s(fd, "note")), ...(start ? { start_date: start } : {}) };
  if (id) {
    const { error } = await supabase.from("inspection_schedules").update({ ...row, is_active: fd.get("is_active") === "on" }).eq("id", id);
    return error ? { error: toMessage(error) } : done();
  }
  const module_code = s(fd, "module_code");
  const users = fd.getAll("user_id").map(String).filter(Boolean);
  if (!module_code || users.length === 0) return { error: "점검과 점검자를 선택해 주세요." };
  const { error } = await supabase.from("inspection_schedules").insert(users.map((user_id) => ({ ...row, module_code, user_id })));
  return error ? { error: toMessage(error).replace("이미 등록된 값입니다.", "이미 주기가 정해진 사람이 있습니다. 목록에서 수정해 주세요.") } : done();
}

// ---------------------------------------------------------------- 관리감독자 일일점검 : 구역 · 양식 항목
export async function saveDailyArea(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("daily_checks").select("id", { count: "exact", head: true }).eq("area_id", id);
    if (count) return { error: `점검 기록이 ${count}건 있어 삭제할 수 없습니다. '사용' 을 끄면 QR 이 막힙니다.` };
    const { error } = await supabase.from("daily_areas").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const name = s(fd, "name");
  const form_code = s(fd, "form_code");
  if (!name || !form_code) return { error: "구역 이름과 양식을 입력해 주세요." };
  const row = {
    name,
    form_code,
    department_id: nullable(s(fd, "department_id")),
    area_text: nullable(s(fd, "area_text")),
    sort_order: n(fd, "sort_order"),
    is_active: id ? fd.get("is_active") === "on" : true,
  };
  let areaId = id;
  if (id) {
    const { error } = await supabase.from("daily_areas").update(row).eq("id", id);
    if (error) return { error: toMessage(error) };
  } else {
    if (!me.site_id) return { error: "관리자 계정에 사업장이 지정되어 있지 않습니다." };
    const { data, error } = await supabase.from("daily_areas").insert({ ...row, site_id: s(fd, "site_id") || me.site_id }).select("id").single();
    if (error) return { error: toMessage(error) };
    areaId = data.id;
  }
  const members = fd.getAll("member").map(String).filter(Boolean);
  const points = fd.getAll("point").map(String).filter(Boolean);
  const [{ error }, { error: pErr }] = await Promise.all([
    supabase.rpc("set_daily_area_members", { p_area: areaId, p_users: members }),
    supabase.rpc("set_daily_area_points", { p_area: areaId, p_points: points }),
  ]);
  return error || pErr ? { error: toMessage(error ?? pErr) } : done();
}

// 현장 QR 지점 (장소 · 세부장소)
export async function saveDailyPoint(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("daily_checks").select("id", { count: "exact", head: true }).eq("point_id", id);
    if (count) return { error: `이 QR 로 점검한 기록이 ${count}건 있어 삭제할 수 없습니다. '사용' 을 끄면 QR 이 막힙니다.` };
    const { error } = await supabase.from("daily_points").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const name = s(fd, "name");
  if (!name) return { error: "QR 지점 이름을 입력해 주세요. (예 : HBC-C1 제조소)" };
  const row = {
    name,
    location_id: nullable(s(fd, "location_id")),
    sub_location_id: nullable(s(fd, "sub_location_id")),
    sort_order: n(fd, "sort_order"),
    is_active: id ? fd.get("is_active") === "on" : true,
  };
  if (!me.site_id && !id) return { error: "관리자 계정에 사업장이 지정되어 있지 않습니다." };
  const { error } = id ? await supabase.from("daily_points").update(row).eq("id", id) : await supabase.from("daily_points").insert({ ...row, site_id: me.site_id });
  return error ? { error: toMessage(error) } : done();
}

export async function reissueDailyQr(pointId: string): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reissue_daily_point_qr", { p_point: pointId });
  return error ? { error: toMessage(error) } : done("QR 을 새로 발급했습니다. 이전 QR 은 더 이상 열리지 않으니 새로 인쇄해 붙여 주세요.");
}

export async function saveDailyForm(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_forms")
    .update({ name: s(fd, "name"), form_no: nullable(s(fd, "form_no")), writer_note: nullable(s(fd, "writer_note")), is_active: fd.get("is_active") === "on" })
    .eq("code", s(fd, "code"));
  return error ? { error: toMessage(error) } : done();
}

export async function saveDailyItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("daily_results").select("item_id", { count: "exact", head: true }).eq("item_id", id);
    if (count) return { error: "점검 기록이 있는 항목은 삭제할 수 없습니다. '사용' 을 꺼 주세요." };
    const { error } = await supabase.from("daily_form_items").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const content = s(fd, "content");
  const cycle = s(fd, "cycle");
  if (!content) return { error: "세부 항목을 입력해 주세요." };
  if (!["D", "W", "M"].includes(cycle)) return { error: "점검 주기를 골라 주세요." };
  const row = { category: s(fd, "category"), code: s(fd, "code"), content, cycle, cycle_note: nullable(s(fd, "cycle_note")), sort_order: n(fd, "sort_order") };
  const { error } = id
    ? await supabase.from("daily_form_items").update({ ...row, is_active: fd.get("is_active") === "on" }).eq("id", id)
    : await supabase.from("daily_form_items").insert({ ...row, form_code: s(fd, "form_code") });
  return error ? { error: toMessage(error) } : done();
}

// ---------------------------------------------------------------- 유해화학물질 자체점검 : 점검 단위 · 장소 · 항목
export async function saveChemGroup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("chem_checks").select("id", { count: "exact", head: true }).eq("group_id", id);
    if (count) return { error: `점검대장이 ${count}장 있어 삭제할 수 없습니다. '사용' 을 꺼 주세요.` };
    const { error } = await supabase.from("chem_groups").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const name = s(fd, "name");
  if (!name) return { error: "점검 단위 이름을 입력해 주세요. (예 : 생산팀 (HBC))" };
  const row = { name, department_id: nullable(s(fd, "department_id")), sort_order: n(fd, "sort_order"), is_active: id ? fd.get("is_active") === "on" : true };
  let gid = id;
  if (id) {
    const { error } = await supabase.from("chem_groups").update(row).eq("id", id);
    if (error) return { error: toMessage(error) };
  } else {
    if (!me.site_id) return { error: "관리자 계정에 사업장이 지정되어 있지 않습니다." };
    const { data, error } = await supabase.from("chem_groups").insert({ ...row, site_id: me.site_id }).select("id").single();
    if (error) return { error: toMessage(error) };
    gid = data.id;
  }
  const { error } = await supabase.rpc("set_chem_group_members", { p_group: gid, p_users: fd.getAll("member").map(String).filter(Boolean) });
  return error ? { error: toMessage(error) } : done();
}

export async function saveChemPlace(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("chem_results").select("place_id", { count: "exact", head: true }).eq("place_id", id);
    if (count) return { error: "점검 기록이 있는 장소는 삭제할 수 없습니다. '사용' 을 꺼 주세요." };
    const { error } = await supabase.from("chem_places").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const name = s(fd, "name");
  if (!name) return { error: "점검장소 이름을 입력해 주세요." };
  const row = { name, sort_order: n(fd, "sort_order") };
  const { error } = id
    ? await supabase.from("chem_places").update({ ...row, is_active: fd.get("is_active") === "on" }).eq("id", id)
    : await supabase.from("chem_places").insert({ ...row, group_id: s(fd, "group_id") });
  return error ? { error: toMessage(error) } : done();
}

export async function saveChemItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (fd.get("intent") === "delete") {
    const { count } = await supabase.from("chem_results").select("item_id", { count: "exact", head: true }).eq("item_id", id);
    if (count) return { error: "점검 기록이 있는 항목은 삭제할 수 없습니다. '사용' 을 꺼 주세요." };
    const { error } = await supabase.from("chem_items").delete().eq("id", id);
    return error ? { error: toMessage(error) } : done("삭제되었습니다.");
  }
  const content = s(fd, "content");
  if (!content) return { error: "점검 항목 내용을 입력해 주세요." };
  const row = { code: s(fd, "code"), content, sort_order: n(fd, "sort_order") };
  const { error } = id ? await supabase.from("chem_items").update({ ...row, is_active: fd.get("is_active") === "on" }).eq("id", id) : await supabase.from("chem_items").insert(row);
  return error ? { error: toMessage(error) } : done();
}

// 유해화학물질 대체 점검자 명단 (기본 : EHS부서장 · EHS 점검원)
export async function saveChemSubstitutes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chem_substitutes", { p_users: fd.getAll("member").map(String).filter(Boolean) });
  return error ? { error: toMessage(error) } : done();
}

// ---------------------------------------------------------------- 유형 정리 (과거 사례)
export async function reviewExampleTypes(ids: number[], keep: number[], type: string | null): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_example_types", { p_ids: ids, p_keep: keep, p_type: type });
  return error ? { error: toMessage(error) } : { ok: true, message: ids.length ? `${ids.length}건을 '${type}'(으)로 정리했습니다.` : "그대로 두었습니다." };
}
