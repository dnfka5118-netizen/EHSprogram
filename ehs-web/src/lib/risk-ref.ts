// 위험성평가 참고 자료 (risk_refs, 0047·0049) : 우리 JSA · 타사 참고 · 공단 SIF · KOSHA 지침 → 비슷한 사례 찾기, 새 JSA 초안
//   초안 = 우리 JSA 를 뼈대로 (절차서가 있으면 절차서 단계)
//        + 단계마다 비슷한 과거 단계(우리 JSA · 타사)의 위험 보완
//        + 작업 조건(고소 · 밀폐 · 화기 …)의 기본 안전조치를 감소대책에 [보완] 으로 (근거 KOSHA, src/lib/risk-rules.ts)
//        + 절차서가 있을 때만 빠진 단계(LOTO · 가스 측정 …) 제안
import { emptyControl, emptyHazard, emptyStep, HAZARD_TYPES, normalizeHazardType, type JsaForm, type JsaHazard, type JsaStep } from "./jsa";
import { conditionByKey, WORK_CONDITIONS, type ControlCheck, type RuleStep } from "./risk-rules";
import type { SopStep } from "./sop";

export type RefSource = "jsa" | "ext" | "sif" | "kosha";
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
  // kosha : {code, guide, section, text, laws[]}
  meta: Record<string, string | number | string[] | undefined>;
  steps: RefStep[];
  score: number;
};

export const REF_SOURCES: { key: RefSource; label: string; note: string }[] = [
  { key: "jsa", label: "우리 사업장 JSA", note: "과거 작업위험성평가서 (같은 작업은 최근 것)" },
  { key: "ext", label: "타사 참고", note: "다른 사업장 작업표준·JSA (빈도·강도 기준이 달라 점수는 가져오지 않음)" },
  { key: "sif", label: "공단 SIF 사망사고 사례", note: "한국산업안전보건공단 사망사고 고위험요인 아카이브" },
  { key: "kosha", label: "KOSHA 안전지침", note: "한국산업안전보건공단 KOSHA GUIDE (기술지침·기술지원규정) 해당 장·절" },
];
export const sourceLabel = (s: RefSource) => REF_SOURCES.find((r) => r.key === s)?.label ?? s;

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

// 참고 자료 하나 → 새 JSA (작업명·장소·보호구·장비 + 단계·위험·현재 조치)
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

