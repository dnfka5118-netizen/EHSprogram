// AI 위험성평가 작성 (서버) : 입력(작업 설명 · 조건 · 장비 · 물질 또는 절차서) → 참고 자료 검색 → 초안
//   /risk/ai (미리보기) 와 /risk/adhoc/new?ai=1 (새 JSA 채우기) 가 같은 계산을 씀
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNameDraft, buildSopDraft, sopQuery, type Draft, type RiskRef } from "./risk-ref";
import { conditionByKey, detectConditions } from "./risk-rules";
import type { SopStep } from "./sop";

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "");
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []).filter(Boolean);

export type AiInput = { mode: "name" | "sop"; q: string; eq: string; mat: string; c: string[]; sop: string; add: string[] };
export function aiInput(sp: Sp): AiInput {
  return {
    mode: one(sp.mode) === "sop" ? "sop" : "name",
    q: one(sp.q).trim().slice(0, 300),
    eq: one(sp.eq).trim().slice(0, 200),
    mat: one(sp.mat).trim().slice(0, 200),
    c: many(sp.c).filter((k) => conditionByKey(k)),
    sop: one(sp.sop),
    add: many(sp.add),
  };
}
// 같은 입력을 다른 화면으로 넘길 주소 뒷부분
export function aiParams(i: AiInput, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (i.mode === "sop") p.set("mode", "sop");
  if (i.sop) p.set("sop", i.sop);
  if (i.q) p.set("q", i.q);
  if (i.eq) p.set("eq", i.eq);
  if (i.mat) p.set("mat", i.mat);
  for (const k of i.c) p.append("c", k);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export type SopRow = { id: string; sop_no: string | null; rev: number; title: string; process_name: string | null; ppe: string | null; steps: SopStep[] };
export type AiResult = { draft: Draft; refs: Record<"jsa" | "ext" | "sif" | "kosha", RiskRef[]>; conds: { picked: string[]; auto: string[] }; sop: SopRow | null; error?: string };

export async function loadAiDraft(supabase: SupabaseClient, i: AiInput): Promise<AiResult | null> {
  let sop: SopRow | null = null;
  if (i.mode === "sop") {
    if (!i.sop) return null;
    const { data } = await supabase.from("sop_docs").select("id, sop_no, rev, title, process_name, ppe, steps").eq("id", i.sop).maybeSingle();
    if (!data) return null;
    sop = { ...data, steps: (data.steps ?? []) as SopStep[] } as SopRow;
  } else if (!i.q) return null;

  const sopText = sop ? [sop.title, sop.process_name, ...sop.steps.flatMap((s) => [s.name, s.work, s.hazard])].join(" ") : "";
  const context = sop ? sopText : `${i.q} ${i.eq} ${i.mat}`;
  const conds = detectConditions(context, i.c);
  const condWords = conds.all.map((k) => conditionByKey(k)?.label ?? "").join(" ");
  // 뼈대(우리 JSA·타사)는 작업 설명 + 장비로, 사고 사례·지침은 물질·조건까지 넣어 찾음
  const skelQ = sop ? sopQuery(sop.title, sop.process_name, sop.steps) : `${i.q} ${i.eq}`;
  const fullQ = sop ? `${skelQ} ${condWords}` : `${i.q} ${i.eq} ${i.mat} ${condWords}`;
  const search = (q: string, source: string, limit: number) => supabase.rpc("search_risk_refs", { p_q: q, p_source: source, p_limit: limit });
  const res = await Promise.all([search(skelQ, "jsa", 15), search(skelQ, "ext", 10), search(fullQ, "sif", 8), search(fullQ, "kosha", 40)]);
  const error = res.find((r) => r.error)?.error?.message;
  const [jsa, ext, sif, kosha] = res.map((r) => (r.data ?? []) as RiskRef[]);
  const refs = { jsa, ext, sif };
  const draft = sop ? buildSopDraft(sop.steps, refs, conds.all, context) : buildNameDraft(i.q, refs, conds.all, context);
  return { draft, refs: { jsa, ext, sif, kosha }, conds: { picked: conds.picked, auto: conds.auto }, sop, error };
}
