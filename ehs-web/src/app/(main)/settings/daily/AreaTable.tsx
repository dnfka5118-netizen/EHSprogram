"use client";

import { Fragment, useState } from "react";
import { ScrollX } from "@/components/ScrollX";
import { AreaEditor } from "./AreaEditor";
import type { Member } from "@/components/MemberPicker";
import type { ActionState } from "@/lib/types";
import type { DailyArea, DailyForm } from "@/lib/daily";

export type AreaRow = DailyArea & { dept: string; where: string; who: string; memberIds: string[]; pointIds: string[]; noPoint: boolean };

// 관리감독자 담당 Area 표 : 부서 · 담당 장소 · 관리감독자 · 양식 → [수정] 누르면 그 아래에서 고침
export function AreaTable({
  rows,
  ...common
}: {
  rows: AreaRow[];
  forms: DailyForm[];
  departments: { id: string; name: string }[];
  points: { id: string; name: string }[];
  people: Member[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const th = "border-b border-gray-200 px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-gray-500";
  return (
    <ScrollX>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th className={th}>부서</th>
            <th className={th}>담당 장소 (지역)</th>
            <th className={th}>관리감독자</th>
            <th className={th}>양식</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr className={`border-b border-gray-100 align-top ${open === r.id ? "bg-brand-50/60" : "hover:bg-gray-50"} ${r.is_active ? "" : "text-gray-400"}`}>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.dept || "-"}</td>
                <td className="px-2 py-1.5 break-keep">{r.noPoint ? <span className="text-red-600">담당 장소 QR 없음</span> : r.where}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.who || <span className="text-red-600">없음</span>}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-900">{r.form_code}형</span>
                  {!r.is_active && <span className="ml-1 text-xs">(사용 안 함)</span>}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs whitespace-nowrap text-gray-700 hover:bg-gray-50"
                  >
                    {open === r.id ? "닫기" : "✎ 수정"}
                  </button>
                </td>
              </tr>
              {open === r.id && (
                <tr className="border-b border-gray-200 bg-brand-50/30">
                  <td colSpan={5} className="px-3 py-3">
                    <AreaEditor area={r} memberIds={r.memberIds} pointIds={r.pointIds} {...common} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                아직 등록된 담당 Area 가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ScrollX>
  );
}
