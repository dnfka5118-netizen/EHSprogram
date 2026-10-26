import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 관리감독자 일일점검 : 구역(장소)별 오늘 실시 · 이번 달 미점검 영업일 · 월간 일지 제출 상태
//   장소별 점검 현황 탭(DailyPlaces) · 전체 현황(DailyOverview) 공용

export type PlaceArea = {
  id: string;
  name: string;
  form_code: string;
  qr_token: string;
  area_text: string | null;
  created_at: string;
  departments: { id: string; name: string; parent_id: string | null } | null;
  daily_forms: { use_qr: boolean } | null;
  daily_area_points: { daily_points: { name: string } | null }[];
  daily_area_members: { profiles: { name: string } | null }[];
};
type Check = { area_id: string; check_date: string; submitted_at: string; profiles: { name: string } | null; sub: { name: string } | null };

export type PlaceRow = {
  a: PlaceArea;
  teamId: string;
  team: string;
  who: string;
  where: string;
  t: Check | undefined; // 오늘 점검 기록
  done: number; // 이번 달 점검한 날 수
  missed: string[]; // 이번 달 지난 영업일(오늘 제외) 중 기록 없는 날
};

export async function loadPlaceStatus(supabase: SupabaseClient, today: string) {
  const month = `${today.slice(0, 7)}-01`;
  const [{ data: areas }, { data: checks }, { data: hol }, { data: allDepts }] = await Promise.all([
    supabase
      .from("daily_areas")
      .select(
        "id, name, form_code, qr_token, area_text, created_at, departments(id, name, parent_id), daily_forms(use_qr), daily_area_points(daily_points(name)), daily_area_members(profiles(name))",
      )
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("daily_checks")
      .select("area_id, check_date, submitted_at, profiles!daily_checks_user_id_fkey(name), sub:profiles!daily_checks_substitute_for_fkey(name)")
      .gte("check_date", month),
    supabase.from("holidays").select("day").gte("day", month).lte("day", today),
    supabase.from("departments").select("id, name, sort_order"),
  ]);
  const deptRows = (allDepts ?? []) as { id: string; name: string; sort_order: number }[];
  const deptName = new Map(deptRows.map((d) => [d.id, d.name]));
  const deptOrder = new Map(deptRows.map((d) => [d.id, d.sort_order]));
  const list = (areas ?? []) as unknown as PlaceArea[];
  const ck = (checks ?? []) as unknown as Check[];
  const holidays = new Set((hol ?? []).map((h) => h.day as string));
  const teamOf = (a: PlaceArea) => (a.departments ? (a.departments.parent_id ?? a.departments.id) : "");

  const bizDays = (since: string) => {
    const out: string[] = [];
    for (let d = new Date(`${month}T00:00:00Z`); d.toISOString().slice(0, 10) < today; d = new Date(d.getTime() + 86400000)) {
      const s = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (s >= since && dow !== 0 && dow !== 6 && !holidays.has(s)) out.push(s);
    }
    return out;
  };
  const rows: PlaceRow[] = list.map((a) => {
    const mine = ck.filter((c) => c.area_id === a.id);
    const days = new Set(mine.map((c) => c.check_date));
    const since = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(a.created_at));
    const teamId = teamOf(a);
    return {
      a,
      teamId,
      team: a.departments ? (deptName.get(teamId) ?? a.departments.name) : "-",
      who: a.daily_area_members.map((m) => m.profiles?.name).filter(Boolean).join(", "),
      where: a.area_text || a.daily_area_points.map((x) => x.daily_points?.name).filter(Boolean).join(", ") || a.name,
      t: mine.find((c) => c.check_date === today),
      done: days.size,
      missed: bizDays(since).filter((d) => !days.has(d)),
    };
  });
  const teams = [...new Map(rows.filter((r) => r.teamId).map((r) => [r.teamId, r.team])).entries()].sort(
    (p, q) => (deptOrder.get(p[0]) ?? 0) - (deptOrder.get(q[0]) ?? 0) || p[1].localeCompare(q[1], "ko"),
  );
  return { rows, teams };
}

// 구역별 그 달 일지 상태 : draft(미제출·일지 없음) · submitted · approved · rejected (예전 전자결재 상신분 포함)
export async function loadLogStatus(supabase: SupabaseClient, ym: string) {
  const { data: logs } = await supabase.from("daily_logs").select("id, area_id, status, submitted_at").eq("ym", ym);
  const list = (logs ?? []) as { id: string; area_id: string; status: string; submitted_at: string | null }[];
  const { data: aps } = list.length
    ? await supabase.from("approvals").select("doc_id, status").eq("module_code", "insp_daily").in("doc_id", list.map((l) => l.id)).neq("status", "withdrawn")
    : { data: [] };
  const legacy = new Map(((aps ?? []) as { doc_id: string; status: string }[]).map((a) => [a.doc_id, a.status]));
  const out = new Map<string, { status: string; logId: string; submitted_at: string | null }>();
  for (const l of list) {
    const lg = legacy.get(l.id);
    out.set(l.area_id, { status: lg === "approved" ? "approved" : lg === "in_review" ? "submitted" : l.status, logId: l.id, submitted_at: l.submitted_at });
  }
  return out;
}
