import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { fmtDate, fmtMonth } from "@/lib/format";
import type { FindingOverview } from "@/lib/types";

export function FindingList({ items, empty = "해당 항목이 없습니다.", showModule }: { items: FindingOverview[]; empty?: string; showModule?: boolean }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <>
      {/* 모바일 : 카드 */}
      <ul className="divide-y divide-gray-100 md:hidden">
        {items.map((f) => (
          <li key={f.id}>
            <Link href={`/findings/${f.id}`} className="block py-3 active:bg-gray-50">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  {showModule && `${f.module_name} · `}
                  {fmtMonth(f.inspection_date)} #{f.seq} · {f.location_name ?? "-"}
                  {f.sub_location_name && ` / ${f.sub_location_name}`}
                </span>
                <StatusBadge status={f.status} overdue={f.is_overdue} />
              </div>
              <p className="line-clamp-2 text-sm text-gray-900">{f.problem}</p>
              <p className="mt-1 text-xs text-gray-500">
                {f.department_name} · {f.assignee_names ?? "담당자 미지정"}
                {f.next_due && ` · 목표 ${fmtDate(f.next_due)}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {/* 데스크톱 : 표 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              {showModule && <th className="px-2 py-2 font-medium">점검</th>}
              <th className="px-2 py-2 font-medium whitespace-nowrap">시행 월</th>
              <th className="px-2 py-2 font-medium">장소</th>
              <th className="px-2 py-2 font-medium">유형</th>
              <th className="px-2 py-2 font-medium">문제점</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">담당부서</th>
              <th className="px-2 py-2 font-medium">담당자</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">다음 목표일</th>
              <th className="px-2 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50">
                {showModule && <td className="px-2 py-2 whitespace-nowrap text-gray-600">{f.module_name}</td>}
                <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                  {fmtMonth(f.inspection_date)} <span className="text-gray-400">#{f.seq}</span>
                </td>
                <td className="px-2 py-2 text-gray-700">
                  {f.location_name ?? "-"}
                  {f.sub_location_name && <span className="block text-xs text-gray-500">{f.sub_location_name}</span>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-gray-600">{f.type_name ?? "-"}</td>
                <td className="max-w-md px-2 py-2">
                  <Link href={`/findings/${f.id}`} className="line-clamp-2 text-gray-900 hover:text-emerald-800 hover:underline">
                    {f.problem}
                  </Link>
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-gray-600">{f.department_name}</td>
                <td className="px-2 py-2 text-gray-600">{f.assignee_names ?? <span className="text-gray-400">미지정</span>}</td>
                <td className={`px-2 py-2 whitespace-nowrap ${f.is_overdue ? "font-medium text-red-600" : "text-gray-600"}`}>
                  {fmtDate(f.next_due)}
                  {f.reschedule_total > 0 && <span className="ml-1 text-xs text-gray-400">(연기 {f.reschedule_total})</span>}
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={f.status} overdue={f.is_overdue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
