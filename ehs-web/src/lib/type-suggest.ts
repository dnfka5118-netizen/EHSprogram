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
    // 같은 문제점은 한 번만 (사례는 환경설정 → 유형 → 유형 정리에서 관리자가 다듬으므로 사례를 우선)
    const rows = new Map<string, string>();
    for (const f of fs) if (f.finding_type_id && ids.has(f.finding_type_id) && f.problem) rows.set(norm(f.problem), f.finding_type_id);
    for (const e of ex) {
      const id = e.type_name ? byName.get(key(e.type_name)) : undefined;
      if (id && e.problem) rows.set(norm(e.problem), id);
    }

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

// ---------------------------------------------------------------- 유형 정리 (애매한 사례 묶음)
export type ReviewExample = { id: number; type_name: string | null; problem: string; type_checked: boolean };
export type ReviewGroup = { items: ReviewExample[]; counts: [string, number][] };

// 글자 조각 → 정렬된 번호 배열 (빠른 비교용)
function packed(list: ReviewExample[]) {
  const gs = list.map((e) => grams(e.problem));
  const df = new Map<string, number>();
  for (const g of gs) for (const x of g) df.set(x, (df.get(x) ?? 0) + 1);
  const idx = new Map([...df.keys()].map((g, i) => [g, i]));
  const idf = (g: string) => Math.log((list.length + 1) / ((df.get(g) ?? 0) + 1));
  return gs.map((g) => {
    const v = vec(g, idf);
    const pairs = [...v].map(([x, w]) => [idx.get(x)!, w] as const).sort((a, b) => a[0] - b[0]);
    return { ids: Int32Array.from(pairs.map((p) => p[0])), ws: Float32Array.from(pairs.map((p) => p[1])) };
  });
}

// 비슷한 문제점(유사도 SIM 이상)끼리 묶고, 등록된 유형이 2가지 이상으로 갈린 묶음만 (큰 묶음 먼저)
export function ambiguousGroups(list: ReviewExample[], typeNames: string[], SIM = 0.55): ReviewGroup[] {
  const valid = new Map(typeNames.map((n) => [key(n), n]));
  const vs = packed(list);
  const nb: number[][] = list.map(() => []);
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      let s = 0;
      for (let x = 0, y = 0; x < a.ids.length && y < b.ids.length; ) {
        if (a.ids[x] === b.ids[y]) s += a.ws[x++] * b.ws[y++];
        else if (a.ids[x] < b.ids[y]) x++;
        else y++;
      }
      if (s >= SIM) {
        nb[i].push(j);
        nb[j].push(i);
      }
    }
  }
  const used = new Set<number>();
  const out: ReviewGroup[] = [];
  for (const i of list.map((_, i) => i).sort((a, b) => nb[b].length - nb[a].length)) {
    if (used.has(i)) continue;
    const m = [i, ...nb[i].filter((j) => !used.has(j))];
    m.forEach((x) => used.add(x));
    const items = m.map((x) => list[x]);
    if (items.every((e) => e.type_checked)) continue;
    const c = new Map<string, number>();
    for (const e of items) {
      const n = e.type_name ? valid.get(key(e.type_name)) : undefined;
      if (n) c.set(n, (c.get(n) ?? 0) + 1);
    }
    if (c.size < 2) continue;
    out.push({ items, counts: [...c].sort((a, b) => b[1] - a[1]) });
  }
  return out.sort((a, b) => b.items.length - a.items.length);
}
