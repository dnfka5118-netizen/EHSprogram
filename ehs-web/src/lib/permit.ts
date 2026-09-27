// 안전작업허가서 (SYMC-F430 R12 · CF430-01 R04) 공통 정의 — 원본 디지털 양식과 같은 항목·문구
export type SuppKey = "confined" | "power" | "excavation" | "radiation" | "height" | "heavy";

export const SUPP_TYPES: { key: SuppKey; value: string; label: string }[] = [
  { key: "confined", value: "밀폐공간", label: "밀폐공간 출입작업" },
  { key: "power", value: "정전", label: "정전작업" },
  { key: "excavation", value: "굴착", label: "굴착작업" },
  { key: "radiation", value: "방사선", label: "방사선사용작업" },
  { key: "height", value: "고소", label: "고소작업" },
  { key: "heavy", value: "중장비", label: "중장비사용작업" },
];
// EHS 확인이 필요한 보충작업
export const EHS_SUPP: SuppKey[] = ["power", "excavation", "radiation", "height", "heavy"];

// 체크 저장 키 = {prefix}_{index} (필요) / {prefix}_{index}_ok (○ 확인 = 현장 적용 확인)
export const CHK = {
  docs: ["MSDS", "작업계획서", "기술자료(도면 등)", "비상 대피로 및 세안시설 위치도", "굴착도면", "작업절차서 또는 위험성평가와 허가대상 작업의 일치 확인"],
  ppe: ["안전모", "안전화", "보안경/보안면", "보호복", "안전대", "내화학복", "내화학 장갑", "내화학 장화", "방진·방독마스크", "송기마스크·공기호흡기", "용접장갑", "용접면", "절연장갑"],
  general: [
    "작업구역 설정(출입경고 표지)",
    "작업주위 인화성·가연성물질 제거",
    "안전교육 실시",
    "비산불티차단막 설치",
    "소화기 비치",
    "가스농도 측정",
    "화재감시자 SET(확성기, 방연마스크 등)",
    "밸브차단 및 차단표지 부착(도면 비교)",
    "맹판설치 및 표지부착(도면 비교)",
    "위험물질(가연성분진 포함) 방출 및 처리",
    "용기개방 및 압력방출",
    "용기내부 세정 및 처리",
    "불활성가스 치환 및 환기",
    "조명장비",
    "환기장비",
    "방폭형 공구",
  ],
  confined: ["통신수단", "구명장구(줄, 안전대)", "산소 및 유해가스농도 측정"],
  power1: ["전원차단 후 시건/꼬리표 — 제어실", "전원차단 후 시건/꼬리표 — 현장", "정전상태 확인"],
  radiation: ["비인가자 출입제한", "방사선 위험 표지", "자격증 소지", "방사선 방사점 도면 첨부", "작업구역 차단선"],
  height: ["작업발판, 안전난간", "추락방지망", "안전대 착용·부착"],
  heavy: ["자격증 소지", "현장 감독자 배치", "기상, 노면 상태 확인", "전선, 설비 등 간섭 확인", "신호수 배치", "매트 등 부속 장구"],
  resume: ["보호구 착용 확인", "가스농도 측정", "환기장치 지속 가동", "작업자 건강상태 확인", "통신수단 확인", "구명장구 확인", "작업발판·안전난간 등 고소장비 확인", "중장비 작동상태 확인"],
  complete: ["작업구간 정상화 확인", "LOTO(밸브/전원 원복) 실시", "각종 센서동작 원복", "작업장 정리정돈/청소", "화기작업 종료 시 잔여 불티 여부 확인", "폐기물 적법처리 및 배출 완료"],
} as const;
export type ChkGroup = keyof typeof CHK;
export const TWO_STAGE: ChkGroup[] = ["docs", "ppe", "general", "confined", "power1", "radiation", "height", "heavy"];

// 부표 1 — 작업별 위험등급 구분기준
export const GRADE_TABLE: [string, string, string, string][] = [
  ["일반위험작업", "위험물·유해화학물질 직접 취급", "취급시설·장소 또는 주위(3M 이내)", "A·B등급 이외"],
  ["화기작업", "인화성(폭발성)물질 체류 의심 장소·주위", "A등급 이외", "해당없음"],
  ["전기작업", "고압변전실(22.9kV 이상)", "380V 이상 / 취급시설·장소 내 / 생산공정 내", "A·B등급 이외"],
  ["밀폐공간작업", "공장 내 밀폐공간 지정구역", "A등급 이외", "해당없음"],
  ["굴착작업", "취급시설 내 / 고압전선·도시가스 매설 주위", "취급시설 주위(3M 이내)", "도로·유휴지 등, A·B등급 이외"],
  ["중장비작업", "이동식크레인 사용", "A등급 이외", "해당없음"],
  ["고소작업", "해당없음", "4M 이상 또는 안전난간 미비 등 열악한 환경", "B등급 이외"],
  ["방사선사용작업", "해당없음", "취급시설·장소 주위(3M 이내)", "B등급 이외"],
];

// 서명 칸
export const SIG = {
  prework_mgr: "작업관리자 확인",
  prework_wit: "입회자 확인",
  prework_ehs: "EHS 확인",
  suspend_mgr: "작업관리자 확인",
  suspend_wit: "입회자 확인",
  complete_mgr: "작업관리자 확인",
  complete_wit: "입회자 확인",
} as const;
export type SigKey = keyof typeof SIG;

