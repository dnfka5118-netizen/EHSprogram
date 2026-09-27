// 수시 위험성평가(JSA) 공통 정의 — 원본 CF112-01/02 R02 도구와 같은 항목·규칙
export const HAZARD_GROUPS: { label: string; types: string[] }[] = [
  { label: "기계(설비)", types: ["협착", "베임/절단", "추락", "낙하", "충돌", "넘어짐", "전도"] },
  { label: "전기", types: ["감전", "아크", "정전기"] },
  { label: "화학", types: ["화재/폭발", "누출"] },
  { label: "작업특성", types: ["소음", "질식", "근골격계"] },
  { label: "온도", types: ["한랭", "온열"] },
  { label: "기타 위험 유형", types: ["기타"] },
];
export const HAZARD_TYPES = HAZARD_GROUPS.flatMap((g) => g.types);
export const CONTROL_OPTS = ["제거", "대체", "공학적", "관리적", "보호구"] as const;

export type JsaHazard = { type: string; content: string; freq: string; sev: string };
export type JsaControl = {
  needed: boolean;
  checks: string[];
  desc: string;
  impNo: string;
  target: string;
  owner: string;
  done: string;
  postFreq: string;
  postSev: string;
};
export type JsaStep = { cat: string; content: string; safe: string; hazards: JsaHazard[]; control: JsaControl };

export type JsaForm = {
  department_id: string;
  eval_date: string;
  super_name: string;
  worker_name: string;
  ehs_name: string;
  super_count: string;
  worker_count: string;
  ehs_count: string;
  work_area: string;
  sop_no: string;
  work_name: string;
  work_no: string;
  material: string;
  ppe: string;
  equip: string;
  safety_equip: string;
  req_docs: string;
  steps: JsaStep[];
};

export const emptyHazard = (): JsaHazard => ({ type: "", content: "", freq: "", sev: "" });
export const emptyControl = (): JsaControl => ({ needed: false, checks: [], desc: "", impNo: "", target: "", owner: "", done: "", postFreq: "", postSev: "" });
export const emptyStep = (): JsaStep => ({ cat: "", content: "", safe: "", hazards: [emptyHazard()], control: emptyControl() });

export function emptyJsa(today: string, departmentId = ""): JsaForm {
  return {
    department_id: departmentId,
    eval_date: today,
    super_name: "",
    worker_name: "",
    ehs_name: "",
    super_count: "",
    worker_count: "",
    ehs_count: "",
    work_area: "",
    sop_no: "",
    work_name: "",
    work_no: "",
    material: "",
    ppe: "",
    equip: "",
    safety_equip: "",
    req_docs: "",
    steps: [emptyStep()],
  };
}

