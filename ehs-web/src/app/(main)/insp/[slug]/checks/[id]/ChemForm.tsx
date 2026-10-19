"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import { CHEM_RESULTS, type ChemCheck, type ChemResult } from "@/lib/chem";
import { saveChemCheck } from "../../../chem-actions";
import { SUB_REASONS } from "@/lib/daily";

const ON: Record<ChemResult, string> = {
  ok: "border-emerald-600 bg-emerald-600 text-white",
  fixed: "border-amber-500 bg-amber-500 text-white",
  recheck: "border-red-600 bg-red-600 text-white",
};

// 점검대장 작성 : 원본 양식(별지 제42호) 그대로 — 항목 × 이상 유무 3줄 × 점검장소, 비고
//   PC : 양식 표에서 칸을 눌러 체크 · 휴대폰 : 장소를 골라 그 장소의 항목을 한 번에 (현장에서 장소별로 점검)
export function ChemForm({ d, today, substitute }: { d: ChemCheck; today: string; substitute: boolean }) {
  const [subKind, setSubKind] = useState(d.sub_reason ? (SUB_REASONS.find((r) => d.sub_reason!.startsWith(r)) ?? "기타") : "");
  const [subText, setSubText] = useState(d.sub_reason && !SUB_REASONS.some((r) => d.sub_reason === r) ? d.sub_reason.replace(/^(휴가|외근|교육|출장|기타)( · )?/, "") : "");
  const router = useRouter();
  const [date, setDate] = useState(d.check_date);
  const [time, setTime] = useState(d.time_text ?? "");
  const [cells, setCells] = useState<Record<string, ChemResult>>(d.results);
  const [notes, setNotes] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d.notes).map(([k, v]) => [k, v.note ?? ""])));
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [place, setPlace] = useState(d.places[0]?.id ?? "");
  const weekEnd = new Date(Date.parse(d.week_start) + 6 * 86400000).toISOString().slice(0, 10);
  const total = d.items.length * d.places.length;
  const filled = Object.keys(cells).filter((k) => d.items.some((i) => k.startsWith(i.id)) && d.places.some((p) => k.endsWith(p.id))).length;
  const curIdx = d.places.findIndex((p) => p.id === place);
  const cur = d.places[curIdx];
  const next = d.places[curIdx + 1];

  const key = (item: string, pid: string) => `${item}|${pid}`;
  const setCell = (item: string, pid: string, v: ChemResult) => setCells((c) => ({ ...c, [key(item, pid)]: v }));
  const fill = (pids: string[]) =>
    setCells((c) => {
      const n = { ...c };
      for (const i of d.items) for (const p of pids) n[key(i.id, p)] ??= "ok";
      return n;
    });
  const isBad = (item: string) => d.places.some((p) => cells[key(item, p.id)] && cells[key(item, p.id)] !== "ok");
  const noteBox = (item: string, rows: number, className: string) => (
    <Textarea
      rows={rows}
      value={notes[item] ?? ""}
      onChange={(e) => setNotes((n) => ({ ...n, [item]: e.target.value }))}
      placeholder={isBad(item) ? "필수 : 조치한 내용 또는 재점검 필요 사항" : "비고"}
      className={`${className} ${isBad(item) && !notes[item]?.trim() ? "border-red-400" : ""}`}
    />
  );

  function save() {
    setMsg(null);
    if (substitute && !subKind) return setMsg({ error: "대체 점검 사유를 골라 주세요." });
    if (substitute && subKind === "기타" && !subText.trim()) return setMsg({ error: "대체 점검 사유를 적어 주세요." });
    for (const i of d.items) {
      if (isBad(i.id) && !notes[i.id]?.trim()) return setMsg({ error: `${i.code}번 항목의 비고(조치 내용 또는 재점검 필요 사항)를 적어 주세요.` });
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
        substitute ? [subKind, subText.trim()].filter(Boolean).join(" · ") : null,
      );
      if ("error" in r) return setMsg({ error: r.error });
      setMsg({ ok: `저장했습니다.${r.findings ? ` 정밀 재점검 필요 ${r.findings}건을 지적사항(개선 요청)으로 등록했습니다.` : ""} 아래에서 상신해 주세요.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {substitute && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">대체 점검 — 이 점검 단위의 점검자가 아닙니다</p>
          <p className="text-xs break-keep text-amber-800">점검자가 휴가·외근 등으로 없을 때 대신 점검합니다. 점검대장 성명 칸에 &apos;대체 점검&apos; 과 사유가 표시됩니다.</p>
          <div className="flex flex-wrap gap-1.5">
            {SUB_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSubKind(r)}
                className={`rounded-full border px-3 py-1 text-sm ${subKind === r ? "border-amber-600 bg-amber-600 text-white" : "border-amber-300 bg-white"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Input value={subText} onChange={(e) => setSubText(e.target.value)} placeholder={subKind === "기타" ? "사유 (필수)" : "추가 설명 (선택, 예 : 이진혁 대리 휴가)"} className="px-2 py-1.5" />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">점검연월일 ({d.week_start.slice(5).replace("-", ".")} 주)</span>
          <Input type="date" value={date} min={d.week_start} max={weekEnd < today ? weekEnd : today} onChange={(e) => setDate(e.target.value)} className="w-40 px-2 py-1.5" />
        </label>
        <label className="min-w-0 flex-1 basis-40 space-y-1">
          <span className="block text-xs text-gray-500">점검시간</span>
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="예 : 10:00 ~ 11:00" className="px-2 py-1.5" />
        </label>
        <Button variant="secondary" onClick={() => fill(d.places.map((p) => p.id))}>
          남은 칸 모두 문제없음
        </Button>
      </div>

      {/* ---------- PC : 원본 양식 표 (칸을 눌러 체크) ---------- */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th rowSpan={2} className="w-64 border border-gray-300 px-2 py-1.5">
                점검 항목
              </th>
              <th rowSpan={2} className="w-24 border border-gray-300 px-1">
                이상 유무
              </th>
              <th colSpan={d.places.length} className="border border-gray-300 px-1 py-1">
                점검장소
              </th>
              <th rowSpan={2} className="w-48 border border-gray-300 px-1">
                비고
              </th>
            </tr>
            <tr>
              {d.places.map((p) => (
                <th key={p.id} className="min-w-16 border border-gray-300 px-1 py-1 font-medium break-keep">
                  {p.name}
                  <button type="button" onClick={() => fill([p.id])} className="mt-0.5 block w-full text-[10px] font-normal text-emerald-700 hover:underline">
                    모두 문제없음
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.items.map((i) =>
              CHEM_RESULTS.map((r, k) => (
                <tr key={`${i.id}${r.v}`} className={k === 2 ? "border-b-2 border-gray-400" : ""}>
                  {k === 0 && (
                    <td rowSpan={3} className="border border-gray-300 px-2 py-1 align-middle break-keep">
                      <b className="mr-1">{i.code}</b>
                      {i.content}
                    </td>
                  )}
                  <td className="border border-gray-300 px-1 text-center break-keep text-gray-700">{r.label}</td>
                  {d.places.map((p) => {
                    const on = cells[key(i.id, p.id)] === r.v;
                    return (
                      <td key={p.id} className="border border-gray-300 p-0 text-center">
                        <button
                          type="button"
                          onClick={() => setCell(i.id, p.id, r.v)}
                          aria-label={`${i.code} ${p.name} ${r.label}`}
                          className={`h-8 w-full text-sm ${on ? ON[r.v] : "text-gray-300 hover:bg-gray-100"}`}
                        >
                          {on ? "✔" : "□"}
                        </button>
                      </td>
                    );
                  })}
                  {k === 0 && (
                    <td rowSpan={3} className="border border-gray-300 p-1 align-top">
                      {noteBox(i.id, 4, "px-1.5 py-1 text-xs")}
                    </td>
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- 휴대폰 : 장소를 골라 그 장소의 항목을 한 번에 ---------- */}
      <div className="space-y-3 lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
          {d.places.map((p) => {
            const n = d.items.filter((i) => cells[key(i.id, p.id)]).length;
            const done = n === d.items.length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlace(p.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                  place === p.id ? "border-brand-800 bg-brand-800 text-white" : done ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white"
                }`}
              >
                {done ? "✓ " : ""}
                {p.name}
                {!done && n > 0 ? ` ${n}/${d.items.length}` : ""}
              </button>
            );
          })}
        </div>
        {cur && (
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
              <b className="min-w-0 flex-1 text-sm break-keep">📍 {cur.name}</b>
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => fill([cur.id])}>
                이 장소 모두 문제없음
              </Button>
            </div>
            <ul className="divide-y divide-gray-100">
              {d.items.map((i) => {
                const v = cells[key(i.id, cur.id)];
                return (
                  <li key={i.id} className="space-y-1.5 px-3 py-2">
                    <p className="text-sm break-keep">
                      <b className="mr-1">{i.code}</b>
                      {i.content}
                    </p>
                    <span className="grid grid-cols-3 gap-1">
                      {CHEM_RESULTS.map((r) => (
                        <button
                          key={r.v}
                          type="button"
                          onClick={() => setCell(i.id, cur.id, r.v)}
                          className={`rounded-md border px-1 py-1.5 text-xs break-keep ${v === r.v ? ON[r.v] : "border-gray-300 bg-white text-gray-700"}`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </span>
                    {(isBad(i.id) || notes[i.id]) && noteBox(i.id, 2, "px-2 py-1.5 text-sm")}
                  </li>
                );
              })}
            </ul>
            {next && (
              <div className="border-t border-gray-100 px-3 py-2 text-right">
                <Button
                  variant="secondary"
                  className="text-sm"
                  onClick={() => {
                    setPlace(next.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  다음 장소 : {next.name} →
                </Button>
              </div>
            )}
          </section>
        )}
        <p className="text-xs break-keep text-gray-500">비고는 원본 양식처럼 항목마다 1칸이고, 모든 장소에 공통입니다. 어느 장소의 일인지 비고에 적어 주세요.</p>
      </div>

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
