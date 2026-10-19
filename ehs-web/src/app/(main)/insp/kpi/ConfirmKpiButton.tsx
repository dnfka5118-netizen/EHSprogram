"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Button, Input, SubmitButton } from "@/components/ui";
import { confirmKpi } from "./actions";

// 관리자 : 지난해 지표를 지금 데이터로 다시 확정 (늦게 종결된 건 반영 등)
export function ConfirmKpiButton({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        다시 확정
      </Button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-3 sm:max-w-md sm:rounded-xl sm:p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{year}년 지표 다시 확정</h3>
        <p className="mt-1 text-sm break-keep text-gray-600">지금 데이터로 {year}년 지표를 다시 계산해 확정합니다. 이전 확정본은 기록으로 남습니다.</p>
        <ActionForm action={confirmKpi.bind(null, year)} className="mt-3 space-y-2">
          <Input name="note" placeholder="사유 (예 : 12월 종결 건 반영)" className="w-full" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <SubmitButton>확정</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
