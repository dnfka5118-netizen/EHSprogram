// 개선 의견 게시판 (0028) : 상태 · 분류 · 화면용 타입

export type SuggestionStatus = "submitted" | "reviewing" | "accepted" | "rejected" | "done";

export const SUGGESTION_STATUS: Record<SuggestionStatus, { label: string; style: string }> = {
  submitted: { label: "접수 대기", style: "bg-gray-100 text-gray-700" },
  reviewing: { label: "검토 중", style: "bg-amber-100 text-amber-800" },
  accepted: { label: "수용", style: "bg-brand-100 text-brand-800" },
  rejected: { label: "미수용", style: "bg-red-100 text-red-700" },
  done: { label: "반영 완료", style: "bg-emerald-100 text-emerald-800" },
};

// 관련 메뉴 (어느 기능에 대한 의견인지)
export const SUGGESTION_CATEGORIES = ["점검", "위험성평가", "안전작업허가", "전자결재", "알림·메일", "화면·사용법", "기타"];

export type SuggestionRow = {
  id: string;
  no: number;
  category: string;
  title: string;
  status: SuggestionStatus;
  author_name: string;
  is_mine: boolean;
  anonymous: boolean;
  comments: number;
  photos: number;
  created_at: string;
  answered_at: string | null;
  done_at: string | null;
};

export type SuggestionDetail = {
  id: string;
  no: number;
  category: string;
  title: string;
  body: string;
  photos: string[];
  status: SuggestionStatus;
  anonymous: boolean;
  author_name: string;
  is_mine: boolean;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  can_delete: boolean;
  can_answer: boolean;
  comments: { id: string; body: string; created_at: string; is_mine: boolean; author_name: string; is_ehs: boolean }[];
  events: { action: string; note: string | null; created_at: string; actor_name: string | null }[];
};

export const EVENT_LABEL: Record<string, string> = {
  created: "의견 등록",
  edited: "의견 수정",
  reviewing: "검토 중으로 접수",
  accepted: "수용",
  rejected: "미수용",
  done: "반영 완료",
};

// 사진 경로 : docs 버킷 suggestions/{의견ID}/{번호}.jpg
export const suggestionPhotoPath = (id: string, stamp: number, i: number) => `suggestions/${id}/${stamp}-${i}.jpg`;

const kstParts = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );

// 게시판 날짜 : 올해는 10-21(화) 16:26, 지난해는 2025-12-09(화) 17:09 / 답변일은 시각 없이
export function boardDate(iso: string, withTime: boolean) {
  const p = kstParts(iso);
  const thisYear = kstParts(new Date().toISOString()).year;
  const day = `${p.year === thisYear ? "" : `${p.year}-`}${p.month}-${p.day}(${p.weekday})`;
  return withTime ? `${day} ${p.hour}:${p.minute}` : day;
}

// 등록일 필터 묶음 (엑셀처럼 월 단위) : 2026년 10월
export const kstMonth = (iso: string) => {
  const p = kstParts(iso);
  return `${p.year}년 ${p.month}월`;
};
