import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEASURE_KINDS } from "./labels";
import { thumbPathOf } from "./photo-path";
import { todayKst } from "./format";
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
};

const PHOTOS_PER_KIND = 2;
const CHUNK = 150; // .in() 조건이 URL 에 들어가므로 나눠서 조회

type Rows = Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
async function inChunks(ids: string[], run: (part: string[]) => PromiseLike<{ data: unknown }>): Promise<Rows> {
  const out: Rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await run(ids.slice(i, i + CHUNK));
    out.push(...((data as Rows | null) ?? []));
  }
  return out;
}

// finding_overview 목록에 조치계획·진행현황·지시사항·사진 주소를 붙인다
export async function enrichFindings(supabase: SupabaseClient, findings: FindingOverview[]): Promise<FindingRow[]> {
  if (findings.length === 0) return [];
  const today = todayKst();
  const ids = findings.map((f) => f.id);

  const [measures, progress, comments, photos] = await Promise.all([
    inChunks(ids, (p) => supabase.from("finding_measures").select("*").in("finding_id", p)),
    inChunks(ids, (p) => supabase.from("finding_progress").select("finding_id, reason, progress, created_at, profiles(name)").in("finding_id", p).order("created_at", { ascending: false })),
    inChunks(ids, (p) => supabase.from("finding_comments").select("finding_id, body").eq("is_directive", true).in("finding_id", p).order("created_at")),
    inChunks(ids, (p) => supabase.from("finding_photos").select("finding_id, kind, path").in("finding_id", p).order("created_at")),
  ]);

  const history = await inChunks(
    measures.map((m) => m.id as string),
    (p) => supabase.from("measure_date_history").select("measure_id, new_date").in("measure_id", p).order("changed_at"),
  );

  // 필요한 사진만 서명 URL 발급 (썸네일 1장 + 개선 전/후 각 2장)
  const picked = new Map<string, { thumb?: string; before: string[]; after: string[] }>();
  for (const p of photos ?? []) {
    const e = picked.get(p.finding_id) ?? { before: [], after: [] };
    const list = p.kind === "before" ? e.before : e.after;
    if (list.length < PHOTOS_PER_KIND) list.push(p.path);
    if (p.kind === "before" && !e.thumb) e.thumb = p.path;
    picked.set(p.finding_id, e);
  }
  const wanted = new Set<string>();
  for (const e of picked.values()) {
    if (e.thumb) {
      wanted.add(thumbPathOf(e.thumb));
      wanted.add(e.thumb);
    }
    e.before.forEach((x) => wanted.add(x));
    e.after.forEach((x) => wanted.add(x));
  }
  const signed = new Map<string, string>();
  if (wanted.size) {
    const { data } = await supabase.storage.from("findings").createSignedUrls([...wanted], 3600);
    for (const s of data ?? []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }

  return findings.map((f) => {
    const ms: FindingRow["measures"] = {};
    for (const m of measures.filter((x) => x.finding_id === f.id)) {
      ms[m.kind as MeasureKind] = {
        kind: m.kind,
        content: m.content,
        target: m.target_date,
        original: m.original_target_date,
        changes: history.filter((h) => h.measure_id === m.id).map((h) => h.new_date as string),
        done: m.is_done,
        doneAt: m.done_at,
        late: !m.is_done && m.target_date < today && f.status !== "closed",
      };
    }
    const ph = picked.get(f.id);
    return {
      ...f,
      measures: Object.fromEntries(MEASURE_KINDS.filter((k) => ms[k]).map((k) => [k, ms[k]])),
      progress: progress
        .filter((p) => p.finding_id === f.id)
        .map((p) => ({ reason: p.reason, progress: p.progress, at: p.created_at, by: (p.profiles as unknown as { name: string } | null)?.name ?? null })),
      directives: comments.filter((c) => c.finding_id === f.id).map((c) => c.body as string),
      thumb: ph?.thumb ? signed.get(thumbPathOf(ph.thumb)) ?? signed.get(ph.thumb) ?? null : null,
      beforeUrls: (ph?.before ?? []).map((x) => signed.get(x)).filter((x): x is string => !!x),
      afterUrls: (ph?.after ?? []).map((x) => signed.get(x)).filter((x): x is string => !!x),
    };
  });
}
