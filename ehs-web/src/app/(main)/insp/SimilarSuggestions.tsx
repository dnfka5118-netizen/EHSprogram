"use client";

import { useEffect, useState } from "react";
import { findSimilar, type Suggestion } from "@/lib/similar";
import type { FindingType } from "@/lib/types";

// 사진을 찍으면 비슷한 과거 지적을 보여 주고, 누르면 유형·문제점을 채운다 (자동 입력 아님 — 고르는 방식)
export function SimilarSuggestions({ photo, location, types, onPick }: {
  photo: Blob | null;
  location?: string;
  types: FindingType[];
  onPick: (patch: { typeId?: string; problem: string }) => void;
}) {
  const [state, setState] = useState<{ photo: Blob | null; status: string; items: Suggestion[]; error?: string }>({ photo: null, status: "", items: [] });

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    const set = (s: Partial<typeof state>) => alive && setState((p) => ({ ...p, ...s, photo }));
    set({ status: "준비 중…", items: [], error: undefined });
    findSimilar(photo, { location, onProgress: (m) => set({ status: m }) })
      .then((items) => set({ items, status: "" }))
      .catch((e: Error) => set({ status: "", error: e.message }));
    return () => {
      alive = false;
    };
    // 같은 사진이면 장소를 바꿔도 다시 찾지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  if (!photo || state.photo !== photo) return null;
  const typeId = (name: string | null) => (name ? types.find((t) => t.name.replace(/\s/g, "") === name.replace(/\s/g, ""))?.id : undefined);

  return (
    <div className="rounded-md border border-brand-200 bg-brand-50/50 p-3">
      <p className="mb-2 text-sm font-medium text-brand-900">
        비슷한 과거 지적 <span className="text-xs font-normal text-gray-500">— 누르면 유형·문제점이 채워집니다 (고쳐서 쓰셔도 됩니다)</span>
      </p>
      {state.error ? (
        <p className="text-xs text-gray-500">추천을 불러오지 못했습니다 ({state.error}). 직접 입력해 주세요.</p>
      ) : state.status ? (
        <p className="animate-pulse text-xs text-gray-600">{state.status}</p>
      ) : state.items.length === 0 ? (
        <p className="text-xs text-gray-500">비슷한 과거 사례가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {state.items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick({ typeId: typeId(s.type_name), problem: s.problem })}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-700"
              >
                <span className="mr-1.5 inline-block rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-800">{s.type_name || "유형 없음"}</span>
                <span className="text-gray-900">{s.problem}</span>
                {(s.location || s.sub_location) && (
                  <span className="mt-0.5 block text-[11px] text-gray-500">
                    과거 장소 : {[s.location, s.sub_location].filter(Boolean).join(" / ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