// ---------------------------------------------------------------- 글자 비교
export const grams = (s: string) => {
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
// a 의 글자 묶음 중 b 에도 있는 비율
export const overlap = (a: Set<string>, b: Set<string>) => {
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
  ["깔림/뒤집힘", /깔림|전도|뒤집|전복/],
  ["넘어짐", /넘어짐|넘어질|미끄러|걸려/],
  ["부딪힘", /부딪|충돌|추돌/],
  ["근골격계", /근골격|요통|중량물\s*취급|무리한\s*자세/],
  ["온열", /화상|고온|열사병|온열/],
  ["한랭", /동상|한랭|저온/],
  ["소음", /소음|난청/],
  ["정전기", /정전기/],
  ["아크", /아크/],
];
export const guessHazardType = (text: string) => TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? "";

// ---------------------------------------------------------------- 초안
export type DraftHazard = JsaHazard & { added?: string }; // added = 보완해 온 자료 이름
export type DraftMeasure = { text: string; check: ControlCheck; ref: string; cond: string };
export type DraftStep = {
  content: string;
  safe: string;
  hazards: DraftHazard[];
  control: string; // 원래 감소대책
  checks: string[];
  postFreq: string;
  postSev: string;
  measures: DraftMeasure[]; // 작업 조건으로 덧붙인 조치
  from: { title: string; source: RefSource; step: string; match: number } | null; // 절차서 단계와 가장 비슷한 과거 단계
  basic?: string; // 기본 단계 (작업 준비·정리) 또는 조건 단계(조건 key) — 다른 자료 위험 보완 안 함
};
export type DraftSuggestion = { key: string; label: string; before: number; ref: string; step: DraftStep };
export type SifGap = { type: string; examples: string[] };
export type Draft = {
  base: { id: number; title: string; source: RefSource; score: number; group: string | null; year: number | null } | null;
  isNew: boolean; // 우리 JSA 에 비슷한 작업이 없음 → 신규 작업 (현장 확인 필요)
  steps: DraftStep[];
  suggestions: DraftSuggestion[]; // 절차서가 있을 때만
  sifGaps: SifGap[];
  meta: { ppe: string; equip: string; safety_equip: string; docs: string; area: string };
};

const toDraftStep = (src: RefSource, s: RefStep): DraftStep => {
  const j = refStepToJsa(src, s);
  return {
    content: j.content,
    safe: j.safe,
    hazards: j.hazards.filter((h) => h.content).map((h) => ({ ...h, type: h.type || guessHazardType(h.content) })),
    control: j.control.desc,
    checks: [],
    postFreq: j.control.postFreq,
    postSev: j.control.postSev,
    measures: [],
    from: null,
  };
};
const ruleToStep = (r: RuleStep, key: string): DraftStep => ({
  basic: key,
  content: r.name,
  safe: r.safe,
  hazards: r.hazards.map((h) => ({ ...h, freq: "", sev: "", added: r.ref || "기본 안전조치" })),
  control: "",
  checks: [],
  postFreq: "",
  postSev: "",
  measures: [],
  from: null,
});
const stepText = (s: DraftStep) => [s.content, s.safe, s.control, ...s.hazards.map((h) => h.content), ...s.measures.map((m) => m.text)].join(" ");

// 단계마다 비슷한 다른 자료의 단계에서 위험 보완 (단계당 3개까지)
//   - 단계 글이 서로 많이 겹쳐야 함 (어느 쪽에서 봐도 50% 이상, 짧은 단계는 제외)
//   - "화학물질 누출위험" 같은 짧고 일반적인 위험은 빼고, 한 번 더한 위험은 다른 단계에 또 넣지 않음
function supplementHazards(steps: DraftStep[], pool: RiskRef[]) {
  const cands = pool.flatMap((r) => r.steps.map((s) => ({ r, s, g: grams(s.content) }))).filter((c) => c.g.size >= 3);
  const used: Set<string>[] = steps.flatMap((s) => s.hazards.map((h) => grams(h.content)));
  for (const st of steps) {
    if (st.basic) continue;
    const g = grams(st.content);
    const scored = cands
      .map((c) => ({ ...c, v: Math.max(overlap(g, c.g), overlap(c.g, g)) }))
      .filter((c) => c.v >= 0.5)
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);
    let added = 0;
    for (const c of scored) {
      for (const h of c.s.hazards) {
        if (added >= 3 || !h.content || h.content.replace(/\s/g, "").length < 10) continue;
        const hg = grams(h.content);
        if (used.some((x) => overlap(hg, x) >= 0.6)) continue;
        used.push(hg);
        st.hazards.push({
          type: validType(h.type) || guessHazardType(h.content),
          content: h.content,
          freq: score(c.r.source, h.freq),
          sev: score(c.r.source, h.sev),
          added: `${sourceLabel(c.r.source)} · ${c.r.title}`,
        });
        added++;
      }
    }
  }
}

// 작업 조건의 기본 안전조치 → 해당 단계 감소대책에 [보완] (평가서에 이미 비슷한 글이 있으면 뺌)
function applyConditions(steps: DraftStep[], conds: string[], context: string) {
  if (!steps.length) return;
  for (const key of conds) {
    const c = conditionByKey(key);
    if (!c) continue;
    for (const m of c.measures) {
      if (m.when && !m.when.test(context)) continue;
      const all = steps.map(stepText).join(" ");
      if (m.covered.test(all)) continue;
      // 그 조건의 단계가 있으면 거기, 없으면 해당 작업 단계(분해·진입 …), 그것도 없으면 첫 단계
      const target = steps.find((s) => s.basic === key) ?? steps.find((s) => !s.basic && c.attach.test(s.content)) ?? steps[0];
      target.measures.push({ text: m.text, check: m.check, ref: m.ref, cond: c.label });
    }
  }
}

// 절차서에 없는 단계 제안 : 조건의 단계 규칙이 절차서 어디에도 없고, 그 단계가 들어갈 자리(분해·진입 …)가 있을 때
function missingSteps(steps: DraftStep[], conds: string[]): DraftSuggestion[] {
  const out: DraftSuggestion[] = [];
  const all = steps.map(stepText).join(" ");
  for (const key of conds) {
    const c = conditionByKey(key);
    if (!c?.step || c.step.covered.test(all)) continue;
    const before = steps.findIndex((s) => c.step!.before.test(s.content));
    if (before < 0) continue;
    out.push({ key, label: c.label, before, ref: c.step.ref, step: ruleToStep(c.step, key) });
  }
  return out;
}

