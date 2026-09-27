"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deletePermit } from "../actions";
import type { PermitStatus } from "@/lib/permit";

const BTN = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50";

export function PermitToolbar({ id, status, canDelete, canCopy, hasTbm }: { id: string; status: PermitStatus; canDelete: boolean; canCopy: boolean; hasTbm: boolean }) {
  const [pending, start] = useTransition();
  const live = status === "issued" || status === "completed";
  return (
    <span className="flex flex-wrap gap-2">
      <Link href={`/print/permit/${id}`} target="_blank" className={BTN}>
        🖶 {live ? "출력" : "인쇄 미리보기"}
      </Link>
      {live && (
        <Link href={`/permit/${id}/tbm`} className={hasTbm ? BTN : "rounded-md bg-brand-800 px-3 py-1.5 text-sm text-white"}>
          {hasTbm ? "✓ TBM 기록" : "📋 TBM 실시"}
        </Link>
      )}
      {canCopy && (
        <Link href={`/permit/new?from=${id}`} className={BTN} title="이 허가서를 기초 자료로 새 신청서 작성 (결재·서명은 새로)">
          📋 복사해서 새로 작성
        </Link>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          onClick={() => {
            if (!confirm("이 허가서를 삭제할까요? 되돌릴 수 없습니다.")) return;
            start(async () => {
              const res = await deletePermit(id);
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
