"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineDialog, finalizeLine, kindOf } from "@/components/approval/ApprovalLineEditor";
import { Button } from "@/components/ui";
import type { LineStep } from "@/lib/approval-line";
import type { Person } from "@/lib/approval";
import { submitDailyLog } from "../../../daily-actions";

const B = "border border-gray-400";

// 월간 일지 상신 : 일지 오른쪽 위 결재란 자리 — [상신] 버튼 바로 아래 결재란, 결재란을 누르면 결재라인 지정
//   (양식별 기본 결재선(환경설정)에서 시작해 바꿔서 상신)
export function SubmitLog({ id, initialLine, people, meId, missed, again }: {
  id: string;
  initialLine: LineStep[];
  people: Person[];
  meId: string;
  missed: number[]; // 미점검일 (상신 전 확인)
  again?: boolean; // 반려 후 다시 상신
}) {
  const router = useRouter();
  const [line, setLine] = useState<LineStep[]>(initialLine);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const who = (pid: string | null) => people.find((p) => p.id === pid);
  const boxes = line.filter((s) => kindOf(s) === "결재" || kindOf(s) === "합의");
  const others = line.filter((s) => kindOf(s) === "참조" || kindOf(s) === "시행");
  const missing = boxes.filter((s) => s.required && !s.approver_id);

  const submit = () => {
    setError(null);
    const fin = finalizeLine(line, meId);
    if (fin.error) return setError(fin.error);
    const warn = missed.length ? `\n\n미점검일 ${missed.length}일(${missed.join(", ")}일)은 일지에 '미점검'으로 남습니다.` : "";
    if (!confirm(`이 달 일지를 상신할까요?${warn}`)) return;
    start(async () => {
      const r = await submitDailyLog(id, fin.steps!);
      if ("error" in r) return setError(r.error);
      router.refresh();
    });
  };

  return (
    <div className="flex max-w-full flex-col items-end gap-1.5">
      <Button className="px-5 py-1.5" disabled={pending} onClick={submit}>
        {pending ? "상신 중…" : again ? "다시 상신" : "상신"}
      </Button>
      <button type="button" onClick={() => setOpen(true)} title="눌러서 결재라인 지정" className="max-w-full overflow-x-auto rounded-sm text-left ring-brand-400 hover:ring-2">
        <table className="border-collapse text-center">
          <tbody>
            <tr>
              <th rowSpan={2} className={`${B} w-6 bg-gray-100 px-1 [writing-mode:vertical-rl]`}>
                결 재
              </th>
              {boxes.map((s, i) => (
                <th key={i} className={`${B} w-20 bg-gray-100 px-1 py-0.5 font-medium break-keep`}>
                  {kindOf(s) === "합의" ? `합의(${s.label})` : s.label}
                </th>
              ))}
            </tr>
            <tr>
              {boxes.map((s, i) => {
                const p = who(s.approver_id);
                return (
                  <td key={i} className={`${B} h-12 px-1 align-middle`}>
                    <span className={`font-medium ${p ? "" : "text-red-600"}`}>{p?.name ?? "미지정"}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </button>
      <p className="text-[10px] text-gray-500">
        결재란을 누르면 결재라인을 바꿀 수 있습니다
        {others.length > 0 && ` · 참조·시행 ${others.length}명`}
      </p>
      {missing.length > 0 && <p className="text-[11px] text-red-600">결재자를 지정해 주세요 : {missing.map((s) => s.label).join(", ")}</p>}
      {missed.length > 0 && <p className="text-[11px] break-keep text-red-700">미점검일 {missed.length}일 — 상신 전에 아래 소급 입력을 확인하세요</p>}
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
      {open && <LineDialog value={line} people={people} meId={meId} onClose={() => setOpen(false)} onSave={(v) => (setLine(v), setOpen(false))} />}
    </div>
  );
}
