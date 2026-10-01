"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui";

export type Person = { id: string; name: string; position: string | null; dept: string | null };

const label = (p: Person) => `${p.name}${p.position ? ` ${p.position}` : ""}${p.dept ? `(${p.dept})` : ""}`;

// 점검 참여자 : 등록된 사용자 중에서 검색·선택 + 미등록 인원 직접 입력 → inspectors 한 줄 문자열로 저장
export function ParticipantPicker({ people, name }: { people: Person[]; name: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState("");

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return people;
    return people.filter((p) => [p.name, p.position, p.dept].some((v) => v?.toLowerCase().includes(k)));
  }, [people, q]);

  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const value = [...picked.map((id) => label(byId.get(id)!)), ...extra.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)].join(", ");

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-gray-700">
        점검 참여자
        <span className="ml-2 text-xs font-normal text-gray-500">등록된 사용자에서 검색해 선택 (여러 명 가능)</span>
      </span>
      <input type="hidden" name={name} value={value} />

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-800 px-3 py-1 text-sm text-white"
              title="빼기"
            >
              {label(byId.get(id)!)} <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-md border border-gray-300">
        <div className="border-b border-gray-200 p-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="이름 · 부서 · 직위로 검색"
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-brand-700 focus:bg-white focus:outline-none"
          />
        </div>
        <ul className="max-h-60 overflow-y-auto py-1">
          {list.length === 0 && <li className="px-3 py-3 text-center text-sm text-gray-500">검색 결과가 없습니다.</li>}
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 ${on ? "bg-brand-50" : ""}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      on ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300"
                    }`}
                  >
                    {on && "✓"}
                  </span>
                  <span className="font-medium text-gray-900">{p.name}</span>
                  {p.position && <span className="text-gray-500">{p.position}</span>}
                  <span className="ml-auto text-xs text-gray-500">{p.dept ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-gray-200 px-3 py-1.5 text-xs text-gray-500">
          {q ? `검색 ${list.length}명 / ` : ""}전체 {people.length}명 · 선택 {picked.length}명
        </p>
      </div>

      <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="등록되지 않은 참여자는 직접 입력 (쉼표로 구분, 예: 외부 컨설턴트 홍길동)" />
    </div>
  );
}
