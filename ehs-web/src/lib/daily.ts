// 관리감독자 일일점검 (안전보건 관리감독자 일일업무일지 A·B·C·D형) — 0018

export type DailyResult = "O" | "X" | "△" | "-";
export type DailyCycle = "D" | "W" | "M";

export const RESULT_LABEL: Record<DailyResult, string> = { O: "적합", X: "부적합", "△": "이벤트", "-": "해당 없음" };
export const RESULT_HINT = "O : 적합 / 정상 · X : 부적합 / 개선 필요 · △ : 이벤트 발생 · - : 해당 없음";
export const CYCLE_LABEL: Record<DailyCycle, string> = { D: "매일", W: "주 1회", M: "월 1회" };

export type DailyForm = { code: string; name: string; form_no: string | null; writer_note: string | null; sort_order: number; is_active: boolean };
export type DailyFormItem = {
  id: string;
  form_code: string;
  sort_order: number;
  category: string;
  code: string;
  content: string;
  cycle: DailyCycle;
  cycle_note: string | null;
  is_active: boolean;
};
export type DailyArea = {
  id: string;
  site_id: string;
  name: string;
  form_code: string;
  department_id: string | null;
  location_id: string | null;
  sub_location_id: string | null;
  qr_token: string;
  is_active: boolean;
  sort_order: number;
};

// daily_open() 결과
export type DailyOpenItem = {
  id: string;
  category: string;
  code: string;
  content: string;
  cycle: DailyCycle;
  cycle_note: string | null;
  done_on: string | null; // 주간·월간 : 이번 기간에 이미 한 날
  result: DailyResult | null; // 오늘 저장한 판정
  note: string | null;
  action: "immediate" | "request" | null;
  finding_id: string | null;
};
export type DailyOpen = {
  today: string;
  biz_day: boolean;
  area: {
    id: string;
    name: string;
    form_code: string;
    department_id: string | null;
    department: string | null;
    location: string | null;
    sub_location: string | null;
    site: string | null;
  };
  form: DailyForm;
  is_member: boolean;
  can_substitute: boolean; // 담당자가 아니어도 대체 점검 가능 (임직원)
  members: string[];
  member_list: { id: string; name: string; position: string | null }[]; // 대신할 담당자 (본인 제외)
  checked_by: string | null;
  checked_at: string | null;
  is_backfill: boolean;
  substitute_for: string | null;
  items: DailyOpenItem[];
};

export const SUB_REASONS = ["휴가", "외근", "교육", "출장", "기타"];

export const qrPath = (token: string) => `/d/${token}`;
export const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
