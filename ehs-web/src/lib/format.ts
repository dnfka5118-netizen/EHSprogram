// 한국 시간 기준 날짜 유틸
export function todayKst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function fmtMonth(value: string): string {
  const [y, m] = value.split("-");
  return `${y.slice(2)}년 ${Number(m)}월`;
}
