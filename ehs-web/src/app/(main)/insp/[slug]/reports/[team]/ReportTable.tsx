"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import type { ReportRow, TeamReport } from "@/lib/daily-report";
import { approveLogs, rejectLog } from "../../../daily-actions";

const STATUS: Record<string, [string, string]> = {
  draft: ["미제출", "text-gray-500"],
  submitted: ["승인 대기", "font-semibold text-amber-700"],
  approved: ["승인", "text-emerald-700"],
  rejected: ["반려", "text-red-600"],
  in_review: ["전자결재 중", "text-amber-700"],
};
const statusOf = (r: ReportRow) => (r.legacy === "approved" ? "approved" : r.legacy === "in_review" ? "in_review" : (r.review?.status ?? "draft"));
const pctText = (v: number | null) => (v === null ? "-" : `${v}%`);
const TH = "border border-gray-200 px-2 py-2 font-medium";
const TD = "border border-gray-200 px-2 py-2 text-center";

// 부서 월간 레포트 표 : 관리감독자(구역)별 한 줄 + 합계 · 부서장은 제출된 일지를 골라 한 번에 승인 / 일지별 반려
export function ReportTable({ report, canApprove }: { report: TeamReport; canApprove: boolean }) {
  const router = useRouter();
  const pending = report.rows.filter((r) => statusOf(r) === "submitted" && r.logId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(pending.map((r) => r.logId!)));
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const t = report.totals;

  const approve = () => {
    const ids = [...picked].filter((id) => pending.some((r) => r.logId === id));
    if (!ids.length) return;
    if (!confirm(`선택한 일지 ${ids.length}건을 승인할까요?`)) return;
    start(async () => {
      const r = await approveLogs(ids);
      if ("error" in r) return setMsg(r.error);
      setMsg(`${r.n ?? ids.length}건 승인했습니다.`);
      router.refresh();
    });
  };
  const reject = (row: ReportRow) => {
    const reason = prompt(`${row.areaName} 일지를 반려합니다. 사유를 입력하세요 (관리감독자에게 전달됩니다).`);
    if (!reason?.trim()) return;
    start(async () => {
      const r = await rejectLog(row.logId!, reason);
      if ("error" in r) return setMsg(r.error);
      setMsg(`${row.areaName} 일지를 반려했습니다.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {canApprove && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-200 bg-brand-50/50 px-3 py-2">
          <span className="text-sm">
            승인 대기 <b className="text-amber-700">{pending.length}</b>건 {pending.length > 0 && <span className="text-gray-500">· 선택 {[...picked].length}건</span>}
          </span>
          <Button className="ml-auto px-4 py-1.5" disabled={busy || picked.size === 0 || pending.length === 0} onClick={approve}>
            {busy ? "처리 중…" : `선택 일지 일괄 승인`}
          </Button>
        </div>
      )}
      {msg && <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">{msg}</p>}
      <ScrollX>
        <table className="w-full min-w-[1000px] border-collapse bg-white text-sm">
          <thead className="bg-brand-50 text-xs text-gray-700">
            <tr>
              {canApprove && <th rowSpan={2} className={`${TH} w-10`}>선택</th>}
              <th rowSpan={2} className={TH}>구역 (양식)</th>
              <th rowSpan={2} className={TH}>관리감독자</th>
              <th rowSpan={2} className={TH}>제출</th>
              <th colSpan={4} className={TH}>점검 실시 (해당 월)</th>
              <th colSpan={1} className={TH}>해당 월</th>
              <th colSpan={4} className={TH}>당해년도 조치</th>
              <th rowSpan={2} className={TH}>일지</th>
            </tr>
            <tr>
              <th className={TH}>실시율</th>
              <th className={TH}>제때</th>
              <th className={TH}>소급</th>
              <th className={TH}>미점검</th>
              <th className={TH}>조치발굴</th>
              <th className={TH}>조치발굴</th>
              <th className={TH}>조치완료</th>
              <th className={TH}>개선조치율</th>
              <th className={TH}>기한 초과</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => {
              const st = statusOf(r);
              const [label, cls] = STATUS[st];
              return (
                <tr key={r.areaId} className="align-middle">
                  {canApprove && (
                    <td className={TD}>
                      {st === "submitted" && r.logId && (
                        <input
                          type="checkbox"
                          aria-label={`${r.areaName} 선택`}
                          checked={picked.has(r.logId)}
                          onChange={() =>
                            setPicked((p) => {
                              const n = new Set(p);
                              if (n.has(r.logId!)) n.delete(r.logId!);
                              else n.add(r.logId!);
                              return n;
                            })
                          }
                        />
                      )}
                    </td>
                  )}
                  <td className="border border-gray-200 px-2 py-2">
                    {r.areaName} <span className="text-xs text-gray-500">{r.formCode}형</span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2">{r.members.join(", ") || "-"}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className={cls}>{label}</span>
                    {st === "submitted" && r.review?.submitted_at && <span className="block text-[11px] text-gray-500">{r.review.submitted_at.slice(5, 10).replace("-", ".")}</span>}
                    {canApprove && st === "submitted" && (
                      <button type="button" disabled={busy} onClick={() => reject(r)} className="mt-0.5 block w-full text-[11px] text-red-600 underline">
                        반려
                      </button>
                    )}
                    {st === "rejected" && r.review?.reject_reason && <span className="block max-w-32 text-[11px] break-keep text-red-500">{r.review.reject_reason}</span>}
                  </td>
                  <td className={`${TD} font-semibold ${r.rate !== null && r.rate < 90 ? "text-red-600" : ""}`}>{pctText(r.rate)}</td>
                  <td className={TD}>{r.onTime}</td>
                  <td className={TD}>{r.backfill || "-"}</td>
                  <td className={`${TD} ${r.missed ? "text-red-600" : ""}`}>{r.missed || "-"}</td>
                  <td className={TD}>{r.found}</td>
                  <td className={TD}>{r.foundYear}</td>
                  <td className={TD}>{r.closedYear}</td>
                  <td className={`${TD} font-semibold`}>{pctText(r.yearRate)}</td>
                  <td className={`${TD} ${r.overdue ? "font-semibold text-red-600" : ""}`}>{r.overdue || "-"}</td>
                  <td className={TD}>
                    {r.logId ? (
                      <Link href={`/insp/daily/logs/${r.logId}`} className="text-brand-700 hover:underline">
                        보기
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">미작성</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-medium">
              {canApprove && <td className={TD} />}
              <td className="border border-gray-200 px-2 py-2" colSpan={3}>
                부서 합계 ({report.rows.length}개 구역)
              </td>
              <td className={TD}>{pctText(t.rate)}</td>
              <td className={TD}>{t.onTime}</td>
              <td className={TD}>{t.backfill}</td>
              <td className={TD}>{t.missed}</td>
              <td className={TD}>{t.found}</td>
              <td className={TD}>{t.foundYear}</td>
              <td className={TD}>{t.closedYear}</td>
              <td className={TD}>{pctText(t.yearRate)}</td>
              <td className={TD}>{t.overdue}</td>
              <td className={TD} />
            </tr>
          </tbody>
        </table>
      </ScrollX>
    </div>
  );
}