export type Person3 = { org: string; name: string; phone: string };
export type ExtendRow = { id: string; reason: string; time: string; approver: string; sig: string };
export type SuspendRow = { id: string; stop: string; resume: string; reason: string };
export type FireRow = { id: string; material: string; result: string; time: string; by: string };
export type ConfinedRow = { id: string; inout: string; time: string; name: string; record: string; count: string };
export type AckRow = { id: string; name: string; sig: string };

export type PermitFields = {
  proc_no: string;
  risk_no: string;
  ppe_etc: string;
  power_ctrl_room: string;
  power_field: string;
  power_restore_time: string;
  power_restore_by: string;
  exc_gas_by: string;
  exc_elec_by: string;
  heavy_equip: string;
  heavy_operator: string;
  complete_time: string;
};

// 신청 단계 입력 (상신 시 결재 대상)
export type PermitApply = {
  department_id: string;
  psm: "해당" | "미해당";
  preop: "해당" | "미해당";
  work_type: "" | "일반위험" | "화기";
  supp: SuppKey[];
  grade: "" | "A" | "B" | "C";
  work_name: string;
  work_place: string;
  company_name: string;
  start_dt: string; // YYYY-MM-DDTHH:MM (한국 시간)
  end_dt: string;
  tags: { name: string; tag: string }[];
  managers: Person3[];
  witnesses: Person3[];
  risk_eval_id: string;
  checks: Record<string, boolean>; // 필요 체크 (…_ok 제외)
  fields: PermitFields;
};

// 발급 후 현장 기록
export type PermitField = {
  checks_ok: Record<string, boolean>; // ○ 확인 + 재개·완료 체크 + 굴착 매설 확인
  sigs: Partial<Record<SigKey, string>>; // PNG data URL
  extends: ExtendRow[];
  suspends: SuspendRow[];
  fire_logs: FireRow[];
  confined_logs: ConfinedRow[];
  acks: AckRow[];
  fields: Pick<PermitFields, "power_restore_time" | "power_restore_by" | "exc_gas_by" | "exc_elec_by" | "complete_time">;
};

export const rid = () => Math.random().toString(36).slice(2, 10);
export const emptyPerson = (): Person3 => ({ org: "", name: "", phone: "" });
export const emptyFields = (): PermitFields => ({
  proc_no: "",
  risk_no: "",
  ppe_etc: "",
  power_ctrl_room: "",
  power_field: "",
  power_restore_time: "",
  power_restore_by: "",
  exc_gas_by: "",
  exc_elec_by: "",
  heavy_equip: "",
  heavy_operator: "",
  complete_time: "",
});

// 기본 작업시간 : 지금(08:30 이전이면 08:30) ~ +4시간
export function defaultTimes(nowKst: string): { start: string; end: string } {
  const [d, t] = nowKst.split("T");
  const start = t < "08:30" ? `${d}T08:30` : `${d}T${t.slice(0, 5)}`;
  const endMs = Date.parse(`${start}:00Z`) + 4 * 3600000;
  return { start, end: new Date(endMs).toISOString().slice(0, 16) };
}

export function emptyPermit(nowKst: string, departmentId = ""): PermitApply {
  const { start, end } = defaultTimes(nowKst);
  return {
    department_id: departmentId,
    psm: "미해당",
    preop: "미해당",
    work_type: "",
    supp: [],
    grade: "",
    work_name: "",
    work_place: "",
    company_name: "",
    start_dt: start,
    end_dt: end,
    tags: [{ name: "", tag: "" }],
    managers: [emptyPerson()],
    witnesses: [emptyPerson()],
    risk_eval_id: "",
    checks: {},
    fields: emptyFields(),
  };
}

export function emptyFieldRecord(): PermitField {
  return {
    checks_ok: {},
    sigs: {},
    extends: [],
    suspends: [],
    fire_logs: Array.from({ length: 6 }, () => ({ id: rid(), material: "", result: "", time: "", by: "" })),
    confined_logs: Array.from({ length: 8 }, () => ({ id: rid(), inout: "", time: "", name: "", record: "", count: "" })),
    acks: Array.from({ length: 12 }, () => ({ id: rid(), name: "", sig: "" })),
    fields: { power_restore_time: "", power_restore_by: "", exc_gas_by: "", exc_elec_by: "", complete_time: "" },
  };
}

// 필수 서명 규칙 (원본 안내문 → 실제 검사)
export function requiredSigs(p: Pick<PermitApply, "grade" | "supp">): SigKey[] {
  const out: SigKey[] = ["prework_mgr"];
  if (p.grade === "A" || p.grade === "B") out.push("prework_wit");
  if (p.grade === "A" || p.grade === "B" || p.supp.some((s) => EHS_SUPP.includes(s))) out.push("prework_ehs");
  return out;
}

// 근무시간(08:30~17:30) 밖이거나 날짜를 넘기면 경고
export function outsideHours(start: string, end: string): boolean {
  if (!start || !end) return false;
  const ts = start.slice(11, 16);
  const te = end.slice(11, 16);
  return ts < "08:30" || ts > "17:30" || te < "08:30" || te > "17:30" || start.slice(0, 10) !== end.slice(0, 10);
}

export const PERMIT_STATUS = {
  draft: { label: "작성중", style: "bg-gray-100 text-gray-700" },
  in_review: { label: "결재중", style: "bg-amber-100 text-amber-800" },
  rejected: { label: "반려", style: "bg-red-100 text-red-700" },
  withdrawn: { label: "상신취소", style: "bg-gray-100 text-gray-600" },
  issued: { label: "발급(작업중)", style: "bg-blue-100 text-blue-800" },
  completed: { label: "작업완료", style: "bg-emerald-100 text-emerald-800" },
} as const;
export type PermitStatus = keyof typeof PERMIT_STATUS;