// SIF 사망사고 사례의 재해 유형 중 초안에 없는 것
function sifGapsOf(steps: DraftStep[], sif: RiskRef[]): SifGap[] {
  const have = new Set(steps.flatMap((s) => s.hazards.map((h) => h.type || guessHazardType(h.content))).filter(Boolean));
  const gaps = new Map<string, string[]>();
  // 충분히 비슷한 사례만 (점수 0.5 이상)
  for (const r of sif.filter((x) => x.score >= 0.5).slice(0, 8)) {
    const kind = String(r.meta.kind ?? "");
    const type = validType(kind) || guessHazardType(`${kind} ${r.meta.overview ?? ""} ${r.meta.factor ?? ""}`);
    if (!type || have.has(type)) continue;
    const list = gaps.get(type) ?? [];
    if (list.length < 2) list.push(r.title);
    gaps.set(type, list);
  }
  return [...gaps].map(([type, examples]) => ({ type, examples }));
}

const NEW_SCORE = 0.45;
const plainStep = (content: string, basic?: string): DraftStep => ({
  content,
  safe: "",
  hazards: [],
  control: "",
  checks: [],
  postFreq: "",
  postSev: "",
  measures: [],
  from: null,
  basic,
});
function basicSteps(desc: string, conds: string[], proc: Procedure | null): DraftStep[] {
  // 작업 전 안전조치 순서 : 전원·에너지 차단 → 약품 배출 → 밀폐 환기·측정 → 고소 → 굴착 → 인양 → 화기
  const ORDER = ["power", "energy", "chem", "confined", "height", "excavation", "heavy", "hot"];
  const work = desc.split("\n")[0].slice(0, 200);
  // 지침 순서가 있으면 본 작업 자리에 그 순서 (본 작업 단계 이름에 작업 설명을 붙임) · 그 순서가 다루는 조건 단계는 뺌
  const main: DraftStep[] = proc ? proc.steps.map((s) => ({ ...plainStep(s.main ? `${s.name} — ${work}` : s.name), measures: [...s.measures] })) : [plainStep(work)];
  const rules = WORK_CONDITIONS.filter((c) => conds.includes(c.key) && c.step && !proc?.covers.includes(c.key))
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
    .map((c) => ruleToStep(c.step!, c.key));
  return [
    plainStep("작업 준비 (TBM · 안전작업허가 · 보호구 착용 · 작업구역 확보)", "prep"),
    ...rules,
    ...main,
    plainStep("작업 종료 및 정리정돈 (잔재물 제거 · 설비 원상복구 확인)", "end"),
  ];
}
export type DraftRefs = { jsa: RiskRef[]; ext: RiskRef[]; sif: RiskRef[] };

// 작업 설명으로 (절차서 없음) : 단계는 우리 JSA 그대로 (없으면 타사 → "신규 작업")
// 지침의 작업 순서 (신규 작업일 때 본 작업 대신) : 단계 이름 + 그 장·절의 대책
export type ProcedureStep = { name: string; main?: boolean; measures: DraftMeasure[] };
export type Procedure = { covers: string[]; code: string; steps: ProcedureStep[] };

export function buildNameDraft(desc: string, refs: DraftRefs, conds: string[], context: string, proc: Procedure | null = null): Draft {
  const top = refs.jsa[0];
  // 비슷한 작업 = 점수가 높거나, 과거 작업명의 글자가 작업 설명에 대부분 들어 있음
  const same = top && (top.score >= NEW_SCORE || overlap(grams(top.title), grams(desc)) >= 0.6);
  // 신규 작업 : 타사 JSA 가 충분히 비슷하면 그것, 아니면 기본 단계 (작업 준비 → 조건별 안전조치 단계 → 본 작업(지침 순서가 있으면 그 순서) → 정리)
  const ext = refs.ext[0];
  const skeleton = same ? top : ext && (ext.score >= NEW_SCORE || overlap(grams(ext.title), grams(desc)) >= 0.6) ? ext : null;
  const steps = skeleton ? skeleton.steps.map((s) => toDraftStep(skeleton.source, s)) : basicSteps(desc, conds, proc);
  supplementHazards(steps, [...refs.jsa.filter((r) => r !== skeleton).slice(0, 5), ...refs.ext.filter((r) => r !== skeleton).slice(0, 3)]);
  applyConditions(steps, conds, `${context} ${steps.map(stepText).join(" ")}`);
  const m = (k: string) => String(skeleton?.meta[k] ?? "");
  return {
    base: skeleton ? { id: skeleton.id, title: skeleton.title, source: skeleton.source, score: skeleton.score, group: skeleton.group_name, year: skeleton.year } : null,
    isNew: !same,
    steps,
    suggestions: [],
    sifGaps: sifGapsOf(steps, refs.sif),
    meta: { ppe: m("ppe"), equip: m("equip"), safety_equip: m("safety_equip"), docs: m("docs"), area: skeleton?.source === "jsa" ? (skeleton.area ?? "") : "" },
  };
}

