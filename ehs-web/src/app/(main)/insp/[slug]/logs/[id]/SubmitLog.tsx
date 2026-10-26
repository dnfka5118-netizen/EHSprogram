"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { LogReview } from "@/lib/daily-log";
import { cancelLogSubmit, submitLogToHead } from "../../../daily-actions";

const B = "border border-gray-400";
const day = (t: string | null) => (t ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(t)) : "");

// 월간 일지 오른쪽 위 결재란 : 작성(제출한 관리감독자) · 승인(부서장) — 위에 [부서장에게 제출] / 제출 취소
//   부서장은 부서 레포트에서 부서 일지를 한 번에 승인 (0029)
export function SubmitLog({ id, review, heads, canSubmit, canCancel, missed, deadline, reportHref }: {
  id: string;
  review: LogReview | null;
  heads: string[];
  canSubmit: boolean; // 구역 담당 관리감독자 · 관리자
  canCancel: boolean; // 제출한 사람 · 관리자
  missed: number[];
  deadline: string;
  reportHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const status = review?.status ?? "draft";
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, ask: string) => {
    if (!confirm(ask)) return;
    start(async () => {
      const r = await fn();
      if ("error" in r) return alert(r.error);
      router.refresh();
    });
  };
  const warn = missed.length ? `\n\n미점검일 ${missed.length}일(${missed.join(", ")}일)은 일지에 '미점검'으로 남습니다.` : "";

  return (
    <div className="flex max-w-full flex-col items-end gap-1.5">
      {(status === "draft" || status === "rejected") && canSubmit && (
        <Button className="px-4 py-1.5" disabled={pending} onClick={() => run(() => submitLogToHead(id), `부서장(${heads.join(", ") || "미지정"})에게 이 달 일지를 제출할까요?${warn}`)}>
          {pending ? "제출 중…" : status === "rejected" ? "고쳐서 다시 제출" : "부서장에게 제출"}
        </Button>
      )}
      {status === "submitted" && (
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">부서장 승인 대기</span>
          {canCancel && (
            <Button variant="secondary" className="px-3 py-1 text-xs" disabled={pending} onClick={() => run(() => cancelLogSubmit(id), "제출을 취소할까요? (소급 입력 등 고친 뒤 다시 제출)")}>
              제출 취소
            </Button>
          )}
        </div>
      )}
      {status === "approved" && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">부서장 승인 완료</span>}
      <table className="border-collapse text-center">
        <tbody>
          <tr>
            <th rowSpan={2} className={`${B} w-6 bg-gray-100 px-1 [writing-mode:vertical-rl]`}>
              결 재
            </th>
            <th className={`${B} w-24 bg-gray-100 px-1 py-0.5`}>작성</th>
            <th className={`${B} w-24 bg-gray-100 px-1 py-0.5`}>승인(부서장)</th>
          </tr>
          <tr>
            <td className={`${B} h-12 px-1 align-middle`}>
              <div className="font-medium">{status !== "draft" ? review?.submitter : ""}</div>
              <div className="text-[9px] text-gray-500">{status !== "draft" ? day(review?.submitted_at ?? null) : ""}</div>
            </td>
            <td className={`${B} h-12 px-1 align-middle`}>
              {status === "approved" ? (
                <>
                  <div className="font-medium">{review?.approver}</div>
                  <div className="text-[9px] text-gray-500">{day(review?.approved_at ?? null)}</div>
                </>
              ) : (
                <div className={heads.length ? "text-gray-400" : "text-red-600"}>{heads.join(", ") || "부서장 미지정"}</div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {status === "rejected" && review?.reject_reason && (
        <p className="max-w-64 rounded bg-red-50 px-2 py-1 text-[11px] break-keep text-red-700">반려 : {review.reject_reason}</p>
      )}
      {(status === "draft" || status === "rejected") && (
        <p className="text-[10px] text-gray-500">제출 마감 {deadline.replaceAll("-", ".")}(금) · 다음 달 첫째 주 금요일</p>
      )}
      {(status === "draft" || status === "rejected") && missed.length > 0 && (
        <p className="text-[11px] break-keep text-red-700">미점검일 {missed.length}일 — 제출 전에 아래 소급 입력을 확인하세요</p>
      )}
      <a href={reportHref} className="text-[11px] text-brand-700 hover:underline">
        부서 레포트 보기 →
      </a>
    </div>
  );
}
