"use client";

import { useState, useTransition } from "react";
import { adminChangeApprover, adminRejectApproval, searchEmployees } from "@/app/(main)/approvals/actions";
import { Button, FormMessage, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import type { Approval } from "@/lib/approval";

type Emp = { id: string; name: string; position: string | null; dept: string | null };

// 관리자 : 결재자가 퇴사·장기 부재일 때 결재자 바꾸기 / 관리자 반려 (진행 중 결재만)
export function AdminApprovalTools({ approval }: { approval: Approval }) {
  const open = approval.steps.filter((s) => s.status === "pending" || s.status === "waiting");
  const [step, setStep] = useState(open[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [list, setList] = useState<Emp[]>([]);
  const [pick, setPick] = useState<Emp | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  if (approval.status !== "in_review" || open.length === 0) return null;

  return (
    <details className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-gray-700">관리자 : 결재자 변경 · 반려 (퇴사 · 장기 부재 시)</summary>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Select value={step} onChange={(e) => setStep(e.target.value)} className="w-full px-2 py-1.5 text-sm sm:w-56" aria-label="바꿀 결재 단계">
            {open.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.approver_name ?? "-"}
                {s.status === "pending" ? " (결재 차례)" : ""}
              </option>
            ))}
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                start(async () => setList(await searchEmployees(q)));
              }
            }}
            placeholder="새 결재자 이름 검색 후 Enter"
            className="min-w-0 flex-1 px-2 py-1.5 text-sm"
          />
          <Button variant="secondary" className="text-sm" onClick={() => start(async () => setList(await searchEmployees(q)))}>
            검색
          </Button>
        </div>
        {list.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPick(p)}
                className={`rounded-full border px-2.5 py-1 text-xs ${pick?.id === p.id ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
              >
                {p.name} {p.position ?? ""} <span className="opacity-70">{p.dept ?? ""}</span>
              </button>
            ))}
          </div>
        )}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (필수, 예 : 퇴사 · 장기 출장)" className="px-2 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !pick}
            className="text-sm"
            onClick={() => {
              if (!pick) return;
              if (!confirm(`${pick.name} 님으로 결재자를 바꿀까요?`)) return;
              start(async () => setState(await adminChangeApprover(step, pick.id, reason)));
            }}
          >
            결재자 변경
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            className="text-sm"
            onClick={() => {
              if (!confirm("이 결재를 관리자 권한으로 반려할까요? 상신자가 결재선을 고쳐 다시 상신합니다.")) return;
              start(async () => setState(await adminRejectApproval(approval.id, reason)));
            }}
          >
            관리자 반려
          </Button>
        </div>
        <FormMessage state={state} />
      </div>
    </details>
  );
}
