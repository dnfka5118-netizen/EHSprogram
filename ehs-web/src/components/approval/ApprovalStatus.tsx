"use client";

import { useState, useTransition } from "react";
import { approveStep, rejectStep, withdrawApproval } from "@/app/(main)/approvals/actions";
import { Button, FormMessage, Textarea } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import type { Approval, ApprovalStep } from "@/lib/approval";

const STEP_STYLE: Record<ApprovalStep["status"], string> = {
  approved: "border-brand-300 bg-white",
  pending: "border-amber-400 bg-amber-50 ring-2 ring-amber-200",
  waiting: "border-gray-200 bg-gray-50 text-gray-500",
  rejected: "border-red-300 bg-red-50",
  skipped: "border-dashed border-gray-200 bg-white text-gray-400",
};

// 결재 칸 (도장 칸 형태) + 내 차례면 승인/반려, 상신자면 상신 취소
export function ApprovalStatus({ approval, meId }: { approval: Approval; meId: string }) {
  const [comment, setComment] = useState("");
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const current = approval.steps.find((s) => s.status === "pending");
  const myTurn = approval.status === "in_review" && current?.approver_id === meId;
  const canWithdraw =
    approval.status === "in_review" &&
    approval.drafter_id === meId &&
    !approval.steps.some((s) => s.status === "approved" && s.approver_id !== approval.drafter_id);

  return (
    <div className="space-y-3">
      {(approval.cc_names?.length || approval.exec_names?.length) ? (
        <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
          {!!approval.cc_names?.length && (
            <div>
              <dt className="inline font-medium text-gray-700">수신및참조 </dt>
              <dd className="inline">{approval.cc_names.join(", ")}</dd>
            </div>
          )}
          {!!approval.exec_names?.length && (
            <div>
              <dt className="inline font-medium text-gray-700">시행자 </dt>
              <dd className="inline">{approval.exec_names.join(", ")}</dd>
            </div>
          )}
        </dl>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {approval.steps.map((s) => (
          <div key={s.id} className={`rounded-md border p-2 text-center ${STEP_STYLE[s.status]}`}>
            <p className="text-xs font-bold text-gray-600">{s.label}</p>
            <p className="mt-1 text-sm font-medium">
              {s.approver_name ?? "-"}
              {s.approver_position && <span className="ml-1 text-xs font-normal text-gray-500">{s.approver_position}</span>}
            </p>
            <p className="mt-1 text-[11px]">
              {s.status === "approved" && <span className="text-emerald-700">✓ {fmtDateTime(s.acted_at)}</span>}
              {s.status === "pending" && <span className="font-medium text-amber-700">결재 차례</span>}
              {s.status === "waiting" && "대기"}
              {s.status === "rejected" && <span className="font-medium text-red-700">반려 {fmtDateTime(s.acted_at)}</span>}
              {s.status === "skipped" && "—"}
            </p>
            {s.comment && <p className="mt-1 text-left text-[11px] whitespace-pre-wrap text-gray-600">“{s.comment}”</p>}
          </div>
        ))}
      </div>

      {myTurn && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">{current?.label} 결재 차례입니다.</p>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="의견 (선택) · 반려 시 사유 필수" />
          <div className="mt-2 flex gap-2">
            <Button disabled={pending} onClick={() => start(async () => setState(await approveStep(approval.id, comment)))}>
              승인
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (!comment.trim()) return setState({ error: "반려 사유를 입력해 주세요." });
                start(async () => setState(await rejectStep(approval.id, comment)));
              }}
            >
              반려
            </Button>
          </div>
        </div>
      )}
      {canWithdraw && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm("상신을 취소할까요? 취소 후 수정해서 다시 상신할 수 있습니다.")) start(async () => setState(await withdrawApproval(approval.id)));
          }}
        >
          상신 취소
        </Button>
      )}
      <FormMessage state={state} />

      {approval.history.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">이전 결재 이력 ({Math.max(...approval.history.map((h) => h.round))}차까지)</summary>
          <ul className="mt-2 space-y-1">
            {approval.history.map((h) => (
              <li key={h.id}>
                {h.round}차 · {h.label} · {h.approver_name} · {h.status === "approved" ? "승인" : h.status === "rejected" ? "반려" : h.status === "skipped" ? "생략" : h.status}
                {h.acted_at && ` · ${fmtDateTime(h.acted_at)}`}
                {h.comment && ` · “${h.comment}”`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
