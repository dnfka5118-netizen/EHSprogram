"use client";

import { useTransition } from "react";
import { deleteFinding } from "../../insp/actions";

export function DeleteButton({ findingId, backTo }: { findingId: string; backTo: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("이 지적사항을 삭제할까요? 사진과 이력도 함께 삭제되며 되돌릴 수 없습니다.")) return;
        start(async () => {
          const res = await deleteFinding(findingId, backTo);
          if (res?.error) alert(res.error);
        });
      }}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "삭제 중…" : "삭제"}
    </button>
  );
}