// DB 행 → 편집 폼
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsaFromRow(row: Record<string, any>): JsaForm {
  const s = (v: unknown) => (v == null ? "" : String(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: JsaStep[] = ((row.steps ?? []) as any[]).map((st) => ({
    cat: s(st.cat),
    content: s(st.content),
    safe: s(st.safe),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hazards: ((st.hazards ?? []) as any[]).map((h) => ({ type: s(h.type), content: s(h.content), freq: s(h.freq), sev: s(h.sev) })),
    control: { ...emptyControl(), ...(st.control ?? {}), checks: Array.isArray(st.control?.checks) ? st.control.checks : [] },
  }));
  return {
    department_id: s(row.department_id),
    eval_date: s(row.eval_date),
    super_name: s(row.super_name),
    worker_name: s(row.worker_name),
    ehs_name: s(row.ehs_name),
    super_count: s(row.super_count),
    worker_count: s(row.worker_count),
    ehs_count: s(row.ehs_count),
    work_area: s(row.work_area),
    sop_no: s(row.sop_no),
    work_name: s(row.work_name),
    work_no: s(row.work_no),
    material: s(row.material),
    ppe: s(row.ppe),
    equip: s(row.equip),
    safety_equip: s(row.safety_equip),
    req_docs: s(row.req_docs),
    steps: steps.length ? steps : [emptyStep()],
  };
}

export const riskOf = (freq: string, sev: string): number | null => {
  const f = Number(freq);
  const v = Number(sev);
  return f > 0 && v > 0 ? f * v : null;
};

// 위험도 색 : 1 연녹색 … 25 진빨강 (참고용 시각화, 등급 판정 아님)
export function riskColor(v: number | null): string | undefined {
  if (!v || v <= 0) return undefined;
  const t = Math.min(1, (v - 1) / 24);
  return `hsl(${(120 - 120 * t).toFixed(0)},72%,${(88 - 28 * t).toFixed(0)}%)`;
}
export const riskTextColor = (v: number | null) => (v != null && v >= 12 ? "#fff" : "#1a1a1a");

export function aggregate(steps: JsaStep[]) {
  const count: Record<string, number> = {};
  const max: Record<string, number> = {};
  for (const t of HAZARD_TYPES) {
    count[t] = 0;
    max[t] = 0;
  }
  for (const st of steps)
    for (const h of st.hazards) {
      if (!h.type || count[h.type] === undefined) continue;
      count[h.type]++;
      const r = riskOf(h.freq, h.sev) ?? 0;
      if (r > max[h.type]) max[h.type] = r;
    }
  return { count, max };
}

export const maxRisk = (steps: JsaStep[]) => Math.max(0, ...steps.flatMap((s) => s.hazards.map((h) => riskOf(h.freq, h.sev) ?? 0)));

// 「예시 보기」 데이터 (원본과 동일 내용)
export function sampleJsa(today: string, departmentId: string): JsaForm {
  return {
    ...emptyJsa(today, departmentId),
    super_name: "김반장",
    worker_name: "이작업, 박작업",
    ehs_name: "최안전",
    super_count: "1",
    worker_count: "2",
    ehs_count: "1",
    work_area: "2공장 반응동 3층 R-201 주변",
    sop_no: "SOP-R201-03",
    work_name: "R-201 반응기 맨홀 개방 후 내부 배관 용접보수",
    work_no: "WO-2026-0912",
    material: "톨루엔, 질소",
    ppe: "안전모, 내화학장갑, 송기마스크",
    equip: "가스검지기, 용접기",
    safety_equip: "소화기, 화재감시",
    req_docs: "MSDS, 배관도면",
    steps: [
      {
        cat: "준비작업",
        content: "맨홀 개방 전 잔류 물질 확인 및 질소 치환",
        safe: "1.가스농도 측정 후 개방\n2.환기 및 불활성화 처리 후 작업 실시",
        hazards: [
          { type: "질식", content: "질소 치환 중 산소결핍 공기 흡입", freq: "2", sev: "4" },
          { type: "화재/폭발", content: "잔류 인화성 증기 점화", freq: "2", sev: "5" },
        ],
        control: {
          needed: true,
          checks: ["공학적", "관리적"],
          desc: "개방 전 질소 치환 후 산소농도 18%이상 확인, 화기감시자 배치",
          impNo: "IMP-01",
          target: today,
          owner: "최안전",
          done: "",
          postFreq: "1",
          postSev: "3",
        },
      },
      {
        cat: "용접작업",
        content: "배관 손상부위 용접보수",
        safe: "1.주변 가연물 제거, 소화기 비치\n2.국소배기장치 가동",
        hazards: [
          { type: "화재/폭발", content: "용접 불티 비산에 의한 화재", freq: "2", sev: "4" },
          { type: "질식", content: "용접흄·유해가스 흡입", freq: "2", sev: "3" },
        ],
        control: {
          needed: true,
          checks: ["공학적", "보호구"],
          desc: "국소배기 가동 및 방독마스크 착용, 화재감시자 상시 배치",
          impNo: "IMP-02",
          target: today,
          owner: "김반장",
          done: "",
          postFreq: "1",
          postSev: "2",
        },
      },
    ],
  };
}
