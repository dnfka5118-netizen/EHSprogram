"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import { CHEM_RESULTS, type ChemCheck, type ChemResult } from "@/lib/chem";
import { saveChemCheck } from "../../../chem-actions";

const ON: Record<ChemResult, string> = {
  ok: "border-emerald-600 bg-emerald-600 text-white",
  fixed: "border-amber-500 bg-amber-500 text-white",
  recheck: "border-red-600 bg-red-600 text-white",
};

// 점검대장 작성 : 점검일 · 시간 · 항목별 장소마다 문제없음/조치완료/재점검 · 비고
export function ChemForm({ d, today }: { d: ChemCheck; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(d.check_date);
  const [time, setTime] = useState(d.time_text ?? "");
  const [cells, setCells] = useState<Record<string, ChemResult>>(d.results);
  const [notes, setNotes] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d.notes).map(([k, v]) => [k, v.note ?? ""])));
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const weekEnd = new Date(Date.parse(d.week_start) + 6 * 86400000).toISOString().slice(0, 10);
  const total = d.items.length * d.places.length;
  const filled = Object.keys(cells).filter((k) => d.items.some((i) => k.startsWith(i.id)) && d.places.some((p) => k.endsWith(p.id))).length;

  const setCell = (item: string, place: string, v: ChemResult) => setCells((c) => ({ ...c, [`${item}|${place}`]: v }));
  const allOk = () =>
    setCells((c) => {
      const n = { ...c };
      for (const i of d.items) for (const p of d.places) n[`${i.id}|${p.id}`] ??= "ok";
      return n;
    });

  function save() {
    setMsg(null);
    for (const i of d.items) {
      const bad = d.places.some((p) => cells[`${i.id}|${p.id}`] && cells[`${i.id}|${p.id}`] !== "ok");
      if (bad && !notes[i.id]?.trim()) return setMsg({ error: `${i.code}번 항목의 비고(조치 내용 또는 재점검 필요 사항)를 적어 주세요.` });
    }
    if (filled < total) return setMsg({ error: `표시하지 않은 칸이 ${total - filled}개 있습니다. 문제없으면 [남은 칸 모두 문제없음] 을 누르세요.` });
    start(async () => {
      const r = await saveChemCheck(
        d.id,
        date,
        time,
        Object.entries(cells).map(([k, result]) => {
          const [item_id, place_id] = k.split("|");
          return { item_id, place_id, result };
        }),
        Object.entries(notes).map(([item_id, note]) => ({ item_id, note })),
      );
      if ("error" in r) return setMsg({ error: r.error });
      setMsg({ ok: `저장했습니다.${r.findings ? ` 정밀 재점검 필요 ${r.findings}건을 지적사항(개선 요청)으로 등록했습니다.` : ""} 아래에서 상신해 주세요.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">점검일 ({d.week_start.slice(5).replace("-", ".")} 주)</span>
          <Input type="date" value={date} min={d.week_start} max={weekEnd < today ? weekEnd : today} onChange={(e) => setDate(e.target.value)} className="w-40 px-2 py-1.5" />
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1">
          <span className="block text-xs text-gray-500">점검시간</span>
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="예 : 10:00 ~ 11:00" className="px-2 py-1.5" />
        </label>
        <Button variant="secondary" onClick={allOk}>
          남은 칸 모두 문제없음
        </Button>
      </div>

      {d.items.map((i) => {
        const bad = d.places.some((p) => cells[`${i.id}|${p.id}`] && cells[`${i.id}|${p.id}`] !== "ok");
        return (
          <section key={i.id} className="rounded-lg border border-gray-200 bg-white">
            <p className="border-b border-gray-100 px-3 py-2 text-sm break-keep">
              <b className="mr-1">{i.code}</b>
              {i.content}
            </p>
            <ul className="divide-y divide-gray-50">
              {d.places.map((p) => {
                const v = cells[`${i.id}|${p.id}`];
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5">
                    <span className="min-w-0 flex-1 basis-32 text-sm break-keep text-gray-700">{p.name}</span>
                    <span className="grid grid-cols-3 gap-1">
                      {CHEM_RESULTS.map((r) => (
                        <button
                          key={r.v}
                          type="button"
                          onClick={() => setCell(i.id, p.id, r.v)}
                          className={`rounded-md border px-2 py-1 text-xs whitespace-nowrap ${v === r.v ? ON[r.v] : "border-gray-300 bg-white text-gray-700"}`}
                        >
                          {r.short}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-100 px-3 py-2">
              <Textarea
                rows={1}
                value={notes[i.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
                placeholder={bad ? "비고 (필수) : 조치한 내용 또는 재점검 필요 사항" : "비고 (선택, 예 : 해당 없음)"}
                className={`px-2 py-1.5 text-sm ${bad && !notes[i.id]?.trim() ? "border-red-400" : ""}`}
              />
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 z-20 -mx-3 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        {msg && <p className={`mb-1 rounded-md px-3 py-1.5 text-sm break-keep ${msg.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{msg.error ?? msg.ok}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">
            표시 <b className={filled === total ? "text-emerald-700" : "text-red-600"}>{filled}</b> / {total}
          </span>
          <Button className="ml-auto px-6" disabled={pending} onClick={save}>
            {pending ? "저장 중…" : "점검 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
