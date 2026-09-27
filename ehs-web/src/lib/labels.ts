import type { FindingStatus, MeasureKind } from "./types";

export const STATUS_LABEL: Record<FindingStatus, string> = {
  assign_wait: "담당자 지정 대기",
  plan_wait: "계획 수립 대기",
  in_progress: "조치 중",
  approval_wait: "승인 대기",
  closed: "종결",
};

export const STATUS_STYLE: Record<FindingStatus, string> = {
  assign_wait: "bg-amber-100 text-amber-800",
  plan_wait: "bg-orange-100 text-orange-800",
  in_progress: "bg-blue-100 text-blue-800",
  approval_wait: "bg-violet-100 text-violet-800",
  closed: "bg-emerald-100 text-emerald-800",
};

export const MEASURE_KINDS: MeasureKind[] = ["immediate", "short", "long"];

export const MEASURE_LABEL: Record<MeasureKind, string> = {
  immediate: "즉시조치",
  short: "단기대책",
  long: "장기대책",
};

export const MEASURE_HINT: Record<MeasureKind, string> = {
  immediate: "즉시 조치",
  short: "한 달 이내",
  long: "한 달 초과",
};

export const PERM_LABEL = { none: "없음", read: "열람", write: "작성" } as const;
