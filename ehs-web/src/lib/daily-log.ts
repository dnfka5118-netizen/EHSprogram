import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { thumbPathOf } from "./photo-path";
import type { DailyArea, DailyForm, DailyFormItem, DailyResult } from "./daily";
import type { Approval } from "./approval";
import { fmtDateTime } from "./format";

export type LogFinding = {
  id: string;
  date: string;
  code: string;
  problem: string;
  status: string;
  action: "immediate" | "request" | null;
  plan: string;
  due: string | null;
  before: string | null; // 썸네일 주소
  after: string | null;
};

export type DailyLogData = {
  id: string;
  ym: string; // YYYY-MM-01
  days: number;
  area: DailyArea & { department: string | null; site: string | null; label: string };
  form: DailyForm;
  items: DailyFormItem[];
  cells: Record<string, Record<number, DailyResult>>; // item_id → 일 → 판정
  inspectors: string[];
  records: { date: string; code: string; result: DailyResult; note: string; remark: string }[]; // 2. 주요 점검 결과
  findings: LogFinding[]; // 3. 세부 개선 진행사항 (이번 달)
  dayKind: Record<number, "missed" | "backfill" | "substitute">; // 미점검 · 소급 · 대체 (1~31일)
  dayNotes: { date: string; kind: "missed" | "backfill" | "substitute"; who: string; note: string }[]; // 점검 실시 기록
  counts: { found: number; foundYear: number; closed: number; closedYear: number };
};

const STATUS: Record<string, string> = { assign_wait: "담당자 지정 대기", plan_wait: "계획 수립 대기", in_progress: "조치 중", approval_wait: "승인 대기", closed: "종결" };
export const findingStatusLabel = (s: string) => STATUS[s] ?? s;

// 월간 일지 (안전보건 관리감독자 일일업무일지) 한 장에 들어갈 내용
type AreaRow = DailyArea & { departments: { name: string } | null; sites: { name: string } | null };

export async function getDailyLog(supabase: SupabaseClient, id: string): Promise<DailyLogData | null> {
  const { data: log } = await supabase.from("daily_logs").select("*, daily_areas(*, departments(name), sites(name))").eq("id", id).maybeSingle();
  if (!log) return null;
  return buildDailyLog(supabase, log.daily_areas as AreaRow, log.ym as string, id);
}

// 일지를 아직 열지 않은 달도 같은 모양으로 (나의 점검 현황 · id 는 빈 값)
export async function getDailyLogFor(supabase: SupabaseClient, areaId: string, ym: string): Promise<DailyLogData | null> {
  const { data: a } = await supabase.from("daily_areas").select("*, departments(name), sites(name)").eq("id", areaId).maybeSingle();
  return a ? buildDailyLog(supabase, a as AreaRow, ym, "") : null;
}

