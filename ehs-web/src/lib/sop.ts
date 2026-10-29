// 표준운전절차서 (안전운전 절차서 CF410-01 R02) 공통 정의 — 원본 양식과 같은 항목·문구
export const SOP_FORM_NO = "CF410-01, R02";

// 용도
export const PURPOSES = [
  "최초의 시운전",
  "정상 운전",
  "비상시 운전",
  "정상적인 운전 정지",
  "비상정지",
  "임시 운전",
  "정비 또는 정기보수 후의 운전개시",
  "자연재해로 인하여 가동 중지된 설비의 긴급 운전",
];

// 유해위험 요인 Check (양식의 4칸 그대로)
export const HAZARD_COLS: string[][] = [
  ["화재 및 폭발 위험", "화학물질누출 위험", "추락 및 낙하 위험", "질식 위험", "화상 위험", "협착 위험"],
  ["미끄럼 위험", "걸려 넘어질 위험", "타격 및 분출 위험", "절단 및 자상 위험", "추돌 위험", "근골격계 위험"],
  ["무리한 힘", "휴먼에러 위험", "회전체 위험", "설비파손 위험", "배관막힘 위험", "협소공간 위험"],
  ["날씨 위험", "동파 위험", "고온 위험", "정전기 위험", "정전 위험", "감전 위험"],
];

// 예시(F220-SOP-과수-001) 기준 기본 문구 — 작성할 때 고침
export const DEFAULT_CONTACTS = "상황실 : 041)520-8054\nEHS : 041)520-8058";
export const DEFAULT_EMERGENCY = [
  "1. 작동 이상시 : 조작을 금지하고, 상황실로 연락하여 조치 받으시오",
  "2. 인체 노출시 : 즉시 가까운 세안시설로 달려가서 15분이상 씻어내시오",
  "3. 화재 발생시 : 즉시 비상연락처로 신고하시오",
  "4. 누출 발생시 : 비상연락처로 누출상황을 보고한 후, 대피하시오",
].join("\n");

export type SopStep = {
  name: string; // 작업 단계
  photos: string[]; // Storage docs 경로 sop/{문서ID}/…
  hazard: string; // 유해위험 요인
  work: string; // 작업 내용
  safety: string; // 안전 대책
  standard: string; // 안전설비 및 작업관리기준
};
export type SopHistory = { rev: number; content: string; date: string };

export type SopForm = {
  sop_no: string;
  title: string;
  process_name: string;
  department_id: string;
  writers: string;
  scope: string;
  purposes: string[];
  supplies: string;
  ppe: string;
  materials: string;
  contacts: string;
  hazards: string[];
  emergency: string;
  risk_eval_id: string;
  risk_no: string;
  grade: "" | "A" | "B" | "C";
  steps: SopStep[];
  history: SopHistory[];
};

export const emptyStep = (): SopStep => ({ name: "", photos: [], hazard: "", work: "", safety: "", standard: "" });

export function emptySop(today: string, departmentId = "", writer = ""): SopForm {
  return {
    sop_no: "",
    title: "",
    process_name: "",
    department_id: departmentId,
    writers: writer,
    scope: "",
    purposes: [],
    supplies: "",
    ppe: "",
    materials: "",
    contacts: DEFAULT_CONTACTS,
    hazards: [],
    emergency: DEFAULT_EMERGENCY,
    risk_eval_id: "",
    risk_no: "",
    grade: "",
    steps: [emptyStep()],
    history: [{ rev: 0, content: "제정", date: today }],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sopFromRow(row: Record<string, any>): SopForm {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    sop_no: s(row.sop_no),
    title: s(row.title),
    process_name: s(row.process_name),
    department_id: s(row.department_id),
    writers: s(row.writers),
    scope: s(row.scope),
    purposes: Array.isArray(row.purposes) ? row.purposes : [],
    supplies: s(row.supplies),
    ppe: s(row.ppe),
    materials: s(row.materials),
    contacts: s(row.contacts),
    hazards: Array.isArray(row.hazards) ? row.hazards : [],
    emergency: s(row.emergency),
    risk_eval_id: s(row.risk_eval_id),
    risk_no: s(row.risk_no),
    grade: (["A", "B", "C"].includes(row.grade) ? row.grade : "") as SopForm["grade"],
    steps: (Array.isArray(row.steps) ? row.steps : []).map((x: Partial<SopStep>) => ({ ...emptyStep(), ...x, photos: Array.isArray(x.photos) ? x.photos : [] })),
    history: Array.isArray(row.history) ? row.history : [],
  };
}

// 제개정 이력의 작성 · 검토 · 검토 · 승인 칸 : 결재 단계 순서대로 "이름\n일시" (승인은 결재가 끝났을 때 마지막 칸)
export function sopStamps(
  approval: { status: string; steps: { status: string; approver_name?: string | null; acted_at?: string | null }[] } | null,
  fmt: (v: string | null | undefined) => string,
): [string, string, string, string] {
  const done = (approval?.steps ?? []).filter((s) => s.status === "approved").map((s) => `${s.approver_name ?? ""}\n${fmt(s.acted_at)}`);
  const approved = approval?.status === "approved";
  const mid = approved ? done.slice(1, -1) : done.slice(1);
  return [done[0] ?? "", mid[0] ?? "", mid[1] ?? "", approved && done.length > 1 ? done[done.length - 1] : ""];
}

export const SOP_STATUS = {
  draft: { label: "작성중", style: "bg-gray-100 text-gray-700" },
  in_review: { label: "결재중", style: "bg-amber-100 text-amber-800" },
  approved: { label: "결재완료", style: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "반려", style: "bg-red-100 text-red-700" },
  withdrawn: { label: "상신취소", style: "bg-gray-100 text-gray-600" },
} as const;
