"use client";

// 문제점 글 → 유형 추천 (브라우저 안에서만 계산)
//   과거 사례(finding_examples) + 볼 수 있는 지적사항의 "문제점 → 유형" 을 글자 조각(1~3자) TF-IDF 로 비교해
//   가장 비슷한 15건의 유형 투표로 정한다. 과거 기록 5겹 교차검증: 1순위 59%, 3순위 안 86%,
//   투표 비율 50% 이상일 때 1순위 74% (→ 이때만 자동 선택, AUTO_SHARE)

import { createClient } from "@/lib/supabase/client";
import type { FindingType } from "@/lib/types";

export const AUTO_SHARE = 0.5;
const K = 15;

export type TypeSuggestion = { typeId: string; name: string; share: number };

type Model = { types: FindingType[]; labels: string[]; vecs: Map<string, number>[]; idf: (g: string) => number };

const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim();
const key = (s: string) => s.replace(/\s/g, "");

function grams(s: string) {
  const out = new Set<string>();
  for (const w of norm(s).split(" ")) {
    if (!w) continue;
    const x = ` ${w} `;
    for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= x.length; i++) {
      const g = x.slice(i, i + n);
      if (g.trim()) out.add(g);
    }
  }
  return out;
}

function vec(gs: Set<string>, idf: (g: string) => number) {
  const v = new Map<string, number>();
  let n = 0;
  for (const g of gs) {
    const w = idf(g);
    v.set(g, w);
    n += w * w;
  }
  n = Math.sqrt(n) || 1;
  for (const [g, w] of v) v.set(g, w / n);
  return v;
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const supabase = createClient();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

let modelP: Promise<Model> | null = null;

function getModel(types: FindingType[]) {
  modelP ??= (async () => {
    const byName = new Map(types.map((t) => [key(t.name), t.id]));
    const ids = new Set(types.map((t) => t.id));
    const [ex, fs] = await Promise.all([
      fetchAll<{ type_name: string | null; problem: string }>("finding_examples", "type_name, problem"),
      fetchAll<{ finding_type_id: string | null; problem: string }>("findings", "finding_type_id, problem").catch(() => []),
    ]);
    // 같은 문제점은 한 번만 (지적사항이 사례보다 최근 기록이므로 우선)
    const rows = new Map<string, string>();
    for (const e of ex) {
      const id = e.type_name ? byName.get(key(e.type_name)) : undefined;
      if (id && e.problem) rows.set(norm(e.problem), id);
    }
    for (const f of fs) if (f.finding_type_id && ids.has(f.finding_type_id) && f.problem) rows.set(norm(f.problem), f.finding_type_id);

    const texts = [...rows.keys()];
    const labels = [...rows.values()];
    const gsets = texts.map(grams);
    const df = new Map<string, number>();
    for (const s of gsets) for (const g of s) df.set(g, (df.get(g) ?? 0) + 1);
    const idf = (g: string) => Math.log((texts.length + 1) / ((df.get(g) ?? 0) + 1));
    return { types, labels, vecs: gsets.map((s) => vec(s, idf)), idf };
  })().catch((e) => {
    modelP = null;
    throw e;
  });
  return modelP;
}

// 문제점 글에 맞는 유형 (투표 비율 높은 순, 최대 3개)
export async function suggestTypes(text: string, types: FindingType[]): Promise<TypeSuggestion[]> {
  if (norm(text).replace(/\s/g, "").length < 2) return [];
  const m = await getModel(types);
  const q = vec(grams(text), m.idf);
  const top: [number, string][] = [];
  m.vecs.forEach((v, i) => {
    let s = 0;
    for (const [g, w] of q) {
      const x = v.get(g);
      if (x) s += w * x;
    }
    if (s > 0) top.push([s, m.labels[i]]);
  });
  top.sort((a, b) => b[0] - a[0]);
  const vote = new Map<string, number>();
  let total = 0;
  for (const [s, id] of top.slice(0, K)) {
    vote.set(id, (vote.get(id) ?? 0) + s * s);
    total += s * s;
  }
  if (!total) return [];
  return [...vote.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([typeId, v]) => ({ typeId, name: m.types.find((t) => t.id === typeId)?.name ?? "", share: v / total }));
}
