"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { MEASURE_KINDS, MEASURE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { FindingRow } from "@/lib/finding-rows";

const short = (d: string) => d.slice(2).replaceAll("-", ".");

// 현황표 : 행 어디를 눌러도 상세로 이동, "미완료" 를 누르면 미완료 이유 팝업
export function FindingTable({ rows, showModule, empty = "해당 항목이 없습니다." }: { rows: FindingRow[]; showModule?: boolean; empty?: string }) {
  const router = useRouter();
  const [popup, setPopup] = useState<FindingRow | null>(null);

  const open = (e: MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) window.open(`/findings/${id}`, "_blank");
    else router.push(`/findings/${id}`);
  };
  const showReason = (e: MouseEvent, r: FindingRow) => {
    e.stopPropagation();
    setPopup(r);
  };

  if (rows.length === 0) return <p className="py-8 text-center text-sm text-gray-500">{empty}</p>;

  return (
    <>
      {/* ---------- 모바일 : 카드 ---------- */}
      <ul className="divide-y divide-gray-100 lg:hidden">
        {rows.map((r) => (
          <li key={r.id} onClick={(e) => open(e, r.id)} className="flex cursor-pointer gap-3 py-3 active:bg-gray-50">
            <Thumb url={r.thumb} className="h-20 w-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {showModule && <b className="font-medium text-gray-700">{r.module_name} · </b>}
                  {fmtDate(r.inspection_date)} · {r.location_name ?? "-"}
                  {r.sub_location_name && ` / ${r.sub_location_name}`}
                  {r.type_name && ` · ${r.type_name}`}
                </p>
                <DoneChip row={r} onReason={showReason} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-900">{r.problem}</p>
              <p className="mt-1 text-xs text-gray-500">
                {r.department_name} · {r.assignee_names ?? "담당자 미지정"}
              </p>
              <Schedule row={r} className="mt-1 text-xs" inline />
            </div>
          </li>
        ))}
      </ul>

      {/* ---------- PC : 표 ---------- */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1400px] border-collapse text-xs">
          <thead className="bg-brand-50 text-gray-700">
            <tr>
              {showModule && <Th rowSpan={2}>점검</Th>}
              <Th rowSpan={2}>시행일자</Th>
              <Th rowSpan={2}>장소</Th>
              <Th rowSpan={2}>세부장소</Th>
              <Th rowSpan={2}>유형</Th>
              <Th rowSpan={2} className="min-w-52">문제점</Th>
              <Th rowSpan={2}>개선 전 사진</Th>
              <Th colSpan={3}>개선 계획</Th>
              <Th rowSpan={2}>개선 목표일정</Th>
              <Th rowSpan={2}>조치 담당부서</Th>
              <Th rowSpan={2}>조치 담당자</Th>
              <Th rowSpan={2}>완료여부</Th>
            </tr>
            <tr>
              <Th className="min-w-40">즉시조치</Th>
              <Th className="min-w-40">단기대책</Th>
              <Th className="min-w-40">장기대책</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={(e) => open(e, r.id)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/findings/${r.id}`)}
                tabIndex={0}
                className="cursor-pointer align-top hover:bg-brand-50/60 focus:bg-brand-50/60 focus:outline-none"
              >
                {showModule && <Td className="whitespace-nowrap">{r.module_name}</Td>}
                <Td className="whitespace-nowrap">{fmtDate(r.inspection_date)}</Td>
                <Td>{r.location_name ?? "-"}</Td>
                <Td>{r.sub_location_name ?? "-"}</Td>
                <Td className="whitespace-nowrap">{r.type_name ?? "-"}</Td>
                <Td>
                  <span className="line-clamp-4 whitespace-pre-wrap">{r.problem}</span>
                </Td>
                <Td>
                  <Thumb url={r.thumb} className="h-20 w-24" />
                </Td>
                {MEASURE_KINDS.map((k) => (
                  <Td key={k}>
                    {r.measures[k] ? (
                      <span className={`line-clamp-4 whitespace-pre-wrap ${r.measures[k]!.done ? "text-gray-500" : ""}`}>
                        {r.measures[k]!.done && <span className="mr-1 text-emerald-700">✔</span>}
                        {r.measures[k]!.content}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </Td>
                ))}
                <Td className="whitespace-nowrap">
                  <Schedule row={r} />
                </Td>
                <Td className="whitespace-nowrap">{r.department_name}</Td>
                <Td>{r.assignee_names ?? <span className="text-gray-400">미지정</span>}</Td>
                <Td className="text-center">
                  <DoneChip row={r} onReason={showReason} stacked />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popup && <ReasonPopup row={popup} onClose={() => setPopup(null)} />}
    </>
  );
}

function Th({ children, className = "", ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...rest} className={`border border-gray-200 px-2 py-2 font-medium whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-gray-200 px-2 py-2 ${className}`}>{children}</td>;
}

function Thumb({ url, className }: { url: string | null; className: string }) {
  if (!url) return <div className={`${className} flex items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400`}>사진 없음</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="개선 전" loading="lazy" className={`${className} rounded object-cover`} />;
}

function Schedule({ row, className = "", inline }: { row: FindingRow; className?: string; inline?: boolean }) {
  const kinds = MEASURE_KINDS.filter((k) => row.measures[k]);
  if (kinds.length === 0) return <span className={`text-gray-400 ${className}`}>{inline ? "" : "-"}</span>;
  return (
    <div className={`${inline ? "flex flex-wrap gap-x-3" : "space-y-0.5"} ${className}`}>
      {kinds.map((k) => {
        const m = row.measures[k]!;
        return (
          <div key={k} className={m.done ? "text-gray-400" : m.late ? "font-medium text-red-600" : "text-gray-700"}>
            <span className="text-gray-500">{MEASURE_LABEL[k].slice(0, 2)}</span> {short(m.target)}
            {m.changes.length > 0 && <span className="ml-0.5 text-[10px] text-red-500">(변경 {m.changes.length})</span>}
            {m.done && " ✔"}
          </div>
        );
      })}
    </div>
  );
}

function DoneChip({ row, onReason, stacked }: { row: FindingRow; onReason: (e: MouseEvent, r: FindingRow) => void; stacked?: boolean }) {
  if (row.status === "closed")
    return <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-emerald-800">완료</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${stacked ? "flex-col" : ""}`}>
      <button
        type="button"
        onClick={(e) => onReason(e, row)}
        className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap underline-offset-2 hover:underline ${
          row.is_overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
        }`}
        title="미완료 이유 보기"
      >
        미완료{row.is_overdue && " · 기한초과"}
      </button>
      <span className="text-[10px] whitespace-nowrap text-gray-500">{STATUS_LABEL[row.status]}</span>
    </span>
  );
}

function ReasonPopup({ row, onClose }: { row: FindingRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">미완료 이유 및 진행현황</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {row.module_name} · {fmtDate(row.inspection_date)} · {row.location_name ?? "-"}
              {row.sub_location_name && ` / ${row.sub_location_name}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="mb-3 rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800">{row.problem}</p>
        <p className="mb-3 text-sm">
          <span className="text-gray-500">현재 단계 </span>
          <b className="font-medium">{STATUS_LABEL[row.status]}</b>
          {row.next_due && (
            <span className={row.is_overdue ? "text-red-600" : "text-gray-600"}> · 다음 목표일 {fmtDate(row.next_due)}</span>
          )}
        </p>
        {row.progress.length === 0 ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            {row.status === "assign_wait"
              ? "아직 조치담당자가 지정되지 않았습니다."
              : row.status === "plan_wait"
                ? "조치담당자가 아직 조치계획을 등록하지 않았습니다."
                : row.status === "approval_wait"
                  ? "조치 완료 보고 후 부서장 승인을 기다리고 있습니다."
                  : "등록된 미완료 사유가 없습니다."}
          </p>
        ) : (
          <ul className="space-y-2">
            {row.progress.map((p, i) => (
              <li key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="mb-1 text-xs text-amber-800">
                  {fmtDateTime(p.at)}
                  {p.by && ` · ${p.by}`}
                  {i === 0 && <span className="ml-1 rounded bg-amber-600 px-1 text-white">최근</span>}
                </p>
                {p.reason !== "기존 엑셀 기록" && (
                  <p className="whitespace-pre-wrap text-gray-800">
                    <b className="font-medium">미완료 이유</b> {p.reason}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-gray-800">
                  <b className="font-medium">진행현황</b> {p.progress}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            닫기
          </button>
          <Link href={`/findings/${row.id}`} className="rounded-md bg-brand-800 px-3 py-2 text-sm text-white">
            상세 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
