"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteJsa } from "../actions";
import { fmtDateTime } from "@/lib/format";
import type { JsaForm } from "@/lib/jsa";
import type { Approval } from "@/lib/approval";

const BTN = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50";

// 인쇄 · 엑셀 · 복사해서 새로 작성 · 삭제
export function JsaToolbar({ id, evalNo, form, departmentName, canDelete, approval }: {
  id: string;
  evalNo: string;
  form: JsaForm;
  departmentName: string;
  canDelete: boolean;
  approval: Approval | null;
}) {
  const [pending, start] = useTransition();
  const stamps = Object.fromEntries(
    (approval?.steps ?? [])
      .filter((s) => s.status === "approved")
      .map((s) => [s.step_kind, `${s.approver_name ?? ""}\n${fmtDateTime(s.acted_at)}`]),
  );
  return (
    <span className="flex flex-wrap gap-2">
      <Link href={`/print/risk-adhoc/${id}`} target="_blank" className={BTN}>
        🖶 인쇄 미리보기
      </Link>
      <button
        type="button"
        className={BTN}
        onClick={async () => {
          const { exportJsaExcel } = await import("@/lib/jsa-excel");
          await exportJsaExcel(form, { evalNo, departmentName, stamps });
        }}
      >
        📤 엑셀
      </button>
      <Link href={`/risk/adhoc/new?from=${id}`} className={BTN} title="이 평가서를 기초 자료로 새 평가서 작성 (결재는 새로)">
        📋 복사해서 새로 작성
      </Link>
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          onClick={() => {
            if (!confirm("이 평가서를 삭제할까요? 되돌릴 수 없습니다.")) return;
            start(async () => {
              const res = await deleteJsa(id);
              if (res?.error) alert(res.error);
            });
          }}
        >
          삭제
        </button>
      )}
    </span>
  );
}
