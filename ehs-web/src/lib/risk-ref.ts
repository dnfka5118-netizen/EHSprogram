// 위험성평가 참고 자료 (risk_refs, 0047) : 우리 JSA · 타사 참고 · 공단 SIF → 비슷한 사례 찾기, 새 JSA 초안
import { emptyControl, emptyHazard, emptyStep, HAZARD_TYPES, normalizeHazardType, type JsaForm, type JsaStep } from "./jsa";
import type { SopStep } from "./sop";

export type RefSource = "jsa" | "ext" | "sif";
export type RefHazard = { type: string; content: string; freq: string; sev: string };
export type RefStep = { content: string; current: string; control: string; post: { freq: string; sev: string } | null; hazards: RefHazard[] };
export type RiskRef = {
  id: number;
  source: RefSource;
  title: string;
  area: string | null;
  group_name: string | null;
  year: number | null;
  // jsa/ext : {area, ppe, equip, safety_equip, docs, file, sheet, repeat} · sif : {no, industry, overview, origin, situation, factor, measure, kind}
  meta: Record<string, string | number | undefined>;
  steps: RefStep[];
  score: number;
};

export const REF_SOURCES: { key: RefSource; label: string; note: string }[] = [
  { key: "jsa", label: "우리 사업장 JSA", note: "과거 작업위험성평가서 (같은 작업은 최근 것)" },
  { key: "ext", label: "타사 참고", note: "다른 사업장 작업표준·JSA (빈도·강도 기준이 달라 점수는 가져오지 않음)" },
  { key: "sif", label: "공단 SIF 사망사고 사례", note: "한국산업안전보건공단 사망사고 고위험요인 아카이브" },
];

// 우리 JSA 만 같은 5×5 빈도·강도 기준 → 점수도 가져옴 (타사는 기준이 달라 비움)
const score = (src: RefSource, v: string) => (src === "jsa" && /^[1-5]$/.test(v) ? v : "");
const validType = (t: string) => {
  const n = normalizeHazardType(t);
  return HAZARD_TYPES.includes(n) ? n : "";
};

function refStepToJsa(src: RefSource, s: RefStep): JsaStep {
  const hazards = s.hazards.map((h) => ({ type: validType(h.type), content: h.content, freq: score(src, h.freq), sev: score(src, h.sev) }));
  return {
    cat: "",
    content: s.content,
    safe: s.current,
    hazards: hazards.length ? hazards : [emptyHazard()],
    control: s.control ? { ...emptyControl(), needed: true, desc: s.control, postFreq: score(src, s.post?.freq ?? ""), postSev: score(src, s.post?.sev ?? "") } : emptyControl(),
  };
}

// 참고 자료 → 새 JSA (작업명·장소·보호구·장비 + 단계·위험·현재 조치)
export function jsaFromRef(base: JsaForm, ref: RiskRef): JsaForm {
  const m = (k: string) => String(ref.meta[k] ?? "");
  return {
    ...base,
    work_name: ref.title,
    work_area: ref.source === "jsa" ? (ref.area ?? "") : base.work_area,
    ppe: m("ppe"),
    equip: m("equip"),
    safety_equip: m("safety_equip"),
    req_docs: m("docs"),
    steps: ref.steps.length ? ref.steps.map((s) => refStepToJsa(ref.source, s)) : [emptyStep()],
  };
}

// ---------------------------------------------------------------- 절차서 → JSA 초안
const grams = (s: string) => {
  const out = new Set<string>();
  for (const w of s
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .split(/\s+/)) {
    if (!w) continue;
    if (w.length <= 2) out.add(w);
    else for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
  }
  return out;
};
// 겹치는 글자 묶음 비율 (절차서 단계 글 기준)
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n / a.size;
};

const TYPE_WORDS: [string, RegExp][] = [
  ["감전", /감전|충전부|누전|활선/],
  ["화재/폭발", /화재|폭발|인화|발화|점화|화염/],
  ["누출", /누출|비산|분출|유출|튐|화학물질/],
  ["질식", /질식|산소\s*결핍|유독가스|가스\s*중독|흡입/],
  ["떨어짐", /추락|떨어짐|떨어질|실족/],
  ["맞음", /낙하|맞음|맞을|날아|비래/],
  ["끼임", /끼임|끼일|협착|말림|감김/],
  ["베임/절단", /베임|절단|베일|찔림/],
  ["깔림/뒤집힘", /깔림|전도|뒤집/],
  ["넘어짐", /넘어짐|넘어질|미끄러|걸려/],
  ["부딪힘", /부딪|충돌/],
  ["근골격계", /근골격|요통|중량물\s*취급|무리한\s*자세/],
  ["온열", /화상|고온|열사병|온열/],
  ["한랭", /동상|한랭|저온/],
  ["소음", /소음|난청/],
  ["정전기", /정전기/],
  ["아크", /아크/],
];
export const guessHazardType = (text: string) => TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? "";

export type DraftStep = JsaStep & { from: { title: string; source: RefSource; step: string; match: number } | null };

// 절차서 단계마다 : 절차서의 유해위험요인 + 가장 비슷한 과거 단계(우리 JSA 우선)의 위험·현재 조치
export function draftFromSop(sopSteps: SopStep[], refs: RiskRef[]): DraftStep[] {
  const pool = refs.filter((r) => r.source !== "sif").flatMap((r) => r.steps.map((s) => ({ r, s, g: grams(`${s.content} ${s.hazards.map((h) => h.content).join(" ")}`) })));
  return sopSteps
    .filter((s) => s.name.trim() || s.work.trim())
    .map((s) => {
      const g = grams(`${s.name} ${s.work}`);
      let best: (typeof pool)[number] | null = null;
      let bestScore = 0;
      for (const p of pool) {
        const v = overlap(g, p.g) + (p.r.source === "jsa" ? 0.05 : 0);
        if (v > bestScore) [best, bestScore] = [p, v];
      }
      const own = s.hazard
        .split(/\n|·|,(?=\s*\S)/)
        .map((x) => x.replace(/^\s*[-–·•ㆍ]+\.?\s*|^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean)
        .map((content) => ({ type: guessHazardType(content), content, freq: "", sev: "" }));
      const useBest = best && bestScore >= 0.3 ? best : null;
      const past = useBest ? refStepToJsa(useBest.r.source, useBest.s) : null;
      const hazards = [...own, ...(past?.hazards.filter((h) => h.content && !own.some((o) => o.content === h.content)) ?? [])];
      return {
        cat: "",
        content: [s.name, s.work].filter((x) => x.trim()).join("\n"),
        safe: [s.safety, past?.safe].filter((x) => x?.trim()).join("\n"),
        hazards: hazards.length ? hazards : [emptyHazard()],
        control: past?.control ?? emptyControl(),
        from: useBest ? { title: useBest.r.title, source: useBest.r.source, step: useBest.s.content, match: Math.round(bestScore * 100) } : null,
      };
    });
}

// 절차서 → 검색어 (표준명 + 공정명 + 단계 이름)
export const sopQuery = (title: string, process: string | null, steps: SopStep[]) => [title, process ?? "", ...steps.map((s) => s.name)].join(" ").slice(0, 400);
