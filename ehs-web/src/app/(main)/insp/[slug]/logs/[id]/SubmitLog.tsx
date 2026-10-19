"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApprovalLineEditor, finalizeLine } from "@/components/approval/ApprovalLineEditor";
import { Button } from "@/components/ui";
import type { LineStep } from "@/lib/approval-line";
import type { Person } from "@/lib/approval";
import { submitDailyLog } from "../../../daily-actions";

// 월간 일지 상신 : 양식별 기본 결재선(환경설정)을 바꿔서 상신 가능
export function SubmitLog({ id, initialLine, people, meId }: { id: string; initialLine: LineStep[]; people: Person[]; meId: string }) {
  const router = useRouter();
  const [line, setLine] = useState<LineStep[]>(initialLine);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <ApprovalLineEditor value={line} onChange={setLine} people={people} meId={meId} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          const fin = finalizeLine(line, meId);
          if (fin.error) return setError(fin.error);
          if (!confirm("이 달 일지를 상신할까요?")) return;
          start(async () => {
            const r = await submitDailyLog(id, fin.steps!);
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
