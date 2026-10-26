import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyLogFor, type DailyLogData, type LogReview } from "./daily-log";

// 관리감독자 일일점검 → 부서 월간 레포트 (0029) : 부서(팀)의 구역별 일지를 모아 부서장이 한 번에 승인
//   점검 실시율 = 제때 한 날 ÷ (제때 + 소급 + 미점검) — 점검 지표와 같이 소급은 미진행
//   개선조치율   = 올해 발굴 중 종결 ÷ 올해 발굴

export type ReportRow = {
  areaId: string;
  areaName: string;
  formCode: string;
  members: string[];
  logId: string | null;
  review: LogReview | null;
  legacy: string | null; // 예전 전자결재 상태 (있으면 그 결재로 처리)
  onTime: number;
  backfill: number;
  substitute: number;
  missed: number;
  rate: number | null;
  found: number;
  foundYear: number;
  closedYear: number;
  yearRate: number | null;
  overdue: number;
};

export type TeamReport = {
  team: { id: string; name: string };
  heads: string[];
  ym: string; // YYYY-MM-01
  deadline: string;
  rows: ReportRow[];
  totals: Omit<ReportRow, "areaId" | "areaName" | "formCode" | "members" | "logId" | "review" | "legacy">;
  repeats: { area: string; code: string; content: string; count: number }[]; // 그달 같은 항목 부적합(X) 3회 이상
  logs: DailyLogData[]; // 인쇄용
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// 다음 달 첫째 주 금요일 (DB daily_log_deadline 과 같음)
export function logDeadline(ym: string) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const first = new Date(Date.UTC(y, m, 1));
  const add = (5 - first.getUTCDay() + 7) % 7;
  return new Date(first.getTime() + add * 86400000).toISOString().slice(0, 10);
}

async function teamAreas(supabase: SupabaseClient, teamId: string, ym: string) {
  const { data: parts } = await supabase.from("departments").select("id").eq("parent_id", teamId);
  const deptIds = [teamId, ...(parts ?? []).map((p) => p.id as string)];
  const { data: areas } = await supabase
    .from("daily_areas")
    .select("id, name, form_code, is_active, sort_order, created_at, daily_area_members(profiles(name)), daily_logs(id, ym)")
    .in("department_id", deptIds)
    .order("sort_order")
    .order("name");
  type A = { id: string; name: string; form_code: string; is_active: boolean; created_at: string; daily_area_members: { profiles: { name: string } | null }[]; daily_logs: { id: string; ym: string }[] };
  const monthEnd = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
  // 그 달에 있던 구역 (사용 중이거나 그 달 일지가 있는 구역)
  return ((areas ?? []) as unknown as A[]).filter((a) => a.created_at.slice(0, 10) <= monthEnd && (a.is_active || a.daily_logs.some((l) => l.ym === ym)));
}

// 부서장 이름 : 부서장(부서 결재자) 1명, 비어 있으면 부서 역할 '승인자' (DB daily_team_heads 와 같음, 0030)
export async function getTeamHeads(supabase: SupabaseClient, teamId: string): Promise<string[]> {
  const [{ data: team }, { data: roles }] = await Promise.all([
    supabase.from("departments").select("approver_id, approver:profiles!departments_approver_id_fkey(name)").eq("id", teamId).maybeSingle(),
    supabase.from("department_roles").select("user_id, profiles(name)").eq("department_id", teamId).eq("role", "approver"),
  ]);
  const out = new Map<string, string>();
  const t = team as unknown as { approver_id: string | null; approver: { name: string } | null } | null;
  if (t?.approver_id) return [t.approver?.name ?? ""].filter(Boolean);
  for (const r of (roles ?? []) as unknown as { user_id: string; profiles: { name: string } | null }[]) if (!out.has(r.user_id)) out.set(r.user_id, r.profiles?.name ?? "");
  return [...out.values()].filter(Boolean);
}

