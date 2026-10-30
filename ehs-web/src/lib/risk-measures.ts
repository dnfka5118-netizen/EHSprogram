// AI 위험성평가 작성 : 감소대책 모으기 (API 없이)
//   단계마다 ① 비슷한 과거 단계의 현재안전조치·감소대책 (우리 JSA · 타사)
//           ② 비슷한 공단 SIF 사고 사례의 위험성 감소대책(예시)
//           ③ 작업 조건·장비와 연결된 KOSHA 지침의 "~할 것 / ~하여야 한다" 문장 (관리 문장 빼고 "~한다" 로)
//   한 번 쓴 대책은 다른 단계에 다시 넣지 않음 (같은 대책이 모든 위험에 반복되지 않게)
import { EQUIP_GUIDES, WORK_CONDITIONS, type ControlCheck } from "./risk-rules";
import { grams, overlap, sourceLabel, type DraftMeasure, type DraftStep, type RiskRef } from "./risk-ref";

export const MAX_MEASURES = 10; // 단계당 [보완] 대책 최대
const PER = { past: 4, kosha: 4, sif: 2 };
const PAST_MIN_SCORE = 0.35; // 이보다 덜 비슷한 과거 평가서의 대책은 쓰지 않음

// "작업 · 한다 · 실시 · 확인" 처럼 어디에나 있는 글자 묶음은 비교에서 뺌
const STOP = new Set([
  "작업",
  "업자",
  "업시",
  "업을",
  "업은",
  "업이",
  "한다",
  "하여",
  "여야",
  "하고",
  "하는",
  "하지",
  "있는",
  "있다",
  "실시",
  "확인",
  "인한",
  "으로",
  "에서",
  "시에",
  "등의",
  "경우",
  "위한",
  "위해",
  "해야",
  "도록",
  "않도",
  "사용",
  "용한",
  "용하",
  "안전",
  "전한",
  "전하",
  "하게",
  "되어",
  "어야",
  "한지",
  "인지",
  "여부",
]);
const kgrams = (s: string) => {
  const g = grams(s);
  for (const x of STOP) g.delete(x);
  return g;
};

// 칸 글 → 대책 한 줄씩 ("1. …", "• …", "▶ …", "-. …", "(가) …") · 기호 없이 줄만 바뀐 것은 앞줄에 이어 붙임
const MARK = /^\s*(▶|•|ㆍ|◦|○|□|[-–·]+\.?|\d{1,2}[.)]|\([가-하0-9]{1,2}\)|[①-⑳㉮-㉻])\s*/;
export function splitItems(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .replace(/\s*(▶|•)\s*/g, "\n$1 ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const l of lines) {
    if (out.length && !MARK.test(l) && !/[다것요음함됨.]$/.test(out[out.length - 1])) out[out.length - 1] += ` ${l}`;
    else out.push(l);
  }
  return out.map((s) => s.replace(MARK, "").replace(/\s+/g, " ").trim()).filter((s) => s.replace(/\s/g, "").length >= 6);
}

// KOSHA 본문 → 현장 대책 문장
const IMPERATIVE = /(할\s*것|하여야\s*한다|해야\s*한다|하여야\s*하며|하도록\s*한다|한다|않는다|금지한다|금지|않도록\s*한다)\.?$/;
const ADMIN =
  /사업주는?.*(계획|교육|문서|기록|선임|지정|수립|제정|작성|보존|평가|위촉|비치하여야)|말한다|정의|다음\s*각\s*호|다음과\s*같|다음의|다음\s*사항|이\s*(규정|지침)|적용한다|적용하지|참고|유의한다|원칙|규칙\s*제|법령|고시|에\s*따른다|준용|제조업체|제조자|설계|시험\s*방법|기준은|조건을\s*갖추어야|[항호]과\s*같이|[항호]와\s*같이|에\s*따라|상기|아래와|제\s*\d+\s*[항조호]|\d+\.\d+(\.\d+)*\s*항|^다만|기록|점검은|점검\s*외에|포함한다$|방법을\s*포함|검증|시험은|표지는|가축|음식물|별도로\s*구분하여\s*운반/;
