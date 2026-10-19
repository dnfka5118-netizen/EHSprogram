"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApprovalLineEditor, finalizeLine } from "@/components/approval/ApprovalLineEditor";
import { Button } from "@/components/ui";
import type { LineStep } from "@/lib/approval-line";
import type { Person } from "@/lib/approval";
import { submitChemCheck } from "../../../chem-actions";

// 점검대장 상신 : 점검자 → EHS부서장 → 해당 부서장 (같은 사람이 이어지면 한 번만 — EHS팀 자체 점검)
export function ChemSubmit({ id, initialLine, people, meId, disabled }: { id: string; initialLine: LineStep[]; people: Person[]; meId: string; disabled?: boolean }) {
  const router = useRouter();
  const [line, setLine] = useState<LineStep[]>(() => initialLine.filter((s, i, a) => !s.approver_id || a.findIndex((x) => x.approver_id === s.approver_id) === i));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ApprovalLineEditor value={line} onChange={setLine} people={people} meId={meId} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm break-keep text-red-700">{error}</p>}
      {disabled && <p className="text-sm text-gray-500">점검 내용을 먼저 저장해 주세요.</p>}
      <Button
        disabled={pending || disabled}
        onClick={() => {
          setError(null);
          const fin = finalizeLine(line, meId);
          if (fin.error) return setError(fin.error);
          if (!confirm("점검대장을 상신할까요? 상신하면 결재가 끝날 때까지 고칠 수 없습니다.")) return;
          start(async () => {
            const r = await submitChemCheck(id, fin.steps!);
            if ("error" in r) return setError(r.error);
            router.refresh();
          });
        }}
      >
        {pending ? "상신 중…" : "상신"}
      </Button>
    </div>
  );
}
