import Link from "next/link";
import { ymLabel } from "@/lib/daily";

const shift = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

// ‹ 2026년 10월 › (이번 달까지)
export function MonthNav({ ym, max, href }: { ym: string; max: string; href: (ym: string) => string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={href(shift(ym, -1))} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="이전 달">
        ‹
      </Link>
      <b className="text-base">{ymLabel(`${ym}-01`)}</b>
      {ym < max && (
        <Link href={href(shift(ym, 1))} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="다음 달">
          ›
        </Link>
      )}
    </div>
  );
}

// 기본 달 : 지난달 (제출 · 승인은 달이 끝난 뒤)
export const prevMonth = (today: string) => shift(today.slice(0, 7), -1);
export const readYm = (v: unknown, today: string) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) && v <= today.slice(0, 7) ? v : prevMonth(today));