// 스캔(OCR)으로 깨진 문장 : 이상한 기호 · 한글 사이 영문/숫자 한 글자 조각
const BROKEN = /[口卜冂{}|\\<>]|[가-힣][A-Za-z0-9]{1,2}[-}][가-힣]|^\d+\s|^[가-힣]\s?-|\s[가-힣]-\s/;
export function koshaItems(text: string) {
  return text
    .replace(/하\s+여야/g, "하여야")
    .split(/\n|(?=\([가-하]\)|\(\d{1,2}\)|[①-⑳㉮-㉻])|(?<=[다것]\.)\s+/)
    .map((s) =>
      s
        .replace(/^\s*(\([가-하0-9]{1,2}\)|[①-⑳㉮-㉻]|[가-하]\.|\d{1,2}[.)]|[-·•o]\s)\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length >= 14 && s.length <= 150 && IMPERATIVE.test(s) && !ADMIN.test(s) && !BROKEN.test(s) && /^[가-힣A-Za-z“"'(]/.test(s))
    .map((s) =>
      s
        .replace(/^(또한|그리고|단,?)\s+/, "")
        .replace(/^(사업주|근로자|작업자|관리감독자|운전원)(는|은)\s+/, "")
        .replace(/하여야\s*한다\.?$|해야\s*한다\.?$/, "한다")
        .replace(/하여야\s*하며\.?$/, "한다")
        .replace(/할\s*것\.?$/, "한다")
        .replace(/\.$/, ""),
    );
}

export function guessCheck(s: string): ControlCheck {
  if (/착용|보호구|안전대|보안경|보안면|장갑|마스크|안전모|귀마개|보호복/.test(s)) return "보호구";
  if (/설치|방호|차단|잠금|LOTO|환기|국소배기|방지망|난간|덮개|가드|인터록|접지|방폭/i.test(s)) return "공학적";
  if (/제거|배출|퍼지|치환|없앤/.test(s)) return "제거";
  if (/대체|교체하여\s*사용/.test(s)) return "대체";
  return "관리적";
}

type Cand = { text: string; g: Set<string>; ref: string; src: string; anchor?: RegExp; conds: string[]; primary?: string[] };
const focusOf = (s: DraftStep) => kgrams([s.content, ...s.hazards.map((h) => h.content)].join(" "));
const refOf = (r: RiskRef) => `KOSHA ${r.meta.code} ${String(r.meta.section ?? "").replace(/\s*\(\d+\)$/, "")}`.slice(0, 80);

export type MeasureSources = {
  past: RiskRef[]; // 우리 JSA · 타사 (뼈대 제외)
  sif: RiskRef[];
  kosha: RiskRef[]; // 연결 지침 전체 장·절 + 검색된 장·절
  linked: string[]; // 장비·조건으로 연결된 지침 번호
  context: string; // 작업 설명 · 장비 · 물질 (작업 설명으로 만들 때만 본 작업 단계에 씀)
  main?: string; // 작업 설명 첫 줄 — 이 글이 들어간 단계 = 본 작업 단계
};

export function collectMeasures(steps: DraftStep[], src: MeasureSources) {
  const used: Set<string>[] = steps.flatMap((s) => splitItems(`${s.safe}\n${s.control}`).map(kgrams)).concat(steps.flatMap((s) => s.measures.map((m) => kgrams(m.text))));
  const isDup = (g: Set<string>) => !g.size || used.some((u) => overlap(g, u) >= 0.6 || overlap(u, g) >= 0.8);

  // ① 과거 단계 : 충분히 비슷한 평가서 중 단계 글이 서로 50% 이상 겹치는 단계의 현재조치 + 감소대책
  const pastSteps = src.past
    .filter((r) => r.score >= PAST_MIN_SCORE)
    .flatMap((r) => r.steps.map((s) => ({ r, s, g: kgrams(s.content) })))
    .filter((c) => c.g.size >= 2);
  // ② SIF : 충분히 비슷한 사례(0.5 이상)의 감소대책(예시)
  const sifCands: Cand[] = src.sif
    .filter((r) => r.score >= 0.5)
    .slice(0, 5)
    .flatMap((r) =>
      splitItems(String(r.meta.measure ?? ""))
        .filter((t) => t.length >= 15)
        .map((t) => ({ text: t, g: kgrams(t), ref: `SIF · ${r.title}`, src: "SIF", conds: [] })),
    );
  // ③ KOSHA : 장비 낱말이 있는 단계 · 그 지침을 근거로 쓰는 조건 단계에 우선, 검색된 지침은 0.6 이상만
  const anchorOf = (code: string) => {
    const eq = EQUIP_GUIDES.filter((e) => e.codes.includes(code)).map((e) => e.re.source);
    return eq.length ? new RegExp(eq.join("|"), "i") : undefined;
  };
  const condsOf = (code: string) => WORK_CONDITIONS.filter((c) => c.measures.some((m) => m.ref.endsWith(code)) || c.step?.ref.endsWith(code)).map((c) => c.key);
  // 연결되지 않은 지침은 검색 점수 0.6 이상인 상위 3개 지침만
  const searched = [...new Set(src.kosha.filter((r) => !src.linked.includes(String(r.meta.code)) && r.score >= 0.6).map((r) => String(r.meta.code)))].slice(0, 3);
  const koshaCands: Cand[] = src.kosha
    .filter((r) => src.linked.includes(String(r.meta.code)) || searched.includes(String(r.meta.code)))
    .flatMap((r) =>
      koshaItems(String(r.meta.text ?? "")).map((t) => ({
        text: t,
        g: kgrams(t),
        ref: refOf(r),
        src: "KOSHA",
        anchor: anchorOf(String(r.meta.code)),
        conds: condsOf(String(r.meta.code)),
        primary: WORK_CONDITIONS.filter((c) => c.step?.ref.endsWith(String(r.meta.code))).map((c) => c.key),
      })),
    );

  for (const st of steps) {
    const focus = focusOf(st);
    const add = (c: Cand) => {
      if (st.measures.length >= MAX_MEASURES || isDup(c.g)) return false;
      used.push(c.g);
      st.measures.push({ text: c.text, check: guessCheck(c.text), ref: c.ref, cond: c.src });
      return true;
    };
    // ① 과거 단계 (마무리 단계는 어느 작업에나 비슷해서 엉뚱한 대책이 붙으므로 뺌)
    if (st.basic !== "end" && (!st.basic || st.basic === "prep")) {
      const g = kgrams(st.content);
      const matched = pastSteps
        .map((c) => ({ ...c, v: Math.max(overlap(g, c.g), overlap(c.g, g)) }))
        .filter((c) => c.v >= 0.5 && c.s.content !== st.content)
        .sort((a, b) => b.v - a.v)
        .slice(0, 4);
      let n = 0;
      for (const m of matched)
        for (const t of splitItems(`${m.s.current}\n${m.s.control}`)) {
          if (n >= PER.past) break;
          if (add({ text: t, g: kgrams(t), ref: `${sourceLabel(m.r.source)} · ${m.r.title}`, src: m.r.source === "jsa" ? "우리 JSA" : "타사", conds: [] })) n++;
        }
    }
    // ③ KOSHA : 글 겹침 + 장비 낱말(본 작업 단계는 작업 설명·장비 칸까지) + 조건 단계/조건이 붙는 단계 가점 · 한 단계에 한 지침은 3개까지
    const isMain = !st.basic && !!src.main && st.content.includes(src.main);
    const anchorText = isMain ? `${st.content} ${src.context}` : st.content;
    const attachTo = (keys: string[] = []) => keys.some((k) => WORK_CONDITIONS.find((w) => w.key === k)?.attach.test(st.content));
    const attached = (c: Cand) => attachTo(c.conds);
    //   연결 근거(장비 · 조건) 없이 글 겹침만으로는 0.4 이상일 때만
    const ks = koshaCands
      .map((c) => {
        // 장비 낱말 · 조건 단계는 강한 근거, "조건이 붙는 단계"(분해·교체 …)는 약한 근거라 글도 어느 정도 겹쳐야 함
        // 조건의 대표 지침(LOTO · 밀폐 · 고소 …)이 그 조건이 붙는 작업 단계에 있으면 강한 근거
        const strong = (c.anchor?.test(anchorText) ? 0.3 : 0) + (st.basic && c.conds.includes(st.basic) ? 0.4 : 0);
        const primary = !st.basic && attachTo(c.primary);
        const weak = !st.basic && attached(c);
        const o = overlap(c.g, focus);
        return { c, v: o + strong + (primary ? 0.3 : weak ? 0.15 : 0), ok: strong > 0 ? o + strong >= 0.4 : primary ? o >= 0.2 : weak ? o >= 0.3 : o >= 0.5 };
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.v - a.v);
    const perGuide = new Map<string, number>();
    const limit = st.basic ? PER.kosha : PER.kosha + 2;
    let k = 0;
    for (const x of ks) {
      if (k >= limit) break;
      const code = x.c.ref.split(" ")[1];
      if ((perGuide.get(code) ?? 0) >= 3) continue;
      if (add(x.c)) {
        k++;
        perGuide.set(code, (perGuide.get(code) ?? 0) + 1);
      }
    }
    // ② SIF
    const ss = sifCands
      .map((c) => ({ c, v: overlap(c.g, focus) }))
      .filter((x) => x.v >= 0.2)
      .sort((a, b) => b.v - a.v);
    let s = 0;
    for (const x of ss) {
      if (s >= PER.sif) break;
      if (add(x.c)) s++;
    }
  }
  // 본 작업 단계 등 아직 대책이 적은 단계 : 연결 지침 문장을 장비 낱말 기준으로 더 채움
  for (const st of steps) {
    if (st.measures.length >= 4 || st.basic) continue;
    const anchorText = !!src.main && st.content.includes(src.main) ? `${st.content} ${src.context}` : st.content;
    for (const c of koshaCands.filter((c) => c.anchor?.test(anchorText))) {
      if (st.measures.length >= 6) break;
      if (!isDup(c.g)) {
        used.push(c.g);
        st.measures.push({ text: c.text, check: guessCheck(c.text), ref: c.ref, cond: c.src });
      }
    }
  }
}

// 지침 장·절에서 단계 이름에 맞는 대책 (지침 순서 단계용)
export function sectionMeasures(kosha: RiskRef[], code: string, section: RegExp, max = 5): DraftMeasure[] {
  return kosha
    .filter((r) => r.meta.code === code && section.test(String(r.meta.section ?? "")))
    .flatMap((r) => koshaItems(String(r.meta.text ?? "")).map((t) => ({ text: t, check: guessCheck(t), ref: refOf(r), cond: "KOSHA" })))
    .slice(0, max);
}
