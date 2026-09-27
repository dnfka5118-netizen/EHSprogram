"use client";

import { useState, useTransition } from "react";
import { savePlan, type PlanInput } from "../actions";
import { Button, Card, FormMessage, Input, Textarea } from "@/components/ui";
import { MEASURE_HINT, MEASURE_KINDS, MEASURE_LABEL } from "@/lib/labels";
import type { ActionState, Measure, MeasureKind } from "@/lib/types";

type Row = { content: string; target_date: string; done: boolean };

export function PlanForm({ findingId, measures, mode }: { findingId: string; measures: Measure[]; mode: "create" | "edit" }) {
  const [open, setOpen] = useState(mode === "create");
  const [rows, setRows] = useState<Record<MeasureKind, Row>>(() => {
    const init = {} as Record<MeasureKind, Row>;
    for (const k of MEASURE_KINDS) {
      const m = measures.find((x) => x.kind === k);
      init[k] = { content: m?.content ?? "", target_date: m?.target_date ?? "", done: m?.is_done ?? false };
    }
    return init;
  });
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="text-right">
        <button onClick={() => setOpen(true)} className="text-sm text-emerald-800 hover:underline">
          조치계획 수정 / 추가
        </button>
      </div>
    );
  }

  const set = (k: MeasureKind, patch: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k], ...patch } }));

  function submit() {
    const payload: PlanInput = MEASURE_KINDS.filter((k) => rows[k].content.trim()).map((k) => ({
      kind: k,
      content: rows[k].content,
      target_date: rows[k].target_date,
    }));
    if (payload.length === 0) return setState({ error: "즉시조치 / 단기대책 / 장기대책 중 1개 이상 입력해 주세요." });
    if (payload.some((p) => !p.target_date)) return setState({ error: "입력한 조치마다 목표일을 지정해 주세요." });
    start(async () => {
      const res = await savePlan(findingId, payload);
      setState(res);
      if (res?.ok && mode === "edit") setOpen(false);
    });
  }

  return (
    <Card title={mode === "create" ? "조치계획 등록" : "조치계획 수정"} className="border-emerald-300">
      <p className="mb-3 text-sm text-gray-600">해당하는 조치만 입력하세요. 조치마다 개선 목표일을 따로 정합니다.</p>
      <div className="space-y-4">
        {MEASURE_KINDS.map((k) => (
          <div key={k} className="rounded-md border border-gray-200 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-900">
              {MEASURE_LABEL[k]} <span className="text-xs font-normal text-gray-500">({MEASURE_HINT[k]})</span>
              {rows[k].done && <span className="ml-2 text-xs font-normal text-emerald-700">완료됨</span>}
            </p>
            <Textarea
              rows={2}
              value={rows[k].content}
              disabled={rows[k].done}
              onChange={(e) => set(k, { content: e.target.value })}
              placeholder={`${MEASURE_LABEL[k]} 내용 (해당 없으면 비워두세요)`}
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <span className="shrink-0">목표일</span>
              <Input
                type="date"
                className="max-w-48"
                value={rows[k].target_date}
                disabled={rows[k].done}
                onChange={(e) => set(k, { target_date: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
      {mode === "edit" && <p className="mt-2 text-xs text-gray-500">목표일을 바꾸면 변경 이력에 기록됩니다.</p>}
      <div className="mt-3 space-y-2">
        <FormMessage state={state} />
        <div className="flex gap-2">
          <Button disabled={pending} onClick={submit}>
            {pending ? "저장 중…" : "계획 저장"}
          </Button>
          {mode === "edit" && (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
