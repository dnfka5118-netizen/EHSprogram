"use client";

import { useState, useTransition } from "react";
import { reportProgress, type ReportItem } from "../actions";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, Card, Field, FormMessage, Input, Textarea } from "@/components/ui";
import { MEASURE_LABEL } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import type { ActionState, Measure } from "@/lib/types";

type Choice = { done: boolean | null; newDate: string };

export function ReportForm({ findingId, measures, today, hasAfterPhotos }: {
  findingId: string;
  measures: Measure[];
  today: string;
  hasAfterPhotos: boolean;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(measures.map((m) => [m.id, { done: m.is_done ? true : null, newDate: "" }])),
  );
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  const set = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  const allChosen = measures.every((m) => choices[m.id].done !== null);
  const allDone = measures.every((m) => choices[m.id].done === true);
  const anyIncomplete = measures.some((m) => choices[m.id].done === false);

  function submit() {
    setState(undefined);
    if (!allChosen) return setState({ error: "각 조치의 완료 여부를 선택해 주세요." });
    for (const m of measures) {
      const c = choices[m.id];
      if (c.done === false && m.target_date < today && !c.newDate)
        return setState({ error: `${MEASURE_LABEL[m.kind]}의 목표일이 지났습니다. 새 목표일을 입력해 주세요.` });
    }
    if (allDone && !hasAfterPhotos && photos.length === 0) return setState({ error: "개선 후 사진을 1장 이상 등록해 주세요." });
    if (anyIncomplete && (!reason.trim() || !progress.trim())) return setState({ error: "미완료 이유와 진행현황을 입력해 주세요." });

    start(async () => {
      let paths: string[] = [];
      try {
        paths = photos.length ? await uploadPhotos(findingId, "after", photos) : [];
      } catch (e) {
        return setState({ error: (e as Error).message });
      }
      const items: ReportItem[] = measures.map((m) => ({
        measure_id: m.id,
        done: choices[m.id].done === true,
        new_target_date: choices[m.id].done === false && choices[m.id].newDate ? choices[m.id].newDate : null,
      }));
      const res = await reportProgress(findingId, items, reason, progress, paths);
      if (res?.error) await removePhotos(paths);
      else {
        setPhotos([]);
        setReason("");
        setProgress("");
      }
      setState(res);
    });
  }

  return (
    <Card title="조치결과 보고" className="border-emerald-300">
      <ul className="space-y-3">
        {measures.map((m) => {
          const c = choices[m.id];
          const overdue = m.target_date < today;
          return (
            <li key={m.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{MEASURE_LABEL[m.kind]}</p>
                  <p className={`text-xs ${overdue && !m.is_done ? "text-red-600" : "text-gray-500"}`}>목표 {fmtDate(m.target_date)}</p>
                </div>
                <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm">
                  <button
                    type="button"
                    onClick={() => set(m.id, { done: true })}
                    className={`px-4 py-1.5 ${c.done === true ? "bg-emerald-700 text-white" : "bg-white text-gray-700"}`}
                  >
                    완료
                  </button>
                  <button
                    type="button"
                    onClick={() => set(m.id, { done: false })}
                    className={`border-l border-gray-300 px-4 py-1.5 ${c.done === false ? "bg-amber-500 text-white" : "bg-white text-gray-700"}`}
                  >
                    미완료
                  </button>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{m.content}</p>
              {c.done === false && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-gray-700">
                    새 목표일{overdue && <span className="text-red-600">*</span>}
                  </span>
                  <Input type="date" min={today} className="max-w-48" value={c.newDate} onChange={(e) => set(m.id, { newDate: e.target.value })} />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {anyIncomplete && (
        <div className="mt-4 space-y-3">
          <Field label="미완료 이유" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="진행현황" required>
            <Textarea value={progress} onChange={(e) => setProgress(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="mt-4">
        <Field label="개선 후 사진" required={allDone && !hasAfterPhotos} hint={hasAfterPhotos ? "이미 등록된 사진이 있습니다" : undefined}>
          <PhotoPicker files={photos} onChange={setPhotos} label="촬영/선택" />
        </Field>
      </div>

      <div className="mt-4 space-y-2">
        <FormMessage state={state} />
        <Button disabled={pending || !allChosen} onClick={submit} className="w-full py-2.5 sm:w-auto">
          {pending ? "보고 중…" : allDone ? "완료 보고 (부서장 승인 요청)" : "미완료 보고"}
        </Button>
      </div>
    </Card>
  );
}
