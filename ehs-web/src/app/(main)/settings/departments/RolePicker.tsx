"use client";

import { useState } from "react";

type P = { id: string; name: string; position: string | null };

// 지정자·승인자 여러 명 : 이름표로 보여 주고 아래 목록에서 추가 (첫 번째 승인자 = 전자결재 "해당 부서장")
export function RolePicker({ name, members, others, initial, firstHint }: {
  name: string;
  members: P[];
  others: P[];
  initial: string[];
  firstHint?: string;
}) {
  const [ids, setIds] = useState<string[]>(initial);
  const all = [...members, ...others];
  const who = (id: string) => all.find((p) => p.id === id);
  const add = (id: string) => id && !ids.includes(id) && setIds([...ids, id]);

  return (
    <div className="space-y-1">
      {ids.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex flex-wrap gap-1">
        {ids.length === 0 && <span className="text-xs text-gray-400">(미지정)</span>}
        {ids.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-900 ring-1 ring-brand-200">
            {who(id)?.name ?? "?"}
            {i === 0 && firstHint && <span className="text-[10px] text-brand-700">({firstHint})</span>}
            <button type="button" onClick={() => setIds(ids.filter((x) => x !== id))} className="text-gray-500 hover:text-red-600" aria-label="빼기">
              ✕
            </button>
          </span>
        ))}
      </div>
      <select value="" onChange={(e) => add(e.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs">
        <option value="">+ 사람 추가</option>
        <optgroup label="소속 (파트 포함)">
          {members.filter((p) => !ids.includes(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.position ?? ""}</option>
          ))}
        </optgroup>
        <optgroup label="기타 인원">
          {others.filter((p) => !ids.includes(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.position ?? ""}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
