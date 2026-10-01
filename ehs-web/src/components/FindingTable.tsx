"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type MouseEvent } from "react";
import { approveFinding, approveFindings, assignFinding, getAssignOptions, rejectFinding, selfAssignFinding } from "@/app/(main)/findings/actions";
import { MEASURE_KINDS, MEASURE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { fmtDate, fmtDateTime, todayKst } from "@/lib/format";
import type { FindingRow } from "@/lib/finding-rows";
import { MemberPicker } from "@/components/MemberPicker";
import { PlanForm } from "@/app/(main)/findings/[id]/PlanForm";
import { ReportForm } from "@/app/(main)/findings/[id]/ReportForm";

const short = (d: string) => d.slice(2).replaceAll("-", ".");

// 현황표 : 행 어디를 눌러도 상세로 이동, "미완료" → 미완료 이유 팝업, 조치 담당자 칸 "담당자 지정" → 지정 팝업, 개선 계획 칸 "조치계획 작성" → 계획 팝업
// bulkApprove : 승인할 수 있는 행에 체크 칸 + "선택 일괄 승인" (내 할 일의 종결 승인 필요)
export function FindingTable({ rows, showModule, bulkApprove, empty = "해당 항목이 없습니다." }: { rows: FindingRow[]; showModule?: boolean; bulkApprove?: boolean; empty?: string }) {
  const router = useRouter();
  const approvable = bulkApprove ? rows.filter((r) => r.canApprove).map((r) => r.id) : [];
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkMsg, setBulkMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const sel = picked.filter((id) => approvable.includes(id)); // 승인되어 사라진 행은 자동으로 빠짐
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allOn = approvable.length > 0 && sel.length === approvable.length;
  const bulk = () =>
    startBulk(async () => {
      const res = await approveFindings(sel);
      setBulkMsg(res?.error ? { text: res.error } : { ok: true, text: res?.message ?? "" });
      setPicked([]);
      router.refresh();
    });
  const Check = ({ id }: { id: string }) =>
    approvable.includes(id) ? (
      <input
        type="checkbox"
        checked={sel.includes(id)}
        onChange={() => toggle(id)}
        onClick={(e) => e.stopPropagation()}
        className="h-5 w-5 cursor-pointer accent-brand-800"
        aria-label="선택"
      />
    ) : null;
  const [popup, setPopup] = useState<FindingRow | null>(null);
  const [assign, setAssign] = useState<FindingRow | null>(null);
  const closeAssign = useCallback(() => setAssign(null), []);
  const [plan, setPlan] = useState<FindingRow | null>(null);
  const closePlan = useCallback(() => setPlan(null), []);
  const [report, setReport] = useState<FindingRow | null>(null);
  const closeReport = useCallback(() => setReport(null), []);
  const [reject, setReject] = useState<FindingRow | null>(null);
  const closeReject = useCallback(() => setReject(null), []);
  const showReject = (e: MouseEvent, r: FindingRow) => {
    e.stopPropagation();
    setReject(r);
  };
  const showReport = (e: MouseEvent, r: FindingRow) => {
    e.stopPropagation();
    setReport(r);
  };
  const showPlan = (e: MouseEvent, r: FindingRow) => {
    e.stopPropagation();
    setPlan(r);
  };
  const showAssign = (e: MouseEvent, r: FindingRow) => {
    e.stopPropagation();
    setAssign(r);
  };

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
      {approvable.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-violet-50 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() => setPicked(allOn ? [] : approvable)}
              className="h-5 w-5 cursor-pointer accent-brand-800"
            />
            전체 선택
          </label>
          <span className="text-sm text-gray-600">{sel.length}건 선택</span>
          <button
            type="button"
            disabled={bulkPending || sel.length === 0}
            onClick={bulk}
            className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {bulkPending ? "승인 중…" : `선택 ${sel.length}건 일괄 승인`}
          </button>
          {bulkMsg && <p className={`w-full text-sm ${bulkMsg.ok ? "text-emerald-700" : "text-red-700"}`}>{bulkMsg.text}</p>}
        </div>
      )}
      {/* ---------- 모바일 : 카드 ---------- */}
      <ul className="divide-y divide-gray-100 lg:hidden">
        {rows.map((r) => (
          <li key={r.id} onClick={(e) => open(e, r.id)} className="flex cursor-pointer gap-3 py-3 active:bg-gray-50">
            {approvable.length > 0 && (
              <div className="flex w-6 shrink-0 items-center justify-center">
                <Check id={r.id} />
              </div>
            )}
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
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>
                  {r.department_name} · {r.assignees.length ? r.assignees.map((a) => a.name + (a.self ? "(자진 담당)" : "")).join(", ") : "담당자 미지정"}
                </span>
                <AssignButton row={r} onClick={showAssign} />
                <SelfAssignButton row={r} />
                <ApproveButtons row={r} onReject={showReject} />
                {r.canPlan && <PlanButton row={r} onClick={showPlan} />}
                {r.canReport && <ReportButton row={r} onClick={showReport} />}
              </div>
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
              {approvable.length > 0 && <Th rowSpan={2}>선택</Th>}
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
                {approvable.length > 0 && (
                  <Td className="text-center align-middle">
                    <Check id={r.id} />
                  </Td>
                )}
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
                {r.canPlan ? (
                  // 조치계획을 작성할 차례 : 즉시조치·단기대책·장기대책 칸을 합쳐 작성 버튼
                  <Td colSpan={3} className="text-center align-middle">
                    <PlanButton row={r} onClick={showPlan} />
                  </Td>
                ) : (
                  MEASURE_KINDS.map((k) => (
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
                  ))
                )}
                <Td className="whitespace-nowrap">
                  <Schedule row={r} />
                </Td>
                <Td className="whitespace-nowrap">{r.department_name}</Td>
                <Td>
                  <Assignees row={r} />
                  <div className="mt-1 flex flex-col items-start gap-1">
                    <AssignButton row={r} onClick={showAssign} />
                    <SelfAssignButton row={r} />
                  </div>
                </Td>
                <Td className="text-center">
                  <DoneChip row={r} onReason={showReason} stacked />
                  {r.canReport && (
                    <div className="mt-1.5">
                      <ReportButton row={r} onClick={showReport} />
                    </div>
                  )}
                  {r.canApprove && (
                    <div className="mt-1.5">
                      <ApproveButtons row={r} onReject={showReject} />
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popup && <ReasonPopup row={popup} onClose={() => setPopup(null)} />}
      {assign && <AssignPopup row={assign} onClose={closeAssign} />}
      {plan && <PlanPopup row={plan} onClose={closePlan} />}
      {report && <ReportPopup row={report} onClose={closeReport} />}
      {reject && <RejectPopup row={reject} onClose={closeReject} />}
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

function Td({ children, className = "", colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border border-gray-200 px-2 py-2 ${className}`}>{children}</td>;
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

// 완료여부 칸 : 조치담당자가 결과를 보고할 차례일 때
function ReportButton({ row, onClick }: { row: FindingRow; onClick: (e: MouseEvent, r: FindingRow) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, row)}
      className="rounded-md bg-brand-800 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white hover:bg-brand-900"
    >
      완료 여부 처리
    </button>
  );
}

// 현황표에서 바로 조치결과 보고 (완료 → 개선 후 사진 / 미완료 → 새 목표일·미완료 이유·진행현황) — 상세 화면과 같은 입력 화면
function ReportPopup({ row, onClose }: { row: FindingRow; onClose: () => void }) {
  const router = useRouter();
  const [today] = useState(todayKst);
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">완료 여부 처리</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {row.module_name} · {fmtDate(row.inspection_date)} · {row.location_name ?? "-"}
              {row.sub_location_name && ` / ${row.sub_location_name}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="mb-3 flex gap-3 rounded-md bg-gray-50 p-3">
          <Thumb url={row.thumb} className="h-16 w-16 shrink-0" />
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-gray-800">{row.problem}</p>
        </div>
        <ReportForm
          findingId={row.id}
          measures={row.measureList}
          today={today}
          hasAfterPhotos={row.afterUrls.length > 0}
          onDone={() => {
            router.refresh();
            onClose();
          }}
        />
      </div>
    </div>
  );
}

// 조치 담당자 칸 : 이름 (자진 담당 표시)
function Assignees({ row }: { row: FindingRow }) {
  if (row.assignees.length === 0) return <span className="text-gray-400">미지정</span>;
  return (
    <span className="space-y-0.5">
      {row.assignees.map((a) => (
        <span key={a.name} className="block whitespace-nowrap">
          {a.name}
          {a.self && <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-800">자진 담당</span>}
        </span>
      ))}
    </span>
  );
}

// 조치 요청 부서 직원이 스스로 담당자가 되기
function SelfAssignButton({ row }: { row: FindingRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!row.canSelfAssign) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        if (!confirm("이 지적사항의 조치담당자로 직접 나서시겠습니까?\n(담당자 이름 옆에 '자진 담당'으로 표시됩니다)")) return;
        start(async () => {
          const r = await selfAssignFinding(row.id);
          if (r?.error) alert(r.error);
          router.refresh();
        });
      }}
      className="rounded-md border border-sky-600 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-sky-700 hover:bg-sky-50 disabled:opacity-50"
    >
      {pending ? "처리 중…" : "내가 담당하기"}
    </button>
  );
}

// 완료여부 칸 : 승인 대기일 때 부서 승인자에게 [승인] [반려]
function ApproveButtons({ row, onReject }: { row: FindingRow; onReject: (e: MouseEvent, r: FindingRow) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!row.canApprove) return null;
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          start(async () => {
            const r = await approveFinding(row.id, "");
            if (r?.error) alert(r.error);
            router.refresh();
          });
        }}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "…" : "승인"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => onReject(e, row)}
        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white hover:bg-red-700 disabled:opacity-50"
      >
        반려
      </button>
    </span>
  );
}