async function buildDailyLog(supabase: SupabaseClient, a: AreaRow, ym: string, id: string): Promise<DailyLogData> {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const days = new Date(y, m, 0).getDate();
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const [{ data: form }, { data: items }, { data: checks }, { data: yearChecks }, { data: hol }, { data: label }] = await Promise.all([
    supabase.from("daily_forms").select("*").eq("code", a.form_code).single(),
    supabase.from("daily_form_items").select("*").eq("form_code", a.form_code).order("sort_order"),
    supabase
      .from("daily_checks")
      .select("check_date, submitted_at, is_backfill, backfill_reason, sub_reason, profiles!daily_checks_user_id_fkey(name), sub:profiles!daily_checks_substitute_for_fkey(name), daily_results(item_id, result, note, action, finding_id)")
      .eq("area_id", a.id)
      .gte("check_date", ym)
      .lt("check_date", next)
      .order("check_date"),
    supabase.from("daily_checks").select("check_date, daily_results(finding_id)").eq("area_id", a.id).gte("check_date", `${y}-01-01`).lt("check_date", next),
    supabase.from("holidays").select("day").gte("day", ym).lt("day", next),
    supabase.rpc("daily_area_label", { p_area: a.id }),
  ]);

  type Res = { item_id: string; result: DailyResult; note: string | null; action: "immediate" | "request" | null; finding_id: string | null };
  type Check = {
    check_date: string;
    submitted_at: string;
    is_backfill: boolean;
    backfill_reason: string | null;
    sub_reason: string | null;
    profiles: { name: string } | null;
    sub: { name: string } | null;
    daily_results: Res[];
  };
  const list = (checks ?? []) as unknown as Check[];
  const allItems = (items ?? []) as DailyFormItem[];
  const usedIds = new Set(list.flatMap((c) => c.daily_results.map((r) => r.item_id)));
  const shown = allItems.filter((i) => i.is_active || usedIds.has(i.id));
  const codeOf = new Map(allItems.map((i) => [i.id, i.code]));

  const cells: DailyLogData["cells"] = {};
  const records: DailyLogData["records"] = [];
  const monthFinding = new Map<string, { date: string; code: string; action: Res["action"] }>();
  for (const c of list) {
    const day = Number(c.check_date.slice(8, 10));
    for (const r of c.daily_results) {
      (cells[r.item_id] ??= {})[day] = r.result;
      if (r.result === "X" || r.result === "△")
        records.push({
          date: c.check_date,
          code: codeOf.get(r.item_id) ?? "",
          result: r.result,
          note: r.note ?? "",
          remark: r.result === "△" ? "이벤트" : r.action === "immediate" ? "즉시 조치" : "개선 요청",
        });
      if (r.finding_id) monthFinding.set(r.finding_id, { date: c.check_date, code: codeOf.get(r.item_id) ?? "", action: r.action });
    }
  }
  records.sort((p, q) => p.date.localeCompare(q.date) || p.code.localeCompare(q.code, undefined, { numeric: true }));

  // 이번 달 · 올해 지적사항 (발굴 · 완료 건수, 3번 표)
  const yearIds = [...new Set(((yearChecks ?? []) as { daily_results: { finding_id: string | null }[] }[]).flatMap((c) => c.daily_results.map((r) => r.finding_id).filter(Boolean) as string[]))];
  const { data: fs } = yearIds.length
    ? await supabase.from("findings").select("id, problem, status, closed_at, finding_measures(content, target_date, is_done), finding_photos(kind, path, created_at)").in("id", yearIds)
    : { data: [] };
  type F = { id: string; problem: string; status: string; closed_at: string | null; finding_measures: { content: string; target_date: string; is_done: boolean }[]; finding_photos: { kind: string; path: string; created_at: string }[] };
  const rows = (fs ?? []) as F[];
  const inMonth = (t: string | null) => !!t && t.slice(0, 10) >= ym && t.slice(0, 10) < next;
  const closedKst = (t: string | null) => (t ? new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : null);

  const first = (f: F, kind: string) => f.finding_photos.filter((p) => p.kind === kind).sort((p, q) => p.created_at.localeCompare(q.created_at))[0]?.path ?? null;
  const monthRows = rows.filter((f) => monthFinding.has(f.id));
  const paths = monthRows.flatMap((f) => [first(f, "before"), first(f, "after")]).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("findings").createSignedUrls(paths.map(thumbPathOf), 3600);
    paths.forEach((p, i) => data?.[i]?.signedUrl && signed.set(p, data[i].signedUrl));
  }
  const findings: LogFinding[] = monthRows
    .map((f) => {
      const meta = monthFinding.get(f.id)!;
      const b = first(f, "before"), af = first(f, "after");
      return {
        id: f.id,
        date: meta.date,
        code: meta.code,
        problem: f.problem,
        status: f.status,
        action: meta.action,
        plan: f.finding_measures.map((x) => `${x.is_done ? "✓" : "·"} ${x.content}`).join("\n"),
        due: f.finding_measures.map((x) => x.target_date).sort().at(-1) ?? null,
        before: b ? (signed.get(b) ?? null) : null,
        after: af ? (signed.get(af) ?? null) : null,
      };
    })
    .sort((p, q) => p.date.localeCompare(q.date));

  // 미점검 : 지난 영업일(구역 등록 이후) 중 기록 없는 날 · 소급 · 대체
  const holidays = new Set((hol ?? []).map((h) => h.day as string));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const since = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date((a as unknown as { created_at: string }).created_at));
  const byDay = new Map(list.map((c) => [c.check_date, c]));
  const dayKind: DailyLogData["dayKind"] = {};
  const dayNotes: DailyLogData["dayNotes"] = [];
  for (let n = 1; n <= days; n++) {
    const date = `${ym.slice(0, 8)}${String(n).padStart(2, "0")}`;
    const c = byDay.get(date);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!c) {
      if (date < today && date >= since && dow !== 0 && dow !== 6 && !holidays.has(date)) {
        dayKind[n] = "missed";
        dayNotes.push({ date, kind: "missed", who: "", note: "점검 기록 없음" });
      }
    } else if (c.is_backfill) {
      dayKind[n] = "backfill";
      dayNotes.push({ date, kind: "backfill", who: c.profiles?.name ?? "", note: `${c.backfill_reason ?? ""} (입력 ${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(c.submitted_at))})` });
    } else if (c.sub) {
      dayKind[n] = "substitute";
      dayNotes.push({ date, kind: "substitute", who: c.profiles?.name ?? "", note: `${c.sub.name} 대신 · ${c.sub_reason ?? ""}` });
    }
  }

  return {
    id,
    dayKind,
    dayNotes,
    ym,
    days,
    area: { ...a, department: a.departments?.name ?? null, site: a.sites?.name ?? null, label: (label as string | null) ?? a.name },
    form: form as DailyForm,
    items: shown,
    cells,
    inspectors: [...new Set(list.map((c) => (c.profiles?.name ? c.profiles.name + (c.sub ? "(대체)" : "") : "")).filter(Boolean))],
    records,
    findings,
    counts: {
      found: monthFinding.size,
      foundYear: yearIds.length,
      closed: rows.filter((f) => f.status === "closed" && inMonth(closedKst(f.closed_at))).length,
      closedYear: rows.filter((f) => f.status === "closed").length,
    },
  };
}

// 결재 칸 : 작성 · 검토 · 승인 (결재된 사람 이름 · 날짜)
export function logStamps(approval: Approval | null) {
  const steps = approval?.steps ?? [];
  const pick = (kinds: string[]) => steps.filter((s) => kinds.includes(s.step_kind) && s.status === "approved");
  const box = (label: string, kinds: string[]) => {
    const s = pick(kinds);
    return { label, name: s.map((x) => x.approver_name ?? "").join(", "), date: s.length ? fmtDateTime(s.at(-1)!.acted_at).slice(0, 10) : "" };
  };
  return [box("작성", ["담당"]), box("검토", ["검토", "협조"]), box("승인", ["승인", "확인"])];
}

