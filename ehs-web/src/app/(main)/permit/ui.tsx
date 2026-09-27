"use client";

import type { ReactNode } from "react";
import { CHK, type ChkGroup } from "@/lib/permit";

export const INPUT = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none disabled:bg-gray-50 disabled:text-gray-600";

export function Panel({ num, title, sub, tone, locked, children }: { num: string; title: string; sub?: string; tone?: "warn" | "done"; locked?: boolean; children: ReactNode }) {
  const border = tone === "warn" ? "border-l-amber-500" : tone === "done" ? "border-l-emerald-600" : "border-l-brand-600";
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className={`flex flex-wrap items-center gap-2 border-b border-l-4 border-gray-100 px-4 py-3 ${border}`}>
        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-500">{num}</span>
        <h2 className="font-bold text-gray-900">{title}</h2>
        {sub && <span className="text-xs text-gray-500">{sub}</span>}
        {locked && <span className="ml-auto text-xs font-bold text-gray-400">🔒 승인 완료 · 수정 불가</span>}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

export function Sub({ title, tag, children }: { title: string; tag?: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3 first:border-0 first:pt-0">
      <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
        {title}
        {tag && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{tag}</span>}
      </p>
      {children}
    </div>
  );
}

export function F({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
        {hint && <span className="ml-1 font-normal text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-gray-500">{children}</p>;
}

export function Pill({ checked, onChange, children, disabled, tone }: { checked: boolean; onChange?: (v: boolean) => void; children: ReactNode; disabled?: boolean; tone?: "ok" }) {
  const on = tone === "ok" ? "border-emerald-600 bg-emerald-600 text-white" : "border-brand-600 bg-brand-50 font-semibold text-brand-800";
  const off = tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-gray-50 text-gray-700";
  return (
    <label className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs select-none ${checked ? on : off} ${disabled ? "cursor-default opacity-80" : "cursor-pointer"}`}>
      <input type="checkbox" className="h-3.5 w-3.5" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      {children}
    </label>
  );
}

// 체크 항목 목록 : need = 필요 체크(신청), ok = ○ 확인(현장), 단일 체크 그룹은 ok 로만
export function CheckList({ group, need, ok, onNeed, onOk, mode }: {
  group: ChkGroup;
  need: Record<string, boolean>;
  ok: Record<string, boolean>;
  onNeed?: (key: string, v: boolean) => void;
  onOk?: (key: string, v: boolean) => void;
  mode: "apply" | "field" | "view" | "single";
}) {
  return (
    <div className={mode === "single" ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2" : "flex flex-col gap-1.5"}>
      {CHK[group].map((label, i) => {
        const key = `${group}_${i}`;
        if (mode === "single") {
          return (
            <Pill key={key} checked={!!ok[key]} onChange={(v) => onOk?.(key, v)} disabled={!onOk} tone="ok">
              {label}
            </Pill>
          );
        }
        return (
          <div key={key} className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-44 flex-1">
              <Pill checked={!!need[key]} onChange={(v) => onNeed?.(key, v)} disabled={mode !== "apply"}>
                {label}
              </Pill>
            </span>
            {mode !== "apply" && need[key] && (
              <Pill checked={!!ok[`${key}_ok`]} onChange={(v) => onOk?.(`${key}_ok`, v)} disabled={mode !== "field"} tone="ok">
                ○ 확인
              </Pill>
            )}
          </div>
        );
      })}
    </div>
  );
}
