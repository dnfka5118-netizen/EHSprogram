import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEASURE_KINDS } from "./labels";
import { thumbPathOf } from "./photo-path";
import { todayKst } from "./format";
import { getProfile } from "./auth";
import type { FindingOverview, MeasureKind } from "./types";

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
};

// finding_overview 조회 시 조치계획·사진·진행현황·지시사항을 함께 가져오는 select (DB 왕복 1번)
export const FINDING_ROW_SELECT =
  "*, departments(assigner_id, approver_id), finding_assignees(user_id), finding_measures(*, measure_date_history(new_date, changed_at)), finding_photos(kind, path, created_at), finding_progress(reason, progress, created_at, profiles(name)), finding_comments(body, is_directive, created_at)";

type Embedded = FindingOverview & {
  departments?: { assigner_id: string | null; approver_id: string | null } | null;
  finding_assignees?: { user_id: string }[];
  finding_measures?: { kind: MeasureKind; content: string; target_date: string; original_target_date: string; is_done: boolean; done_at: string | null; measure_date_history?: { new_date: string; changed_at: string }[] }[];
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
    const canPlan = !!me && f.status === "plan_wait" && (me.is_admin || (assignees ?? []).some((a) => a.user_id === me.id));
    const canAssign = !!me && f.status !== "closed" && (me.is_admin || (!!dept && (dept.assigner_id === me.id || dept.approver_id === me.id)));
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
    } as FindingRow;
  });
}
