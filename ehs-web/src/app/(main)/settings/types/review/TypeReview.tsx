"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { ambiguousGroups, type ReviewExample, type ReviewGroup } from "@/lib/type-suggest";
import { reviewExampleTypes } from "../../actions";

export function TypeReview({ types }: { types: string[] }) {
  const [groups, setGroups] = useState<ReviewGroup[] | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const list: ReviewExample[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("finding_examples")
          .select("id, type_name, problem, type_checked")
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        list.push(...((data ?? []) as ReviewExample[]));
        if (!data || data.length < 1000) break;
      }
      // 화면이 먼저 그려지도록 계산은 다음 차례에
      await new Promise((r) => setTimeout(r, 30));
      setGroups(ambiguousGroups(list, types));
    })().catch((e: Error) => setError(e.message));
  }, [types]);

  if (error) return <p className="text-sm text-red-600">불러오지 못했습니다 ({error})</p>;
  if (!groups) return <p className="animate-pulse text-sm text-gray-600">과거 사례를 비교하는 중… (10초 정도 걸릴 수 있습니다)</p>;

  const total = groups.length + done;
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-brand-900">
        정리할 묶음 {groups.length}개 {done > 0 && <span className="text-gray-500">· 이번에 {done}개 정리 (전체 {total}개)</span>}
      </p>
      {msg && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}
      {groups.length === 0 && <p className="text-sm text-gray-600">애매한 묶음이 없습니다. 모두 정리되었습니다.</p>}
      {groups.slice(0, 5).map((g) => (
        <GroupCard
          key={g.items[0].id}
          group={g}
          types={types}
          onDone={(m) => {
            setGroups((p) => p?.filter((x) => x !== g) ?? null);
            setDone((d) => d + 1);
            setMsg(m);
          }}
        />
      ))}
      {groups.length > 5 && <p className="text-xs text-gray-500">한 번에 5묶음씩 보여 줍니다. 위 묶음을 정리하면 다음 묶음이 나옵니다.</p>}
    </div>
  );
}

function GroupCard({ group, types, onDone }: { group: ReviewGroup; types: string[]; onDone: (msg: string) => void }) {
  const [type, setType] = useState(group.counts[0][0]);
  const [checked, setChecked] = useState(() => new Set(group.items.map((e) => e.id)));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (ids: number[], keep: number[], t: string | null) =>
    start(async () => {
      setError("");
      const r = await reviewExampleTypes(ids, keep, t);
      if (r?.error) setError(r.error);
      else onDone(r?.message ?? "");
    });
  const apply = () => {
    const ids = group.items.filter((e) => checked.has(e.id)).map((e) => e.id);
    run(ids, group.items.filter((e) => !checked.has(e.id)).map((e) => e.id), type);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-2 text-sm">
        <b>{group.items.length}건</b>
        <span className="ml-1 text-gray-600">
          · 지금 유형 : {group.counts.map(([n, c]) => `${n} ${c}`).join(" · ")}
        </span>
      </p>
      <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
        {group.items.map((e) => (
          <li key={e.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 shrink-0"
                checked={checked.has(e.id)}
                onChange={() =>
                  setChecked((p) => {
                    const n = new Set(p);
                    if (n.has(e.id)) n.delete(e.id);
                    else n.add(e.id);
                    return n;
                  })
                }
              />
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  e.type_name === type ? "bg-brand-100 text-brand-800" : "bg-orange-100 text-orange-800"
                }`}
              >
                {e.type_name || "없음"}
              </span>
              <span className="min-w-0 break-words text-gray-900">{e.problem}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mb-1 text-xs text-gray-500">맞는 유형</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              type === t ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || checked.size === 0} onClick={apply}>
          체크한 {checked.size}건을 &lsquo;{type}&rsquo;(으)로
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => run([], group.items.map((e) => e.id), null)}>
          모두 그대로 두기
        </Button>
      </div>
    </div>
  );
}
