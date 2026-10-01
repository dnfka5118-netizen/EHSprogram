"use client";

import { useState, useTransition } from "react";
import { selfAssignFinding } from "../actions";
import { FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";

// 자진 담당 : 조치 요청 부서 직원이 스스로 조치담당자가 됨
export function SelfAssignButton({ findingId }: { findingId: string }) {
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
      <p className="text-sm text-sky-900">우리 부서로 요청된 건입니다. 내 업무라면 직접 조치담당자로 나설 수 있습니다.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("이 지적사항의 조치담당자로 직접 나서시겠습니까?\n(담당자 이름 옆에 '자진 담당'으로 표시됩니다)")) return;
          start(async () => setState(await selfAssignFinding(findingId)));
        }}
        className="rounded-md border border-sky-600 bg-white px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
      >
        {pending ? "처리 중…" : "내가 담당하기"}
      </button>
      <div className="w-full empty:hidden">
        <FormMessage state={state} />
      </div>
    </div>
  );
}