// 반려 사유 입력 창
function RejectPopup({ row, onClose }: { row: FindingRow; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    if (!reason.trim()) return setError("반려 사유를 입력해 주세요.");
    start(async () => {
      const r = await rejectFinding(row.id, reason);
      if (r?.error) return setError(r.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full rounded-t-xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">반려</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {row.module_name} · {fmtDate(row.inspection_date)} · {row.location_name ?? "-"} · 담당 {row.assignee_names ?? "-"}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <Thumb url={row.thumb} className="h-16 w-16 shrink-0" />
          {row.afterUrls[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.afterUrls[0]} alt="개선 후" className="h-16 w-16 shrink-0 rounded object-cover ring-2 ring-emerald-500" />
          )}
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-gray-800">{row.problem}</p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          반려 사유 <span className="text-red-600">*</span>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="조치담당자에게 전달됩니다. 무엇을 다시 해야 하는지 적어 주세요."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-700 focus:outline-none"
          />
        </label>
        {error && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <p className="mt-2 text-xs text-gray-500">반려하면 조치 중 단계로 되돌아가고 조치담당자에게 메일이 갑니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            취소
          </button>
          <button onClick={submit} disabled={pending} className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {pending ? "처리 중…" : "반려"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 조치 담당자 칸 : 미지정이면 "담당자 지정" 버튼, 지정돼 있으면 작은 "변경" (지정 권한자에게만)
function AssignButton({ row, onClick }: { row: FindingRow; onClick: (e: MouseEvent, r: FindingRow) => void }) {
  if (!row.canAssign) return null;
  if (!row.assignee_names)
    return (
      <button
        type="button"
        onClick={(e) => onClick(e, row)}
        className="rounded-md bg-brand-800 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white hover:bg-brand-900"
      >
        담당자 지정
      </button>
    );
  return (
    <button type="button" onClick={(e) => onClick(e, row)} className="text-[11px] whitespace-nowrap text-brand-800 underline-offset-2 hover:underline">
      담당자 변경
    </button>
  );
}

// 개선 계획 칸 : 조치담당자가 계획을 세울 차례일 때
function PlanButton({ row, onClick }: { row: FindingRow; onClick: (e: MouseEvent, r: FindingRow) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, row)}
      className="rounded-md bg-brand-800 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-brand-900"
    >
      조치계획 작성
    </button>
  );
}

// 현황표에서 바로 조치계획(즉시조치·단기대책·장기대책 + 목표일) 작성 — 상세 화면과 같은 입력 화면
function PlanPopup({ row, onClose }: { row: FindingRow; onClose: () => void }) {
  const router = useRouter();
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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">조치계획 작성</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {row.module_name} · {fmtDate(row.inspection_date)} · {row.location_name ?? "-"}
              {row.sub_location_name && ` / ${row.sub_location_name}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="mb-3 flex gap-3 rounded-md bg-gray-50 p-3">
          <Thumb url={row.thumb} className="h-16 w-16 shrink-0" />
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-gray-800">{row.problem}</p>
        </div>
        <PlanForm
          findingId={row.id}
          measures={[]}
          mode="create"
          onDone={() => {
            router.refresh();
            onClose();
          }}
        />
      </div>
    </div>
  );
}

// 현황표에서 바로 조치담당자 지정/변경 (상세 화면의 지정 패널과 같은 DB 함수 사용)
function AssignPopup({ row, onClose }: { row: FindingRow; onClose: () => void }) {
  const router = useRouter();
  const [members, setMembers] = useState<{ id: string; name: string; position: string | null }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getAssignOptions(row.id, row.request_department_id).then((o) => {
      if (!alive) return;
      setMembers(o.members);
      setPicked(o.selected);
      setInitial(o.selected);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [row.id, row.request_department_id, onClose]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = () =>
    start(async () => {
      const r = await assignFinding(row.id, picked);
      if (r?.error) return setError(r.error);
      router.refresh();
      onClose();
    });
  const changed = picked.length > 0 && (picked.length !== initial.length || picked.some((x) => !initial.includes(x)));

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
            <h3 className="font-semibold text-gray-900">{row.status === "assign_wait" ? "조치담당자 지정" : "조치담당자 변경"}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {row.module_name} · {fmtDate(row.inspection_date)} · {row.department_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="mb-3 line-clamp-3 rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800">{row.problem}</p>
        {members === null ? (
          <p className="py-4 text-center text-sm text-gray-500">부서 구성원을 불러오는 중…</p>
        ) : (
          <MemberPicker members={members} picked={picked} onToggle={toggle} />
        )}
        <p className="mt-2 text-xs text-gray-500">여러 명을 지정할 수 있습니다.</p>
        {error && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            닫기
          </button>
          <button
            onClick={save}
            disabled={pending || !changed}
            className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {pending ? "저장 중…" : row.status === "assign_wait" ? "담당자 지정" : "담당자 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}
