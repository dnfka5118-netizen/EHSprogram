// 유해화학물질 취급시설 자체점검 (별지 제42호서식 · 양식 CE310-07) — 0022

export type ChemResult = "ok" | "fixed" | "recheck";
export const CHEM_RESULTS: { v: ChemResult; label: string; short: string }[] = [
  { v: "ok", label: "문제없음", short: "문제없음" },
  { v: "fixed", label: "자체점검 시 조치완료", short: "조치완료" },
  { v: "recheck", label: "정밀 재점검 필요", short: "재점검" },
];

export type ChemItem = { id: string; code: string; content: string; sort_order: number; is_active: boolean };
export type ChemPlace = { id: string; group_id: string; name: string; sort_order: number; is_active: boolean };
export type ChemGroup = { id: string; site_id: string; name: string; department_id: string | null; sort_order: number; is_active: boolean };

// 점검대장 한 장 (화면 · 인쇄 공용)
export type ChemCheck = {
  id: string;
  group: ChemGroup & { department: string | null };
  check_date: string;
  week_start: string;
  time_text: string | null;
  inspector: { name: string; department: string | null } | null;
  saved_at: string | null;
  items: ChemItem[];
  places: ChemPlace[];
  results: Record<string, ChemResult>; // `${item}|${place}`
  notes: Record<string, { note: string | null; finding_id: string | null }>; // item
  memberIds: string[];
};
