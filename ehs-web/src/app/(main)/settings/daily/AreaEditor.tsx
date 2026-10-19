"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { MemberPicker, type Member } from "@/components/MemberPicker";
import { DeleteSubmit, Field, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import type { DailyArea, DailyForm } from "@/lib/daily";

// 관리감독자 한 사람의 담당 Area : 관리감독자 · 양식(A~D) · 부서 · 담당 QR 지점(여러 곳) · 설명
export function AreaEditor({
  area,
  memberIds,
  pointIds,
  forms,
  departments,
  points,
  people,
  action,
}: {
  area: DailyArea | null;
  memberIds: string[];
  pointIds: string[];
  forms: DailyForm[];
  departments: { id: string; name: string }[];
  points: { id: string; name: string }[];
  people: Member[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [picked, setPicked] = useState<string[]>(memberIds);
  const [pts, setPts] = useState<string[]>(pointIds);
  const [form, setForm] = useState(area?.form_code ?? "A");
  const [q, setQ] = useState("");
  const useQr = forms.find((f) => f.code === form)?.use_qr ?? true;
  const wrapped = async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok && !area) {
      setPicked([]);
      setPts([]);
    }
    return r;
  };
  const shown = points.filter((p) => !q.trim() || p.name.includes(q.trim()) || pts.includes(p.id));
  return (
    <ActionForm action={wrapped} resetOnSuccess={!area} className="space-y-3">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="이름" required hint="예 : 김학준 (A형)">
          <Input name="name" defaultValue={area?.name} className="w-full" />
        </Field>
        <Field label="양식" required>
          <Select name="form_code" value={form} onChange={(e) => setForm(e.target.value)} className="w-full">
            {forms.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code}형 · {f.writer_note ?? f.name}
                {f.use_qr ? "" : " (QR 없음)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="부서" hint="부적합 기본 개선 부서 · 일지 승인 부서장">
          <Select name="department_id" defaultValue={area?.department_id ?? ""} className="w-full">
            <option value="">선택</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={`관리감독자 (${picked.length}명)`} hint="보통 1명 · 일지는 이 Area 에 1장">
        <MemberPicker members={people} picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      </Field>
      {picked.map((id) => (
        <input key={id} type="hidden" name="member" value={id} />
      ))}
      {useQr ? (
        <Field label={`담당 장소 QR (${pts.length}곳)`} hint="이 중 아무 QR 이나 찍으면 이 관리감독자의 점검표가 열림">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장소 검색" className="mb-2 w-full sm:w-60" />
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPts((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                className={`rounded-full border px-2.5 py-1 text-xs ${pts.includes(p.id) ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
              >
                {p.name}
              </button>
            ))}
            {points.length === 0 && <span className="text-xs text-gray-500">아래 &apos;QR 지점&apos; 에서 장소를 먼저 추가해 주세요.</span>}
          </div>
        </Field>
      ) : (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs break-keep text-gray-600">이 양식은 QR 없이 일일점검 화면의 [점검하기] 로 점검합니다.</p>
      )}
      {useQr && pts.map((id) => <input key={id} type="hidden" name="point" value={id} />)}
      <Field label="담당 Area 설명" hint="일지 머리글 · 비우면 담당 장소 이름으로 표시">
        <Input name="area_text" defaultValue={area?.area_text ?? ""} placeholder={useQr ? "예 : 과수 1공장 BDS 1실 외 3곳" : "예 : 품질보증팀 전체 (부서장)"} className="w-full" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} className="w-20" aria-label="순서" />
        {area && (
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={area.is_active} className="h-4 w-4" /> 사용
          </label>
        )}
        <SubmitButton>{area ? "저장" : "추가"}</SubmitButton>
        {area && <DeleteSubmit what={area.name} />}
      </div>
    </ActionForm>
  );
}