export async function getTeamReport(supabase: SupabaseClient, teamId: string, ym: string): Promise<TeamReport | null> {
  const { data: team } = await supabase.from("departments").select("id, name").eq("id", teamId).maybeSingle();
  if (!team) return null;
  const areas = await teamAreas(supabase, teamId, ym);
  const logs = (await Promise.all(areas.map((a) => getDailyLogFor(supabase, a.id, ym)))).filter(Boolean) as DailyLogData[];
  const logIds = logs.map((d) => d.id).filter(Boolean);
  const { data: aps } = logIds.length
    ? await supabase.from("approvals").select("doc_id, status").eq("module_code", "insp_daily").in("doc_id", logIds).neq("status", "withdrawn")
    : { data: [] };
  const legacy = new Map(((aps ?? []) as { doc_id: string; status: string }[]).map((a) => [a.doc_id, a.status]));
  const heads = await getTeamHeads(supabase, teamId);

  const rows: ReportRow[] = logs.map((d, i) => {
    const a = areas[i];
    const kinds = Object.values(d.dayKind);
    const checkedDays = new Set(Object.values(d.cells).flatMap((o) => Object.keys(o))).size;
    const backfill = kinds.filter((k) => k === "backfill").length;
    const missed = kinds.filter((k) => k === "missed").length;
    const onTime = Math.max(0, checkedDays - backfill);
    return {
      areaId: a.id,
      areaName: a.name,
      formCode: a.form_code,
      members: a.daily_area_members.map((m) => m.profiles?.name ?? "").filter(Boolean),
      logId: d.id || null,
      review: d.review,
      legacy: d.id ? (legacy.get(d.id) ?? null) : null,
      onTime,
      backfill,
      substitute: kinds.filter((k) => k === "substitute").length,
      missed,
      rate: pct(onTime, onTime + backfill + missed),
      found: d.counts.found,
      foundYear: d.counts.foundYear,
      closedYear: d.counts.closedYear,
      yearRate: pct(d.counts.closedYear, d.counts.foundYear),
      overdue: d.counts.overdueYear,
    };
  });
  const sum = (k: keyof ReportRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const onTime = sum("onTime"), backfill = sum("backfill"), missed = sum("missed"), foundYear = sum("foundYear"), closedYear = sum("closedYear");
  const repeats = logs.flatMap((d, i) =>
    d.items
      .map((it) => ({ area: areas[i].name, code: it.code, content: it.content, count: Object.values(d.cells[it.id] ?? {}).filter((v) => v === "X").length }))
      .filter((x) => x.count >= 3),
  );
  return {
    team: { id: team.id as string, name: team.name as string },
    heads,
    ym,
    deadline: logDeadline(ym),
    rows,
    totals: {
      onTime,
      backfill,
      substitute: sum("substitute"),
      missed,
      rate: pct(onTime, onTime + backfill + missed),
      found: sum("found"),
      foundYear,
      closedYear,
      yearRate: pct(closedYear, foundYear),
      overdue: sum("overdue"),
    },
    repeats: repeats.sort((p, q) => q.count - p.count),
    logs,
  };
}

// 제출 현황판 : 부서(팀)마다 구역 수 · 제출 · 승인 · 반려 · 미제출
export type BoardRow = { teamId: string; team: string; areas: number; submitted: number; approved: number; rejected: number; notSubmitted: number };

export async function getSubmitBoard(supabase: SupabaseClient, ym: string): Promise<BoardRow[]> {
  const monthEnd = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [{ data: areas }, { data: depts }] = await Promise.all([
    supabase.from("daily_areas").select("id, is_active, created_at, department_id, daily_logs(id, ym, status)"),
    supabase.from("departments").select("id, name, parent_id, sort_order").order("sort_order"),
  ]);
  type A = { id: string; is_active: boolean; created_at: string; department_id: string | null; daily_logs: { id: string; ym: string; status: string }[] };
  const list = ((areas ?? []) as unknown as A[]).filter((a) => a.department_id && a.created_at.slice(0, 10) <= monthEnd && (a.is_active || a.daily_logs.some((l) => l.ym === ym)));
  const ids = list.flatMap((a) => a.daily_logs.filter((l) => l.ym === ym).map((l) => l.id));
  const { data: aps } = ids.length ? await supabase.from("approvals").select("doc_id, status").eq("module_code", "insp_daily").in("doc_id", ids).neq("status", "withdrawn") : { data: [] };
  const legacy = new Map(((aps ?? []) as { doc_id: string; status: string }[]).map((a) => [a.doc_id, a.status]));
  const dept = new Map(((depts ?? []) as { id: string; name: string; parent_id: string | null; sort_order: number }[]).map((d) => [d.id, d]));
  const out = new Map<string, BoardRow & { order: number }>();
  for (const a of list) {
    const d = dept.get(a.department_id!);
    const team = d?.parent_id ? dept.get(d.parent_id) : d;
    if (!team) continue;
    const row = out.get(team.id) ?? { teamId: team.id, team: team.name, areas: 0, submitted: 0, approved: 0, rejected: 0, notSubmitted: 0, order: team.sort_order };
    row.areas++;
    const l = a.daily_logs.find((x) => x.ym === ym);
    const st = l ? (legacy.get(l.id) === "approved" ? "approved" : legacy.get(l.id) === "in_review" ? "submitted" : l.status) : "draft";
    if (st === "approved") row.approved++;
    else if (st === "submitted") row.submitted++;
    else if (st === "rejected") row.rejected++;
    else row.notSubmitted++;
    out.set(team.id, row);
  }
  return [...out.values()].sort((p, q) => p.order - q.order).map((r) => ({ teamId: r.teamId, team: r.team, areas: r.areas, submitted: r.submitted, approved: r.approved, rejected: r.rejected, notSubmitted: r.notSubmitted }));
}
