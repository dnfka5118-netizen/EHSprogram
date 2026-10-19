"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { getEditOptions, updateFinding } from "@/app/(main)/findings/actions";
import { Button, Field, Input, Select, Textarea } from "./ui";
import { VoiceButton } from "./VoiceButton";

type Target = {
  id: string;
  site_id: string;
  status: string;
  location_id: string | null;
  sub_location_id: string | null;
  sub_location_text: string | null;
  finding_type_id: string | null;
  problem: string;
  request_department_id: string;
};
type Options = Awaited<ReturnType<typeof getEditOptions>>;

// 현장에서 잘못 등록한 장소 · 세부장소 · 유형 · 문제점 · 조치 요청 부서 고치기 (등록자 : 종결 전 · 관리자)
export function EditFindingButton({ row, canEditDept, className = "" }: { row: Target; canEditDept: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [, startLoad] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
          if (!opts) startLoad(async () => setOpts(await getEditOptions(row.site_id)));
        }}
        className={`rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 ${className}`}
      >
        ✎ 수정
      </button>
      {open && <EditDialog row={row} canEditDept={canEditDept} opts={opts} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditDialog({ row, canEditDept, opts, onClose }: { row: Target; canEditDept: boolean; opts: Options | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    location_id: row.location_id ?? "",
    sub_location_id: row.sub_location_id ?? "",
    sub_location_text: row.sub_location_text ?? "",
    type_id: row.finding_type_id ?? "",
    problem: row.problem,
    department_id: row.request_department_id,
  });
  const subs = opts?.locations.find((l) => l.id === v.location_id)?.subs ?? [];
  const deptLocked = !canEditDept;
  const deptChanged = v.department_id !== row.request_department_id;

  function save() {
    setError(null);
    if (!v.problem.trim()) return setError("문제점을 입력해 주세요.");
    if (deptChanged && row.status !== "assign_wait" && !confirm("조치 요청 부서를 바꾸면 지정된 담당자와 완료되지 않은 조치계획이 지워지고 '담당자 지정 대기' 로 돌아갑니다. 바꿀까요?")) return;
    start(async () => {
      const r = await updateFinding(row.id, v);
      if (r?.error) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => (e.stopPropagation(), onClose())} onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-xl bg-white sm:max-w-lg sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5 sm:px-4">
          <h3 className="font-semibold">지적사항 수정</h3>
          <button type="button" onClick={onClose} className="px-2 text-xl leading-none text-gray-500" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-3 sm:p-4">
          {!opts ? (
            <p className="py-6 text-center text-sm text-gray-500">불러오는 중…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="장소">
                  <Select value={v.location_id} onChange={(e) => setV({ ...v, location_id: e.target.value, sub_location_id: "" })} className="w-full">
                    <option value="">선택 안 함</option>
                    {opts.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="세부장소">
                  {subs.length > 0 ? (
                    <Select value={v.sub_location_id} onChange={(e) => setV({ ...v, sub_location_id: e.target.value })} className="w-full">
                      <option value="">선택 안 함</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={v.sub_location_text} onChange={(e) => setV({ ...v, sub_location_text: e.target.value })} placeholder="직접 입력" className="w-full" />
                  )}
                </Field>
                <Field label="유형">
                  <Select value={v.type_id} onChange={(e) => setV({ ...v, type_id: e.target.value })} className="w-full">
                    <option value="">선택 안 함</option>
                    {opts.types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="조치 요청 부서" hint={deptLocked ? "담당자 지정 후에는 관리자만 변경" : undefined}>
                  <Select value={v.department_id} disabled={deptLocked} onChange={(e) => setV({ ...v, department_id: e.target.value })} className="w-full">
                    {opts.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="relative">
                <VoiceButton className="absolute top-0 right-0 z-10" value={v.problem} onChange={(problem) => setV({ ...v, problem })} />
                <Field label="문제점" required>
                  <Textarea rows={4} value={v.problem} onChange={(e) => setV({ ...v, problem: e.target.value })} className="w-full" />
                </Field>
              </div>
              {deptChanged && row.status !== "assign_wait" && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs break-keep text-amber-800">
                  부서를 바꾸면 지정된 조치담당자와 완료되지 않은 조치계획이 지워지고, 새 부서에서 담당자를 다시 지정합니다.
                </p>
              )}
              <p className="text-xs text-gray-500">바꾼 내용은 처리 이력에 남습니다. 부서를 바꾸면 새 부서에 조치 요청 알림이 갑니다.</p>
            </>
          )}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm break-keep text-red-700">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-3 py-2.5 sm:px-4">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button disabled={pending || !opts} onClick={save}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
