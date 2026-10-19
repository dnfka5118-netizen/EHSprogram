"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { openChemCheck } from "../chem-actions";

// 이번 주 점검대장 열기 (없으면 만들고 이동)
export function OpenChemButton({ groupId, label, primary }: { groupId: string; label: string; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await openChemCheck(groupId, null);
          if ("error" in r) return alert(r.error);
          router.push(`/insp/chem/checks/${r.id}`);
        })
      }
      className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${primary ? "bg-brand-800 text-white hover:bg-brand-900" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
    >
      {pending ? "여는 중…" : label}
    </button>
  );
}
