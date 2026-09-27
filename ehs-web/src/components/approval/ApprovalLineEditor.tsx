"use client";

import type { LineStep, Person, StepKind } from "@/lib/approval";

const KINDS: StepKind[] = ["담당", "검토", "협조", "승인", "확인"];
const SELECT = "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

// 상신할 때 결재선 편집 : 양식 기본값이 채워져 있고, 결재자 변경·단계 추가/삭제/순서 변경 가능
export function ApprovalLineEditor({ value, onChange, people }: { value: LineStep[]; onChange: (v: LineStep[]) => void; people: Person[] }) {
  const byDept = new Map<string, Person[]>();
  for (const p of people) {
    const k = p.department ?? "부서 미지정";
    byDept.set(k, [...(byDept.get(k) ?? []), p]);
  }
  const set = (i: number, patch: Partial<LineStep>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch, hint: undefined } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <span className="w-6 text-center text-xs font-bold text-brand-700">{i + 1}</span>
          <select value={s.step_kind} onChange={(e) => set(i, { step_kind: e.target.value as StepKind })} className={`${SELECT} w-20`} aria-label="구분">
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input
            value={s.label}
            onChange={(e) => set(i, { label: e.target.value })}
            className={`${SELECT} w-40`}
            aria-label="표시명"
            placeholder="표시명"
          />
          <select
            value={s.approver_id ?? ""}
            onChange={(e) => set(i, { approver_id: e.target.value || null })}
            className={`${SELECT} min-w-44 flex-1 ${!s.approver_id && s.required ? "border-red-300" : ""}`}
            aria-label="결재자"
          >
            <option value="">{s.required ? "결재자 선택" : "(지정 안 함 — 제외)"}</option>
            {[...byDept.entries()].map(([dept, list]) => (
              <optgroup key={dept} label={dept}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.position ? ` ${p.position}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="flex gap-0.5">
            <IconBtn label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </IconBtn>
            <IconBtn label="아래로" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
              ↓
            </IconBtn>
            <IconBtn label="삭제" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </IconBtn>
          </span>
          {s.hint && <p className="basis-full pl-8 text-xs text-amber-700">{s.hint}</p>}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { step_kind: "협조", label: "협조", approver_id: null, required: true }])}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        + 결재자 추가
      </button>
    </div>
  );
}

// 결재자를 지정하지 않은 선택 단계는 빼고, 필수 단계 누락은 오류로
export function finalizeLine(line: LineStep[]): { steps?: { step_kind: StepKind; label: string; approver_id: string }[]; error?: string } {
  const missing = line.find((s) => s.required && !s.approver_id);
  if (missing) return { error: `'${missing.label}' 결재자를 지정해 주세요.` };
  const steps = line.filter((s) => s.approver_id).map((s) => ({ step_kind: s.step_kind, label: s.label.trim() || s.step_kind, approver_id: s.approver_id! }));
  if (steps.length === 0) return { error: "결재선을 지정해 주세요." };
  return { steps };
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 rounded border border-gray-300 bg-white text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
