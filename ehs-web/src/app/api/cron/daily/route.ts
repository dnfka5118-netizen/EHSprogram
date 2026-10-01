import { createAdminClient } from "@/lib/supabase/admin";
import { mailConfigured, processOutbox } from "@/lib/mail";
import { fmtDate, todayKst } from "@/lib/format";
import { MEASURE_LABEL } from "@/lib/labels";
import type { FindingOverview, MeasureKind } from "@/lib/types";

export const maxDuration = 300;

const DUE_SOON_DAYS = 3;

// 매일 아침 요약 알림 (vercel.json 의 crons 로 호출, Authorization: Bearer CRON_SECRET)
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!mailConfigured()) return Response.json({ skipped: "SMTP 미설정" });

  const admin = createAdminClient();
  const today = todayKst();
  const soon = new Date(Date.parse(today) + DUE_SOON_DAYS * 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString();

  const [{ data: open }, { data: measures }, { data: assignees }, { data: depts }, { data: admins }] = await Promise.all([
    admin.from("finding_overview").select("*").neq("status", "closed"),
    admin.from("finding_measures").select("finding_id, kind, target_date").eq("is_done", false).lte("target_date", soon),
    admin.from("finding_assignees").select("finding_id, user_id"),
    admin.from("department_roles").select("department_id, user_id, role"),
    admin.from("profiles").select("id").eq("is_admin", true).eq("is_active", true),
  ]);

  const findings = new Map(((open ?? []) as FindingOverview[]).map((f) => [f.id, f]));
  const roleUsers = (dept: string, role?: string) => (depts ?? []).filter((r) => r.department_id === dept && (!role || r.role === role)).map((r) => r.user_id as string);
  const adminIds = (admins ?? []).map((a) => a.id as string);
  const lines = new Map<string, { overdue: string[]; soon: string[]; assign: string[]; approve: string[] }>();
  const bucket = (uid: string) => {
    if (!lines.has(uid)) lines.set(uid, { overdue: [], soon: [], assign: [], approve: [] });
    return lines.get(uid)!;
  };
  const label = (f: FindingOverview) => `${f.module_name} #${f.seq} ${f.location_name ?? ""} - ${f.problem.slice(0, 40)}`;

  // 1) 조치담당자 : 기한 초과 / 임박
  for (const m of measures ?? []) {
    const f = findings.get(m.finding_id);
    if (!f || f.status !== "in_progress") continue;
    const text = `${label(f)} [${MEASURE_LABEL[m.kind as MeasureKind]} 목표 ${fmtDate(m.target_date)}]`;
    for (const a of (assignees ?? []).filter((x) => x.finding_id === f.id)) {
      (m.target_date < today ? bucket(a.user_id).overdue : bucket(a.user_id).soon).push(text);
    }
  }
  // 2) 지정자 : 하루 이상 담당자 미지정 / 3) 부서장 : 승인 대기
  for (const f of findings.values()) {
    if (f.status === "assign_wait" && f.created_at < yesterday) {
      const to = roleUsers(f.request_department_id);
      for (const uid of new Set(to.length ? to : adminIds)) bucket(uid).assign.push(label(f));
    }
    if (f.status === "approval_wait") {
      const ap = roleUsers(f.request_department_id, "approver");
      for (const uid of ap.length ? ap : adminIds) bucket(uid).approve.push(label(f));
    }
  }

  const section = (title: string, items: string[]) => (items.length ? `■ ${title} (${items.length}건)\n${items.map((i) => `- ${i}`).join("\n")}\n\n` : "");
  const rows = [...lines.entries()].map(([user_id, b]) => ({
    user_id,
    kind: "digest",
    subject: `[EHS] 오늘의 환경안전 할 일${b.overdue.length ? ` (기한 초과 ${b.overdue.length}건)` : ""}`,
    body:
      `${today} 기준 처리가 필요한 항목입니다.\n\n` +
      section("목표일이 지난 조치", b.overdue) +
      section(`${DUE_SOON_DAYS}일 이내 목표일`, b.soon) +
      section("조치담당자 지정 대기", b.assign) +
      section("종결 승인 대기", b.approve),
  }));
  if (rows.length) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < 20; i++) {
    const r = await processOutbox(50);
    sent += r.sent;
    failed += r.failed;
    if (r.sent + r.failed === 0) break;
  }
  return Response.json({ digests: rows.length, sent, failed });
}
