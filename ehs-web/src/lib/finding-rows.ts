import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEASURE_KINDS } from "./labels";
import { thumbPathOf } from "./photo-path";
import { todayKst } from "./format";
import { getProfile } from "./auth";
import type { FindingOverview, Measure, MeasureKind } from "./types";

// 현황 표·엑셀 공용 행 데이터
export type RowMeasure = {
  kind: MeasureKind;
  content: string;
  target: string;
  original: string;
  changes: string[]; // 변경된 목표일 순서 (최초 이후)
  done: boolean;
  doneAt: string | null;
  late: boolean; // 미완료 + 목표일 경과 (한국 시간 기준)
};

export type RowProgress = { reason: string; progress: string; at: string; by: string | null };

export type FindingRow = FindingOverview & {
  measures: Partial<Record<MeasureKind, RowMeasure>>;
  progress: RowProgress[]; // 최신순
  directives: string[];
  thumb: string | null; // 개선 전 첫 사진 썸네일
  beforeUrls: string[]; // 엑셀용 (최대 2장)
  afterUrls: string[];
  canAssign: boolean; // 보는 사람이 조치담당자를 지정/변경할 수 있는지 (관리자 · 해당 부서 지정자/승인자)
  canPlan: boolean; // 보는 사람이 지금 조치계획을 작성할 차례인지 (계획 수립 대기 + 조치담당자 또는 관리자)
  assignees: { name: string; self: boolean }[]; // self = 자진 담당
  canSelfAssign: boolean; // 보는 사람이 "내가 담당하기" 를 할 수 있는지 (조치 요청 부서 소속, 아직 담당자가 아님, 조치 진행 단계)
  canApprove: boolean; // 보는 사람이 종결 승인/반려할 차례인지 (승인 대기 + 부서 승인자 또는 관리자)
  canReport: boolean; // 보는 사람이 지금 완료/미완료를 보고할 차례인지 (조치 중 + 조치담당자 또는 관리자)
  measureList: Measure[]; // 결과 보고 창에 넘길 조치 원본 (즉시 → 단기 → 장기)
};

// finding_overview 조회 시 조치계획·사진·진행현황·지시사항을 함께 가져오는 select (DB 왕복 1번)
export const FINDING_ROW_SELECT =
  "*, departments(department_roles(user_id, role)), finding_assignees(user_id, assigned_by, profiles!finding_assignees_user_id_fkey(name)), finding_measures(*, measure_date_history(new_date, changed_at)), finding_photos(kind, path, created_at), finding_progress(reason, progress, created_at, profiles(name)), finding_comments(body, is_directive, created_at)";

type Embedded = FindingOverview & {
  departments?: { department_roles: { user_id: string; role: "assigner" | "approver" }[] } | null;
  finding_assignees?: { user_id: string; assigned_by: string | null; profiles: { name: string } | null }[];
  finding_measures?: (Measure & { measure_date_history?: { new_date: string; changed_at: string }[] })[];
  finding_photos?: { kind: "before" | "after"; path: string; created_at: string }[];
  finding_progress?: { reason: string; progress: string; created_at: string; profiles: { name: string } | null }[];
  finding_comments?: { body: string; is_directive: boolean; created_at: string }[];
};

const PHOTOS_PER_KIND = 2;
const byTime = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

// FINDING_ROW_SELECT 로 받은 행 → 현황 표 데이터 (추가 왕복은 사진 서명 URL 1번뿐)
export async function enrichFindings(supabase: SupabaseClient, findings: FindingOverview[]): Promise<FindingRow[]> {
  if (findings.length === 0) return [];
  const rows = findings as Embedded[];
  const today = todayKst();
  const me = await getProfile();

  const picked = new Map<string, { thumb?: string; before: string[]; after: string[] }>();
  const wanted = new Set<string>();
  for (const f of rows) {
    const e = { before: [] as string[], after: [] as string[], thumb: undefined as string | undefined };
    for (const p of [...(f.finding_photos ?? [])].sort(byTime)) {
      const list = p.kind === "before" ? e.before : e.after;
      if (list.length < PHOTOS_PER_KIND) list.push(p.path);
      if (p.kind === "before" && !e.thumb) e.thumb = p.path;
    }
    if (e.thumb) wanted.add(thumbPathOf(e.thumb)).add(e.thumb);
    e.before.forEach((x) => wanted.add(x));
    e.after.forEach((x) => wanted.add(x));
    picked.set(f.id, e);
  }
  const signed = new Map<string, string>();
  if (wanted.size) {
    const { data } = await supabase.storage.from("findings").createSignedUrls([...wanted], 3600);
    for (const s of data ?? []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }

  return rows.map((f) => {
    const { finding_measures, finding_photos: _p, finding_progress, finding_comments, departments: dept, finding_assignees: assignees, ...base } = f;
    void _p;
    const isAssignee = !!me && (me.is_admin || (assignees ?? []).some((a) => a.user_id === me.id));
    const canPlan = isAssignee && f.status === "plan_wait";
    const mine = (assignees ?? []).some((a) => a.user_id === me?.id);
    const canSelfAssign = !!me && !mine && (me.team_id ?? me.department_id) === f.request_department_id && ["assign_wait", "plan_wait", "in_progress"].includes(f.status);
    const canApprove = !!me && f.status === "approval_wait" && (me.is_admin || (dept?.department_roles ?? []).some((r) => r.role === "approver" && r.user_id === me.id));
    const canReport = isAssignee && f.status === "in_progress" && (finding_measures ?? []).length > 0;
    const canAssign = !!me && f.status !== "closed" && (me.is_admin || (dept?.department_roles ?? []).some((r) => r.user_id === me.id));
    const ms: FindingRow["measures"] = {};
    for (const m of finding_measures ?? []) {
      ms[m.kind] = {
        kind: m.kind,
        content: m.content,
        target: m.target_date,
        original: m.original_target_date,
        changes: [...(m.measure_date_history ?? [])].sort((x, y) => x.changed_at.localeCompare(y.changed_at)).map((h) => h.new_date),
        done: m.is_done,
        doneAt: m.done_at,
        late: !m.is_done && m.target_date < today && f.status !== "closed",
      };
    }
    const ph = picked.get(f.id);
    return {
      ...base,
      measures: Object.fromEntries(MEASURE_KINDS.filter((k) => ms[k]).map((k) => [k, ms[k]])),
      progress: [...(finding_progress ?? [])]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => ({ reason: p.reason, progress: p.progress, at: p.created_at, by: p.profiles?.name ?? null })),
      directives: [...(finding_comments ?? [])].filter((c) => c.is_directive).sort(byTime).map((c) => c.body),
      thumb: ph?.thumb ? (signed.get(thumbPathOf(ph.thumb)) ?? signed.get(ph.thumb) ?? null) : null,
      beforeUrls: (ph?.before ?? []).map((x) => signed.get(x)).filter((x): x is string => !!x),
      afterUrls: (ph?.after ?? []).map((x) => signed.get(x)).filter((x): x is string => !!x),
      canAssign,
      canPlan,
      canReport,
      canSelfAssign,
      canApprove,
      assignees: (assignees ?? [])
        .map((a) => ({ name: a.profiles?.name ?? "", self: a.assigned_by === a.user_id }))
        .filter((a) => a.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      measureList: [...(finding_measures ?? [])]
        .sort((a, b) => MEASURE_KINDS.indexOf(a.kind) - MEASURE_KINDS.indexOf(b.kind))
        .map(({ measure_date_history: _h, ...m }) => (void _h, m)),
    } as FindingRow;
  });
}