// 절차서로 : 절차서 단계 + 단계마다 가장 비슷한 과거 단계(우리 JSA 우선)의 위험·현재 조치 + 빠진 단계 제안
export function buildSopDraft(sopSteps: SopStep[], refs: DraftRefs, conds: string[], context: string): Draft {
  const pool = [...refs.jsa, ...refs.ext].flatMap((r) => r.steps.map((s) => ({ r, s, g: grams(`${s.content} ${s.hazards.map((h) => h.content).join(" ")}`) })));
  const steps: DraftStep[] = sopSteps
    .filter((s) => s.name.trim() || s.work.trim())
    .map((s) => {
      const g = grams(`${s.name} ${s.work}`);
      let best: (typeof pool)[number] | null = null;
      let bestScore = 0;
      for (const p of pool) {
        const v = overlap(g, p.g) + (p.r.source === "jsa" ? 0.05 : 0);
        if (v > bestScore) [best, bestScore] = [p, v];
      }
      const own: DraftHazard[] = s.hazard
        .split(/\n|·|,(?=\s*\S)/)
        .map((x) => x.replace(/^\s*[-–·•ㆍ]+\.?\s*|^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean)
        .map((content) => ({ type: guessHazardType(content), content, freq: "", sev: "" }));
      const use = best && bestScore >= 0.3 ? best : null;
      const past = use ? toDraftStep(use.r.source, use.s) : null;
      const hazards = [
        ...own,
        ...(past?.hazards.filter((h) => !own.some((o) => o.content === h.content)).map((h) => ({ ...h, added: `${sourceLabel(use!.r.source)} · ${use!.r.title}` })) ?? []),
      ];
      return {
        content: [s.name, s.work].filter((x) => x.trim()).join("\n"),
        safe: [s.safety, past?.safe].filter((x) => x?.trim()).join("\n"),
        hazards,
        control: past?.control ?? "",
        checks: [],
        postFreq: past?.postFreq ?? "",
        postSev: past?.postSev ?? "",
        measures: [],
        from: use ? { title: use.r.title, source: use.r.source, step: use.s.content, match: Math.round(bestScore * 100) } : null,
      };
    });
  const suggestions = missingSteps(steps, conds);
  applyConditions(steps, conds, `${context} ${steps.map(stepText).join(" ")}`);
  return { base: null, isNew: false, steps, suggestions, sifGaps: sifGapsOf(steps, refs.sif), meta: { ppe: "", equip: "", safety_equip: "", docs: "", area: "" } };
}

// 초안 → JSA 단계 (채택한 빠진 단계는 제자리에 끼워 넣음)
export function draftToJsaSteps(d: Draft, adopt: string[]): JsaStep[] {
  const list: DraftStep[] = [...d.steps];
  for (const sg of [...d.suggestions].filter((s) => adopt.includes(s.key)).sort((a, b) => b.before - a.before)) list.splice(sg.before, 0, sg.step);
  const out = list.map((s) => {
    const desc = [s.control, ...s.measures.map((m) => `[보완] ${m.text}${m.ref ? ` (${m.ref})` : ""}`)].filter((x) => x.trim()).join("\n");
    return {
      cat: "",
      content: s.content,
      safe: s.safe,
      hazards: s.hazards.length ? s.hazards.map(({ type, content, freq, sev }) => ({ type, content, freq, sev })) : [emptyHazard()],
      control: desc
        ? { ...emptyControl(), needed: true, desc, checks: [...new Set([...s.checks, ...s.measures.map((m) => m.check)])], postFreq: s.postFreq, postSev: s.postSev }
        : emptyControl(),
    };
  });
  return out.length ? out : [emptyStep()];
}

// 절차서 → 검색어 (표준명 + 공정명 + 단계 이름)
export const sopQuery = (title: string, process: string | null, steps: SopStep[]) => [title, process ?? "", ...steps.map((s) => s.name)].join(" ").slice(0, 400);
