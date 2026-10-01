"use client";

import { useMemo, useState } from "react";
import { sortByRank } from "@/lib/rank";

export type Member = { id: string; name: string; position: string | null };

// 조치담당자 선택 : 직위 순(부장 → 사원) 정렬 + 이름·직위 검색, 여러 명 선택
export function MemberPicker({ members, picked, onToggle }: { members: Member[]; picked: string[]; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => sortByRank(members), [members]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? sorted.filter((m) => m.name.toLowerCase().includes(k) || m.position?.toLowerCase().includes(k)) : sorted;
  }, [sorted, q]);

  if (members.length === 0) return <p className="text-sm text-gray-500">이 부서에 등록된 사용자가 없습니다. 환경설정에서 사용자의 부서를 지정해 주세요.</p>;

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`이름 · 직위로 검색 (${members.length}명)`}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-700 focus:outline-none"
      />
      <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
        {list.length === 0 && <p className="w-full py-2 text-center text-sm text-gray-500">검색 결과가 없습니다.</p>}
        {list.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              picked.includes(m.id) ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {m.name}
            {m.position && <span className="ml-1 text-xs opacity-75">{m.position}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
