"use client";

import { useState, useTransition } from "react";
import { saveApprovalTemplate, type TemplateInput } from "../actions";
import { Button, FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import type { Person } from "@/lib/approval";

const KINDS = ["담당", "검토", "협조", "승인", "확인"];
const RESOLVERS = [
  { value: "drafter", label: "작성자 본인" },
  { value: "dept_head", label: "지정 부서의 부서장" },
  { value: "doc_dept_head", label: "해당 부서의 부서장" },
  { value: "user", label: "지정 사용자" },
  { value: "pick", label: "상신할 때 지정" },
];
const SELECT = "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

export function TemplateEditor({ moduleCode, initial, departments, people }: {
  moduleCode: string;
  initial: TemplateInput[];
  departments: { id: string; name: string }[];
  people: Person[];
}) {
  const [steps, setSteps] = useState<TemplateInput[]>(initial);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<TemplateInput>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[28px_80px_1fr_170px_1fr_70px_100px] gap-2 px-2 text-xs text-gray-500 md:grid">
        <span>순서</span>
        <span>구분</span>
        <span>표시명</span>
        <span>결재자 정하는 방법</span>
        <span>부서 / 사용자</span>
        <span>필수</span>
        <span />
      </div>
      {steps.map((s, i) => (
        <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 md:grid-cols-[28px_80px_1fr_170px_1fr_70px_100px]">
          <span className="text-center text-sm font-bold text-brand-700">{i + 1}</span>
          <select value={s.step_kind} onChange={(e) => set(i, { step_kind: e.target.value })} className={SELECT} aria-label="구분">
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input value={s.label} onChange={(e) => set(i, { label: e.target.value })} className={`${SELECT} col-span-2 md:col-span-1`} placeholder="예: 검토(EHS부서장)" />
          <select value={s.resolver} onChange={(e) => set(i, { resolver: e.target.value })} className={`${SELECT} col-span-2 md:col-span-1`} aria-label="결재자 정하는 방법">
            {RESOLVERS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div className="col-span-2 md:col-span-1">
            {s.resolver === "dept_head" && (
              <select value={s.department_id ?? ""} onChange={(e) => set(i, { department_id: e.target.value || null })} className={`${SELECT} w-full`}>
                <option value="">부서 선택</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            {s.resolver === "user" && (
              <select value={s.user_id ?? ""} onChange={(e) => set(i, { user_id: e.target.value || null })} className={`${SELECT} w-full`}>
                <option value="">사용자 선택</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.position ?? ""} {p.department ? `(${p.department})` : ""}
                  </option>
                ))}
              </select>
            )}
            {s.resolver === "doc_dept_head" && <span className="text-xs text-gray-500">문서에 지정된 해당 부서의 부서장(승인자)</span>}
            {s.resolver === "drafter" && <span className="text-xs text-gray-500">상신하는 사람 (상신 시 자동 결재)</span>}
            {s.resolver === "pick" && <span className="text-xs text-gray-500">상신하는 사람이 선택</span>}
          </div>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={s.required} onChange={(e) => set(i, { required: e.target.checked })} className="h-4 w-4" /> 필수
          </label>
          <span className="flex gap-1">
            <Mini onClick={() => move(i, -1)} disabled={i === 0}>↑</Mini>
            <Mini onClick={() => move(i, 1)} disabled={i === steps.length - 1}>↓</Mini>
            <Mini onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>✕</Mini>
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setSteps((s) => [...s, { step_kind: "협조", label: "협조", resolver: "pick", department_id: null, user_id: null, required: false }])}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        + 단계 추가
      </button>
      <p className="text-xs text-gray-500">필수가 아닌 단계는 상신할 때 결재자를 비워 두면 결재선에서 빠집니다 (예: 협조).</p>
      <FormMessage state={state} />
      <Button disabled={pending} onClick={() => start(async () => setState(await saveApprovalTemplate(moduleCode, steps)))}>
        {pending ? "저장 중…" : "결재선 저장"}
      </Button>
    </div>
  );
}

function Mini({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-7 w-7 rounded border border-gray-300 bg-white text-xs hover:bg-gray-100 disabled:opacity-30">
      {children}
    </button>
  );
}
