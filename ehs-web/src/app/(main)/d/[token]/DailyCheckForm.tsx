"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { VoiceButton } from "@/components/VoiceButton";
import { Button, Select, Textarea } from "@/components/ui";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import type { ProcessedPhoto } from "@/lib/image";
import { CYCLE_LABEL, RESULT_HINT, RESULT_LABEL, type DailyOpen, type DailyOpenItem, type DailyResult } from "@/lib/daily";
import { fmtDate } from "@/lib/format";
import { submitDailyCheck } from "../../insp/daily-actions";

type Entry = {
  result: DailyResult | null;
  note: string;
  action: "immediate" | "request" | null;
  dept: string;
  photos: ProcessedPhoto[];
  after: ProcessedPhoto[];
  fix: string;
  key: string; // 새 지적사항 ID (사진 경로)
};

const RESULTS: { v: DailyResult; cls: string; on: string }[] = [
  { v: "O", cls: "text-emerald-700", on: "border-emerald-600 bg-emerald-600 text-white" },
  { v: "X", cls: "text-red-600", on: "border-red-600 bg-red-600 text-white" },
  { v: "△", cls: "text-amber-600", on: "border-amber-500 bg-amber-500 text-white" },
  { v: "-", cls: "text-gray-500", on: "border-gray-500 bg-gray-500 text-white" },
];

