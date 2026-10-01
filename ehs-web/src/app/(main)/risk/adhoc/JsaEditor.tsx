"use client";

import { ScrollX } from "@/components/ScrollX";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveJsa, submitJsa } from "./actions";
import { ApprovalLineEditor, finalizeLine } from "@/components/approval/ApprovalLineEditor";
import { Button, FormMessage } from "@/components/ui";
import { resolveLine, type DeptHead, type LineStep, type TemplateStep } from "@/lib/approval-line";
import {
  CONTROL_OPTS,
  HAZARD_GROUPS,
  HAZARD_TYPES,
  aggregate,
  emptyHazard,
  emptyStep,
  riskColor,
  riskOf,
  riskTextColor,
  sampleJsa,
  type JsaForm,
  type JsaHazard,
  type JsaStep,
} from "@/lib/jsa";
import type { ActionState } from "@/lib/types";
import type { Person } from "@/lib/approval";

const INPUT = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none";
const SCORE = ["", "1", "2", "3", "4", "5"];

export function JsaEditor({ id, evalNo, initial, departments, template, people, meId, today, rejectedNote }: {
  id: string | null;
  evalNo: string | null;
  initial: JsaForm;
  departments: DeptHead[];
  template: TemplateStep[];
  people: Person[];
  meId: string;
  today: string;
  rejectedNote?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<JsaForm>(initial);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [lineEdited, setLineEdited] = useState(false);
  const [line, setLine] = useState<LineStep[]>(() => resolveLine(template, { drafterId: meId, docDepartmentId: initial.department_id || null, depts: departments }));
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<JsaForm>) => setForm((f) => ({ ...f, ...patch }));
  const setStep = (i: number, patch: Partial<JsaStep>) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const agg = useMemo(() => aggregate(form.steps), [form.steps]);
  const hazardCount = form.steps.reduce((n, s) => n + s.hazards.length, 0);

  function changeDept(deptId: string) {
    set({ department_id: deptId });
    if (!lineEdited) setLine(resolveLine(template, { drafterId: meId, docDepartmentId: deptId || null, depts: departments }));
  }

  function save() {
    setState(undefined);
    start(async () => {
      const res = await saveJsa(id, form);
      if (res.error) return setState({ error: res.error });
      setState({ message: "저장했습니다." });
      if (!id && res.id) router.replace(`/risk/adhoc/${res.id}`);
      else router.refresh();
    });
  }

  function submit() {
    setState(undefined);
    if (!form.work_name.trim()) return setState({ error: "작업명을 입력해 주세요." });
    if (!form.department_id) return setState({ error: "부서명을 선택해 주세요." });
    const fin = finalizeLine(line);
    if (fin.error) return setState({ error: fin.error });
    start(async () => {
      const res = await submitJsa(id, form, fin.steps!);
      if (res.error) {
        setState({ error: res.error });
        if (!id && res.id) router.replace(`/risk/adhoc/${res.id}`);
        return;
      }
      router.replace(`/risk/adhoc/${res.id}?submitted=1`);
      router.refresh();
    });
  }

  async function importExcel(file: File) {
    setState(undefined);
    try {
      const { importJsaExcel } = await import("@/lib/jsa-excel");
      const res = await importJsaExcel(file, departments);
      if (!confirm(`엑셀 파일에서 부서명·작업정보와 작업단계 ${res.form.steps.length}건을 찾았습니다.\n불러와서 현재 작성 중인 내용을 대체할까요?`)) return;
      setForm((f) => ({ ...f, ...res.form, department_id: res.form.department_id || f.department_id }));
      if (res.form.department_id) changeDept(res.form.department_id);
      setState({ message: `엑셀 파일을 불러왔습니다.${res.note ? ` ${res.note}` : ""} 저장 후 상신해 주세요.` });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function exportExcel() {
    const { exportJsaExcel } = await import("@/lib/jsa-excel");
    await exportJsaExcel(form, { evalNo, departmentName: departments.find((d) => d.id === form.department_id)?.name ?? "" });
  }

  return (
    <div className="space-y-4 pb-24">
      {rejectedNote && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>반려됨</b> · {rejectedNote} — 내용을 수정한 뒤 다시 상신해 주세요.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            if (confirm("예시 데이터를 불러올까요? 현재 작성 중인 내용은 대체됩니다.")) setForm(sampleJsa(today, form.department_id));
          }}
        >
          예시 보기
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          📥 엑셀 불러오기
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" onClick={exportExcel}>
          📤 엑셀로 내보내기
        </Button>
      </div>

      {/* 00 평가 기본정보 */}
      <Panel num="00" title="평가 기본정보">
        <div className="grid gap-3 md:grid-cols-3">
          <F label="평가번호">
            <input className={`${INPUT} bg-gray-50 font-mono`} value={evalNo ?? "저장 시 자동 발급"} readOnly />
          </F>
          <F label="평가일자">
            <input type="date" className={INPUT} value={form.eval_date} onChange={(e) => set({ eval_date: e.target.value })} />
          </F>
          <F label="부서명" required>
            <select className={INPUT} value={form.department_id} onChange={(e) => changeDept(e.target.value)}>
              <option value="">선택</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </F>
        </div>
        <Sub title="평가 참여자 & 참여 인원수">
          <div className="grid gap-3 md:grid-cols-3">
            <F label="관리감독자"><input className={INPUT} value={form.super_name} onChange={(e) => set({ super_name: e.target.value })} placeholder="성명" /></F>
            <F label="작업자"><input className={INPUT} value={form.worker_name} onChange={(e) => set({ worker_name: e.target.value })} placeholder="성명 (다수 시 쉼표로 구분)" /></F>
            <F label="EHS"><input className={INPUT} value={form.ehs_name} onChange={(e) => set({ ehs_name: e.target.value })} placeholder="성명" /></F>
            <F label="관리감독자 인원수"><input type="number" min={0} className={INPUT} value={form.super_count} onChange={(e) => set({ super_count: e.target.value })} placeholder="명" /></F>
            <F label="작업자 인원수"><input type="number" min={0} className={INPUT} value={form.worker_count} onChange={(e) => set({ worker_count: e.target.value })} placeholder="명" /></F>
            <F label="EHS 인원수"><input type="number" min={0} className={INPUT} value={form.ehs_count} onChange={(e) => set({ ehs_count: e.target.value })} placeholder="명" /></F>
          </div>
        </Sub>
      </Panel>

      {/* 01 작업 기본정보 */}
      <Panel num="01" title="작업 기본정보">
        <div className="grid gap-3 md:grid-cols-2">
          <F label="작업 지역"><input className={INPUT} value={form.work_area} onChange={(e) => set({ work_area: e.target.value })} placeholder="예) 2공장 반응동 3층" /></F>
          <F label="S O P 번호"><input className={`${INPUT} font-mono`} value={form.sop_no} onChange={(e) => set({ sop_no: e.target.value })} placeholder="예) SOP-R201-03" /></F>
          <div className="md:col-span-2">
            <F label="작업명" required><input className={INPUT} value={form.work_name} onChange={(e) => set({ work_name: e.target.value })} placeholder="예) R-201 반응기 맨홀 개방 후 내부 배관 용접보수" /></F>
          </div>
          <F label="작업 번호"><input className={`${INPUT} font-mono`} value={form.work_no} onChange={(e) => set({ work_no: e.target.value })} placeholder="예) WO-2026-0912" /></F>
          <F label="취급 물질"><input className={INPUT} value={form.material} onChange={(e) => set({ material: e.target.value })} placeholder="예) 톨루엔, 질소" /></F>
          <F label="필요 보호구"><input className={INPUT} value={form.ppe} onChange={(e) => set({ ppe: e.target.value })} placeholder="예) 안전모, 내화학장갑, 송기마스크" /></F>
          <F label="필요 (측정)장비/공구"><input className={INPUT} value={form.equip} onChange={(e) => set({ equip: e.target.value })} placeholder="예) 가스검지기, 절연공구" /></F>
          <F label="필요 안전장비"><input className={INPUT} value={form.safety_equip} onChange={(e) => set({ safety_equip: e.target.value })} placeholder="예) 소화기, 안전대, 구명줄" /></F>
          <F label="필요 자료"><input className={INPUT} value={form.req_docs} onChange={(e) => set({ req_docs: e.target.value })} placeholder="예) MSDS, 배관도면" /></F>
        </div>
      </Panel>

      {/* 02 위험 유형 자동집계 */}
      <Panel num="02" title="위험 유형 자동집계" sub="아래 03번 평가표 입력값에서 실시간 계산됩니다" tone="warn">
        <AggTable count={agg.count} max={agg.max} />
        <p className="text-xs text-gray-500">
          발생건수 = 해당 유형이 선택된 유해위험요인 라인 수, 최대위험도 = 해당 유형 중 통제 전 위험도(빈도×강도)의 최댓값입니다. 색은 값이 클수록 진하게 표시되는 참고용 시각화이며, 등급 기준은 SYMC-F110 절차의 위험성평가 실시요령을 따릅니다.
        </p>
      </Panel>

      {/* 03 작업단계별 위험성평가 */}
      <Panel num="03" title="작업단계별 위험성평가" sub={`${form.steps.length}개 단계 · 유해위험요인 ${hazardCount}건`}>
        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          작업을 단계별로 나누어 각 단계에서 발생 가능한 <b>유해위험요인을 모두 나열</b>하고, 통제 전 위험도(빈도×강도)를 평가한 뒤 <b>감소대책(제거→대체→공학적→관리적→보호구 순)</b>을 수립하고 통제 후 위험도를 재평가합니다.
        </p>
        {form.steps.map((s, i) => (
          <StepCard
            key={i}
            index={i}
            step={s}
            onChange={(patch) => setStep(i, patch)}
            onRemove={
              form.steps.length > 1
                ? () => {
                    if (confirm("이 작업단계를 삭제할까요? 입력된 유해위험요인·대책 내용이 모두 사라집니다.")) setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }));
                  }
                : undefined
            }
          />
        ))}
        <Button onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, emptyStep()] }))} className="self-start">
          + 작업단계 추가
        </Button>
      </Panel>

      {/* 상신 */}
      {submitOpen && (
        <Panel num="✓" title="결재 상신" sub="기본 결재선이 채워져 있습니다 · 필요하면 바꾸세요">
          <ApprovalLineEditor
            value={line}
            onChange={(v) => {
              setLine(v);
              setLineEdited(true);
            }}
            people={people}
          />
          <div className="flex gap-2">
            <Button disabled={pending} onClick={submit}>
              {pending ? "상신 중…" : "결재 상신"}
            </Button>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>
              닫기
            </Button>
          </div>
        </Panel>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur left-[var(--sidebar-w)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <FormMessage state={state} />
          </div>
          <Button variant="secondary" disabled={pending} onClick={save}>
            {pending ? "저장 중…" : "💾 임시 저장"}
          </Button>
          <Button disabled={pending} onClick={() => (submitOpen ? submit() : setSubmitOpen(true))}>
            {submitOpen ? "결재 상신" : "상신하기 →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepCard({ index, step, onChange, onRemove }: { index: number; step: JsaStep; onChange: (p: Partial<JsaStep>) => void; onRemove?: () => void }) {
  const setHazard = (j: number, patch: Partial<JsaHazard>) => onChange({ hazards: step.hazards.map((h, k) => (k === j ? { ...h, ...patch } : h)) });
  const c = step.control;
  const setCtrl = (patch: Partial<JsaStep["control"]>) => onChange({ control: { ...c, ...patch } });
  const post = riskOf(c.postFreq, c.postSev);

  return (
    <div className="space-y-3 rounded-lg border border-gray-300 bg-gray-50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <span className="rounded-md bg-brand-700 px-2 py-1 font-mono text-xs font-bold text-white">#{index + 1}</span>
        <label className="w-44">
          <span className="text-xs font-medium text-gray-600">분류</span>
          <input className={INPUT} value={step.cat} onChange={(e) => onChange({ cat: e.target.value })} placeholder="예) 정비/운전" />
        </label>
        <span className="flex-1" />
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600">
            단계 삭제 ✕
          </button>
        )}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-600">작업 내용</span>
        <textarea rows={2} className={INPUT} value={step.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="해당 작업단계에서 수행하는 작업 내용을 구체적으로 기술" />
      </label>

      <div>
        <p className="mb-1 text-xs font-bold text-gray-800">유해위험요인 (통제 전 위험도 = 빈도 × 강도) — 한 작업 내용에 누출·근골격계·질식 등 여러 유형을 추가할 수 있습니다</p>
        <div className="space-y-2">
          {step.hazards.map((h, j) => {
            const r = riskOf(h.freq, h.sev);
            return (
              <div key={j} className="grid grid-cols-[1fr_1fr] gap-1.5 rounded-md border border-gray-200 bg-white p-2 md:grid-cols-[140px_1fr_64px_64px_56px_28px]">
                <select className={`${INPUT} col-span-2 md:col-span-1`} value={h.type} onChange={(e) => setHazard(j, { type: e.target.value })} aria-label="유형">
                  <option value="">유형 선택</option>
                  {HAZARD_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.types.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input className={`${INPUT} col-span-2 md:col-span-1`} value={h.content} onChange={(e) => setHazard(j, { content: e.target.value })} placeholder="유해위험요인 내용" />
                <ScoreSelect value={h.freq} onChange={(v) => setHazard(j, { freq: v })} label="빈도" />
                <ScoreSelect value={h.sev} onChange={(v) => setHazard(j, { sev: v })} label="강도" />
                <RiskBadge v={r} />
                <button
                  type="button"
                  aria-label="삭제"
                  onClick={() => onChange({ hazards: step.hazards.length > 1 ? step.hazards.filter((_, k) => k !== j) : [emptyHazard()] })}
                  className="rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => onChange({ hazards: [...step.hazards, emptyHazard()] })} className="mt-1 text-sm font-medium text-brand-700 hover:underline">
          + 유해위험요인 추가
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-600">현재 안전조치 (이 작업 내용의 유해위험요인 전체에 공통 적용 — 중복 없이 한 번만 기술)</span>
        <textarea rows={2} className={INPUT} value={step.safe} onChange={(e) => onChange({ safe: e.target.value })} placeholder="현재 시행 중인 안전조치를 기술" />
      </label>

      <div className="space-y-2 border-t border-dashed border-gray-300 pt-2">
        <p className="text-xs font-bold text-brand-800">개선(감소)대책 — 이 단계의 유해위험요인 전체에 대한 공통 대책</p>
        <div className="flex items-center gap-2 text-sm">
          <span>개선대책 필요 여부</span>
          {[true, false].map((v) => (
            <label key={String(v)} className={`cursor-pointer rounded-md border px-3 py-1 ${c.needed === v ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : "border-gray-300 bg-white"}`}>
              <input
                type="radio"
                className="sr-only"
                checked={c.needed === v}
                onChange={() => (v ? setCtrl({ needed: true }) : onChange({ control: { ...emptyControlFrom(), needed: false } }))}
              />
              {v ? "있음" : "없음"}
            </label>
          ))}
        </div>
        {c.needed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CONTROL_OPTS.map((o) => (
                <label key={o} className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${c.checks.includes(o) ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : "border-gray-300 bg-white"}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={c.checks.includes(o)}
                    onChange={(e) => setCtrl({ checks: e.target.checked ? [...c.checks, o] : c.checks.filter((x) => x !== o) })}
                  />
                  {c.checks.includes(o) ? "☑" : "☐"} {o}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-xs text-gray-600">감소대책 설명</span>
              <textarea rows={2} className={INPUT} value={c.desc} onChange={(e) => setCtrl({ desc: e.target.value })} placeholder="구체적인 개선/감소 대책 내용을 기술" />
            </label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <label><span className="text-xs text-gray-600">개선번호</span><input className={`${INPUT} font-mono`} value={c.impNo} onChange={(e) => setCtrl({ impNo: e.target.value })} placeholder="예) IMP-01" /></label>
              <label><span className="text-xs text-gray-600">개선목표일</span><input type="date" className={INPUT} value={c.target} onChange={(e) => setCtrl({ target: e.target.value })} /></label>
              <label><span className="text-xs text-gray-600">조치담당자</span><input className={INPUT} value={c.owner} onChange={(e) => setCtrl({ owner: e.target.value })} placeholder="담당자 성명" /></label>
              <label><span className="text-xs text-gray-600">완료일</span><input type="date" className={INPUT} value={c.done} onChange={(e) => setCtrl({ done: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-bold text-gray-700">통제 후 위험도 평가</span>
              <ScoreSelect value={c.postFreq} onChange={(v) => setCtrl({ postFreq: v })} label="빈도" withLabel />
              <ScoreSelect value={c.postSev} onChange={(v) => setCtrl({ postSev: v })} label="강도" withLabel />
              <span className="text-xs text-gray-600">위험도</span>
              <RiskBadge v={post} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const emptyControlFrom = () => ({ needed: false, checks: [], desc: "", impNo: "", target: "", owner: "", done: "", postFreq: "", postSev: "" });

function ScoreSelect({ value, onChange, label, withLabel }: { value: string; onChange: (v: string) => void; label: string; withLabel?: boolean }) {
  const el = (
    <select className={`${INPUT} px-1 text-center`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} title={label}>
      {SCORE.map((v) => (
        <option key={v} value={v}>{v === "" ? label : v}</option>
      ))}
    </select>
  );
  return withLabel ? <label className="flex w-24 items-center gap-1 text-xs text-gray-600">{label}{el}</label> : el;
}

export function RiskBadge({ v }: { v: number | null }) {
  return (
    <span
      className="flex min-w-10 items-center justify-center rounded-md px-1.5 py-1 font-mono text-sm font-bold"
      style={{ background: riskColor(v) ?? "#f3f4f6", color: v ? riskTextColor(v) : "#9ca3af" }}
    >
      {v ?? "-"}
    </span>
  );
}

export function AggTable({ count, max }: { count: Record<string, number>; max: Record<string, number> }) {
  return (
    <ScrollX>
      <table className="w-full min-w-[920px] border-collapse text-center text-xs">
        <thead>
          <tr className="bg-gray-100 text-gray-700">
            <th className="border border-gray-200 px-1.5 py-1.5">유형</th>
            {HAZARD_GROUPS.map((g) => (
              <th key={g.label} colSpan={g.types.length} className="border border-gray-200 px-1.5 py-1.5">{g.label}</th>
            ))}
          </tr>
          <tr className="bg-gray-50 text-gray-500">
            <th className="border border-gray-200" />
            {HAZARD_TYPES.map((t) => (
              <th key={t} className="border border-gray-200 px-1 py-1 font-medium">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left whitespace-nowrap">발생건수</th>
            {HAZARD_TYPES.map((t) => (
              <td key={t} className="border border-gray-200 py-1.5 font-mono font-semibold">{count[t] || ""}</td>
            ))}
          </tr>
          <tr>
            <th className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left whitespace-nowrap">최대위험도</th>
            {HAZARD_TYPES.map((t) => (
              <td key={t} className="border border-gray-200 py-1.5 font-mono font-bold" style={max[t] ? { background: riskColor(max[t]), color: riskTextColor(max[t]) } : undefined}>
                {max[t] || ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </ScrollX>
  );
}

export function Panel({ num, title, sub, tone, children }: { num: string; title: string; sub?: string; tone?: "warn"; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className={`flex flex-wrap items-center gap-2 border-b border-l-4 border-gray-100 px-4 py-3 ${tone === "warn" ? "border-l-amber-500" : "border-l-brand-600"}`}>
        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-500">{num}</span>
        <h2 className="font-bold text-gray-900">{title}</h2>
        {sub && <span className="ml-auto text-xs text-gray-500">{sub}</span>}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-sm font-bold text-gray-800">{title}</p>
      {children}
    </div>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}
