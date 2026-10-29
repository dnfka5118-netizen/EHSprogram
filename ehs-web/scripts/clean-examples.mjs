// "비슷한 과거 지적" 사례(finding_examples) 문구 다듬기 — 사례를 다시 만들지 않고 DB 의 글만 고친다
//
//   미리보기 : node scripts/clean-examples.mjs           → 바뀌는 건수·예시만 (.cache/clean-examples-preview.json)
//   DB 반영  : node scripts/clean-examples.mjs --apply
//
// - 글 다듬기는 src/lib/example-text.ts 의 cleanProblem 과 같음 (앞 번호 지우기, "1. … 2. …" 나누기, 메모·줄바꿈 정리)
// - 나눈 조각은 같은 사진 특징값·장소·유형으로 새 사례를 추가
// - 유형이 빈 사례는 문제점 글로 유형을 추천해(type-suggest.ts 와 같은 방식) 투표 50% 이상일 때만 채운다
//   (채운 유형은 type_checked = false 그대로 → 환경설정 → 유형 → 유형 정리에서 다시 볼 수 있음)
// - 관리자가 확인한 유형(type_checked)은 건드리지 않는다. 글은 다시 실행해도 바뀌지 않지만,
//   유형은 앞서 채운 사례가 학습 자료에 더해져 조금 더 채워질 수 있다 (사례를 새로 만든 뒤 한 번만 실행 권장).
//   실행 : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/clean-examples.mjs [--apply]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cleanProblem } from "../src/lib/example-text.ts";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function all(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).order("id").range(from, from + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const examples = await all("finding_examples", "id, source, location, sub_location, type_name, problem, emb, type_checked");
const types = await all("finding_types", "id, name, is_active");
const findings = await all("findings", "id, finding_type_id, problem");

const emptyBefore = examples.filter((e) => !e.type_name).length;

// ------------------------------------------------------------------ 1) 글 다듬기 · 나누기
const updates = []; // { id, problem }
const inserts = []; // 새 사례
const rows = []; // 다듬은 뒤 모든 사례 (유형 채우기용) { ref, problem, type_name }
for (const e of examples) {
  const items = cleanProblem(e.problem);
  if (!items.length) {
    rows.push({ ref: e, problem: e.problem, type_name: e.type_name });
    continue;
  }
  if (items[0] !== e.problem) updates.push({ id: e.id, before: e.problem, problem: items[0] });
  rows.push({ ref: e, problem: items[0], type_name: e.type_name });
  for (const p of items.slice(1)) {
    const n = { source: e.source, location: e.location, sub_location: e.sub_location, type_name: e.type_name, problem: p, emb: e.emb, type_checked: e.type_checked };
    inserts.push(n);
    rows.push({ ref: n, problem: p, type_name: e.type_name });
  }
}

// ------------------------------------------------------------------ 2) 빈 유형 채우기 (글자 조각 TF-IDF · 가까운 15건 투표)
const norm = (s) => s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim();
const key = (s) => s.replace(/\s/g, "");
function grams(s) {
  const out = new Set();
  for (const w of norm(s).split(" ")) {
    if (!w) continue;
    const x = ` ${w} `;
    for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= x.length; i++) if (x.slice(i, i + n).trim()) out.add(x.slice(i, i + n));
  }
  return out;
}
const active = types.filter((t) => t.is_active);
const nameById = new Map(active.map((t) => [t.id, t.name]));
const nameByKey = new Map(active.map((t) => [key(t.name), t.name]));
const train = new Map();
for (const f of findings) if (f.finding_type_id && nameById.has(f.finding_type_id) && f.problem) train.set(norm(f.problem), nameById.get(f.finding_type_id));
for (const r of rows) if (r.type_name && nameByKey.has(key(r.type_name))) train.set(norm(r.problem), nameByKey.get(key(r.type_name)));
const texts = [...train.keys()];
const labels = [...train.values()];
const gsets = texts.map(grams);
const df = new Map();
for (const s of gsets) for (const g of s) df.set(g, (df.get(g) ?? 0) + 1);
const idf = (g) => Math.log((texts.length + 1) / ((df.get(g) ?? 0) + 1));
function vec(gs) {
  const v = new Map();
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
const vecs = gsets.map(vec);
function suggest(text) {
  const q = vec(grams(text));
  const top = [];
  vecs.forEach((v, i) => {
    let s = 0;
    for (const [g, w] of q) s += w * (v.get(g) ?? 0);
    if (s > 0) top.push([s, labels[i]]);
  });
  top.sort((a, b) => b[0] - a[0]);
  const vote = new Map();
  let total = 0;
  for (const [s, name] of top.slice(0, 15)) {
    vote.set(name, (vote.get(name) ?? 0) + s * s);
    total += s * s;
  }
  const best = [...vote].sort((a, b) => b[1] - a[1])[0];
  return best && total ? { name: best[0], share: best[1] / total } : null;
}
const typed = [];
for (const r of rows) {
  if (r.type_name) continue;
  const s = suggest(r.problem);
  if (!s || s.share < 0.5) continue;
  typed.push({ problem: r.problem, type_name: s.name, share: Math.round(s.share * 100) });
  r.ref.type_name = s.name;
  if (r.ref.id) {
    const u = updates.find((x) => x.id === r.ref.id);
    if (u) u.type_name = s.name;
    else updates.push({ id: r.ref.id, problem: r.problem, type_name: s.name });
  }
}

// ------------------------------------------------------------------ 결과
console.log(`사례 ${examples.length}건`);
console.log(`  글 다듬음 ${updates.filter((u) => u.before).length}건 · 나눠서 새로 추가 ${inserts.length}건`);
console.log(`  유형 빈 사례 ${emptyBefore}건 (+ 나눈 조각) → 이번에 채움 ${typed.length}건 (투표 50% 이상만)`);
mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../.cache/clean-examples-preview.json", import.meta.url),
  JSON.stringify({ text: updates.filter((u) => u.before).map(({ before, problem }) => ({ before, after: problem })), split: inserts.map((x) => x.problem), typed }, null, 1),
);
console.log("미리보기 저장 : ehs-web/.cache/clean-examples-preview.json");
if (!APPLY) {
  console.log("확인만 했습니다. DB 반영은 --apply 를 붙여 실행하세요.");
  process.exit(0);
}

for (let i = 0; i < updates.length; i += 20) {
  const res = await Promise.all(
    updates.slice(i, i + 20).map(({ id, problem, type_name }) => db.from("finding_examples").update(type_name ? { problem, type_name } : { problem }).eq("id", id)),
  );
  const err = res.find((r) => r.error);
  if (err) throw new Error("사례 고치기 : " + err.error.message);
}
for (let i = 0; i < inserts.length; i += 500) {
  const { error } = await db.from("finding_examples").insert(inserts.slice(i, i + 500));
  if (error) throw new Error("사례 추가 : " + error.message);
}
console.log(`DB 반영 완료 : 고침 ${updates.length}건 · 추가 ${inserts.length}건`);