// QR 점검 : 항목마다 O / X / △ / - · X 는 사진 + 즉시 조치(개선 전·후) 또는 개선 요청(부서 지정)
export function DailyCheckForm({ token, data, departments, scannedAt }: { token: string; data: DailyOpen; departments: { id: string; name: string }[]; scannedAt: string }) {
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      data.items.map((i) => [
        i.id,
        { result: i.result, note: i.note ?? "", action: i.action, dept: data.area.department_id ?? "", photos: [], after: [], fix: "", key: crypto.randomUUID() },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const due = data.items.filter((i) => !i.done_on);
  const doneBefore = data.items.filter((i) => i.done_on);
  const answered = due.filter((i) => entries[i.id].result).length;
  const groups: { category: string; items: DailyOpenItem[] }[] = [];
  for (const i of due) {
    const last = groups[groups.length - 1];
    if (last && last.category === i.category) last.items.push(i);
    else groups.push({ category: i.category, items: [i] });
  }

  const patch = (id: string, p: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...p } }));

  function check(): string | null {
    for (const i of data.items) {
      const e = entries[i.id];
      if (!e.result) {
        if (!i.done_on) return `${i.code} 항목을 판정해 주세요.`;
        continue;
      }
      if ((e.result === "X" || e.result === "△") && !e.note.trim()) return `${i.code} 의 내용을 적어 주세요.`;
      if (e.result === "X" && !i.finding_id) {
        if (e.photos.length === 0) return `${i.code} 의 개선 전 사진을 찍어 주세요.`;
        if (!e.action) return `${i.code} 의 처리 방법(즉시 조치 / 개선 요청)을 골라 주세요.`;
        if (e.action === "immediate" && !e.fix.trim()) return `${i.code} 의 즉시 조치 내용을 적어 주세요.`;
        if (e.action === "immediate" && e.after.length === 0) return `${i.code} 의 개선 후 사진을 찍어 주세요.`;
        if (!e.dept) return `${i.code} 의 부서를 골라 주세요.`;
      }
    }
    return null;
  }

  function submit() {
    setError(null);
    const err = check();
    if (err) return setError(err);
    start(async () => {
      const uploaded: string[] = [];
      try {
        const results = [];
        for (const i of data.items) {
          const e = entries[i.id];
          if (!e.result) continue;
          const r: Record<string, unknown> = { item_id: i.id, result: e.result, note: e.note };
          if (e.result === "X" && !i.finding_id) {
            const photos = await uploadPhotos(e.key, "before", e.photos);
            uploaded.push(...photos);
            const after = e.action === "immediate" ? await uploadPhotos(e.key, "after", e.after) : [];
            uploaded.push(...after);
            r.action = e.action;
            r.finding = { id: e.key, department_id: e.dept, photos, after_photos: after, fix: e.fix };
          }
          results.push(r);
        }
        const res = await submitDailyCheck(token, results, scannedAt);
        if ("error" in res) {
          await removePhotos(uploaded);
          return setError(res.error);
        }
        setDone(res.findings);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        await removePhotos(uploaded);
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (done !== null) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="text-base font-bold">✓ 오늘 점검을 저장했습니다.</p>
        <p className="mt-1 break-keep">
          {done > 0 ? `부적합 ${done}건을 지적사항으로 등록했습니다. 즉시 조치한 건은 부서장 확인을, 개선 요청한 건은 해당 부서의 담당자 지정을 기다립니다.` : "부적합 없이 점검을 마쳤습니다."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/insp/daily" className="rounded-md bg-brand-800 px-3 py-2 text-white">
            일일점검 현황
          </Link>
          <button type="button" onClick={() => location.reload()} className="rounded-md border border-emerald-300 bg-white px-3 py-2">
            저장한 내용 다시 보기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <p className="min-w-0 flex-1 text-xs break-keep text-gray-600">{RESULT_HINT}</p>
        <Button
          variant="secondary"
          className="text-sm"
          onClick={() => setEntries((all) => Object.fromEntries(Object.entries(all).map(([id, e]) => [id, data.items.find((i) => i.id === id)?.done_on || e.result ? e : { ...e, result: "O" }])))}
        >
          남은 항목 모두 O
        </Button>
      </div>

      {groups.map((g) => (
        <section key={g.category} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <h2 className="bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-900">{g.category}</h2>
          <ul className="divide-y divide-gray-100">
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} e={entries[i.id]} onPatch={(p) => patch(i.id, p)} departments={departments} />
            ))}
          </ul>
        </section>
      ))}

      {doneBefore.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-sm text-gray-600">이번 주·이번 달에 이미 점검한 항목 {doneBefore.length}개 (다시 점검하려면 펼치기)</summary>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {doneBefore.map((i) => (
              <ItemRow key={i.id} item={i} e={entries[i.id]} onPatch={(p) => patch(i.id, p)} departments={departments} />
            ))}
          </ul>
        </details>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 backdrop-blur lg:left-[var(--sidebar-w)]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
          {error && <p className="w-full rounded-md bg-red-50 px-3 py-1.5 text-sm break-keep text-red-700">{error}</p>}
          <span className="text-sm text-gray-600">
            판정 <b className={answered === due.length ? "text-emerald-700" : "text-red-600"}>{answered}</b> / {due.length}
          </span>
          <Button className="ml-auto px-6 py-2.5" disabled={pending} onClick={submit}>
            {pending ? "저장 중…" : "점검 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item: i, e, onPatch, departments }: { item: DailyOpenItem; e: Entry; onPatch: (p: Partial<Entry>) => void; departments: { id: string; name: string }[] }) {
  const locked = !!i.finding_id; // 이미 지적사항이 된 항목
  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex gap-2">
        <span className="shrink-0 pt-0.5 font-mono text-xs text-gray-500">{i.code}</span>
        <p className="min-w-0 flex-1 text-sm break-keep whitespace-pre-line">
          {i.content}
          {(i.cycle !== "D" || i.cycle_note) && (
            <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[11px] whitespace-nowrap text-violet-800">
              {CYCLE_LABEL[i.cycle]}
              {i.cycle_note ? ` · ${i.cycle_note}` : ""}
            </span>
          )}
          {i.done_on && <span className="ml-1 text-[11px] whitespace-nowrap text-emerald-700">✓ {fmtDate(i.done_on)} 점검함</span>}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {RESULTS.map((r) => (
          <button
            key={r.v}
            type="button"
            disabled={locked && r.v !== "X"}
            onClick={() => onPatch({ result: i.done_on && e.result === r.v ? null : r.v })}
            className={`rounded-md border py-1.5 text-sm font-semibold disabled:opacity-30 ${e.result === r.v ? r.on : `border-gray-300 bg-white ${r.cls}`}`}
          >
            {r.v} <span className="text-[11px] font-normal">{RESULT_LABEL[r.v]}</span>
          </button>
        ))}
      </div>

      {(e.result === "X" || e.result === "△") && (
        <div className="relative">
          <VoiceButton className="absolute top-1 right-1 z-10" value={e.note} onChange={(note) => onPatch({ note })} />
          <Textarea
            rows={2}
            value={e.note}
            onChange={(ev) => onPatch({ note: ev.target.value })}
            placeholder={e.result === "X" ? "부적합 내용 (🎤 말로 입력 가능)" : "이벤트 내용 (아차사고, 수검, 신규 위험요인 등)"}
            className="pr-12"
          />
        </div>
      )}

      {e.result === "X" && locked && (
        <Link href={`/findings/${i.finding_id}`} className="inline-block text-sm text-brand-700 hover:underline">
          지적사항으로 등록됨 ({i.action === "immediate" ? "즉시 조치" : "개선 요청"}) →
        </Link>
      )}

      {e.result === "X" && !locked && (
        <div className="space-y-2 rounded-md bg-red-50/60 p-2">
          <p className="text-xs font-medium text-red-800">개선 전 사진</p>
          <PhotoPicker photos={e.photos} onChange={(photos) => onPatch({ photos })} />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onPatch({ action: "immediate" })}
              className={`rounded-md border px-2 py-2 text-sm break-keep ${e.action === "immediate" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
            >
              🔧 즉시 조치
              <span className="block text-[11px] opacity-80">지금 고침 → 부서장 확인</span>
            </button>
            <button
              type="button"
              onClick={() => onPatch({ action: "request" })}
              className={`rounded-md border px-2 py-2 text-sm break-keep ${e.action === "request" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
            >
              📨 개선 요청
              <span className="block text-[11px] opacity-80">부서 지정 → 담당자·계획</span>
            </button>
          </div>
          {e.action === "immediate" && (
            <>
              <Textarea rows={2} value={e.fix} onChange={(ev) => onPatch({ fix: ev.target.value })} placeholder="조치 내용 (예 : 볼트 재체결, 정리정돈)" />
              <p className="text-xs font-medium text-red-800">개선 후 사진</p>
              <PhotoPicker photos={e.after} onChange={(after) => onPatch({ after })} />
            </>
          )}
          {e.action && (
            <label className="block text-sm">
              <span className="text-xs font-medium text-red-800">{e.action === "request" ? "개선 부서 (조치담당자 지정)" : "확인 부서 (부서장이 종결 확인)"}</span>
              <Select value={e.dept} onChange={(ev) => onPatch({ dept: ev.target.value })} className="mt-1 w-full">
                <option value="">선택</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
    </li>
  );
}
