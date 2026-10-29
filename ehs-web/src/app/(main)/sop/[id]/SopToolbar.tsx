"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteSop, reviseSop } from "../actions";

const BTN = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50";

// 인쇄 · 개정 · 삭제
export function SopToolbar({ id, canDelete, canRevise }: { id: string; canDelete: boolean; canRevise: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap gap-2">
      <Link href={`/print/sop/${id}`} target="_blank" className={BTN}>
        🖶 인쇄 미리보기
      </Link>
      {canRevise && (
        <button
          type="button"
          disabled={pending}
          className={BTN}
          title="이 절차서를 복사해 Rev.+1 로 고쳐 쓰고 다시 결재 (지금 Rev. 은 그대로 보관)"
          onClick={() => {
            if (!confirm("이 절차서를 개정할까요? 내용을 복사한 Rev.+1 문서가 만들어집니다.")) return;
            start(async () => {
              const res = await reviseSop(id);
              if (res?.error) alert(res.error);
            });
          }}
        >
          {pending ? "개정 중…" : "✏️ 개정"}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          onClick={() => {
            if (!confirm("이 절차서를 삭제할까요? 사진도 함께 지워지며 되돌릴 수 없습니다.")) return;
            start(async () => {
              const res = await deleteSop(id);
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
