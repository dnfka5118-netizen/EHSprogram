"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePermit, submitPermit } from "./actions";
import { ApprovalLineEditor, finalizeLine } from "@/components/approval/ApprovalLineEditor";
import { Button, FormMessage } from "@/components/ui";
import { resolveLine, type DeptHead, type LineStep, type TemplateStep } from "@/lib/approval-line";
import { GRADE_TABLE, SUPP_TYPES, emptyPerson, outsideHours, type PermitApply, type Person3 } from "@/lib/permit";
import { riskColor, riskTextColor } from "@/lib/jsa";
import { fmtDate } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import type { Person } from "@/lib/approval";
import { CheckList, F, Hint, INPUT, Panel, Pill, Sub } from "./ui";

export type JsaOption = { id: string; eval_no: string; eval_date: string; department_name: string | null; work_name: string; max_risk: number };

// 안전작업허가 신청 (00 발급 정보 · 01 작업 기본정보 · 02 작업 전 확인사항 — 필요 표시)
export function PermitEditor({ id, permitNo, initial, departments, template, people, meId, jsaOptions, rejectedNote }: {
  id: string | null;
  permitNo: string | null;
  initial: PermitApply;
  departments: DeptHead[];
  template: TemplateStep[];
  people: Person[];
  meId: string;
  jsaOptions: JsaOption[];
  rejectedNote?: string | null;
}) {
  const router = useRouter();
  const [p, setP] = useState<PermitApply>(initial);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lineEdited, setLineEdited] = useState(false);
  const [line, setLine] = useState<LineStep[]>(() => resolveLine(template, { drafterId: meId, docDepartmentId: initial.department_id || null, depts: departments }));

  const set = (patch: Partial<PermitApply>) => setP((x) => ({ ...x, ...patch }));
  const setCheck = (k: string, v: boolean) => setP((x) => ({ ...x, checks: { ...x.checks, [k]: v } }));
  const setField = (k: keyof PermitApply["fields"], v: string) => setP((x) => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const has = (s: string) => p.supp.includes(s as PermitApply["supp"][number]);
  const linked = jsaOptions.find((j) => j.id === p.risk_eval_id);

  function changeDept(deptId: string) {
    set({ department_id: deptId });
    if (!lineEdited) setLine(resolveLine(template, { drafterId: meId, docDepartmentId: deptId || null, depts: departments }));
  }

  const payload = (): PermitApply => ({ ...p, tags: p.tags.filter((t) => t.name || t.tag), managers: p.managers.filter((m) => m.name || m.org), witnesses: p.witnesses.filter((m) => m.name || m.org) });

  function save() {
    setState(undefined);
    start(async () => {
      const res = await savePermit(id, payload());
      if (res.error) return setState({ error: res.error });
      setState({ message: "저장했습니다." });
      if (!id && res.id) router.replace(`/permit/${res.id}`);
      else router.refresh();
    });
  }

  function submit() {
    setState(undefined);
    const fin = finalizeLine(line);
    if (fin.error) return setState({ error: fin.error });
    start(async () => {
      const res = await submitPermit(id, payload(), fin.steps!);
      if (res.error) {
        setState({ error: res.error });
        if (!id && res.id) router.replace(`/permit/${res.id}`);
        return;
      }
      router.replace(`/permit/${res.id}?submitted=1`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {rejectedNote && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>반려됨</b> · {rejectedNote} — 내용을 수정한 뒤 다시 상신해 주세요.
        </p>
      )}

      {/* 00 */}
      <Panel num="00" title="허가서 발급 정보">
        <div className="grid gap-3 md:grid-cols-3">
          <F label="허가번호">
            <input className={`${INPUT} bg-gray-50 font-mono`} value={permitNo ?? "저장 시 자동 발급"} readOnly />
          </F>
          <F label="해당부서" required hint="(승인 부서장)">
            <select className={INPUT} value={p.department_id} onChange={(e) => changeDept(e.target.value)}>
              <option value="">선택</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </F>
          <div />
          <F label="PSM 변경관리 대상">
            <Radio value={p.psm} options={["해당", "미해당"]} onChange={(v) => set({ psm: v as PermitApply["psm"] })} />
          </F>
          <F label="가동전점검 실시대상">
            <Radio value={p.preop} options={["해당", "미해당"]} onChange={(v) => set({ preop: v as PermitApply["preop"] })} />
          </F>
        </div>
        <Hint>절차 6.1가: 해당 작업의 PSM 변경관리 대상 여부 및 가동전점검(안전인증대상 기계·기구 등) 실시대상 여부를 확인하고 해당·미해당을 표기합니다. 허가일시는 최종 승인(발급) 시각으로 자동 기록됩니다.</Hint>
      </Panel>

      {/* 01 */}
      <Panel num="01" title="작업 기본정보">
        <F label="작업 종류" required>
          <Radio value={p.work_type} options={["일반위험", "화기"]} labels={["일반위험작업", "화기작업"]} onChange={(v) => set({ work_type: v as PermitApply["work_type"] })} />
        </F>
        <Sub title="보충작업허가 (해당 시 모두 선택 — 아래에 관련 안전조치 항목이 추가로 표시됩니다)">
          <div className="flex flex-wrap gap-2">
            {SUPP_TYPES.map((s) => (
              <Pill key={s.key} checked={has(s.key)} onChange={(v) => set({ supp: v ? [...p.supp, s.key] : p.supp.filter((x) => x !== s.key) })}>
                {s.label}
              </Pill>
            ))}
          </div>
        </Sub>
        <F label="위험등급" required>
          <div className="flex gap-2">
            {(["A", "B", "C"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set({ grade: g })}
                className={`rounded-lg border px-4 py-1.5 text-sm ${
                  p.grade === g
                    ? g === "A"
                      ? "border-red-600 bg-red-50 font-bold text-red-700"
                      : g === "B"
                        ? "border-amber-600 bg-amber-50 font-bold text-amber-700"
                        : "border-emerald-600 bg-emerald-50 font-bold text-emerald-700"
                    : "border-gray-300 bg-gray-50"
                }`}
              >
                {g}등급
              </button>
            ))}
          </div>
        </F>
        <details className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-brand-800">작업별 위험등급 구분기준 보기 (부표 1)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-white text-gray-600">
                  {["구분", "A등급", "B등급", "C등급"].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-1.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRADE_TABLE.map((r) => (
                  <tr key={r[0]}>
                    {r.map((c, i) => (
                      <td key={i} className={`border border-gray-200 px-2 py-1.5 ${c === "해당없음" ? "text-center text-gray-400" : ""}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint>여러 작업이 병행될 경우 가장 높은 위험등급으로 기재합니다. A·B등급은 입회자를 반드시 선임해야 하며, B등급 이상은 작업 시작 전 EHS부서원의 현장 확인 서명이 필요합니다.</Hint>
        </details>
        {(p.grade === "A" || p.grade === "B") && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ! 위험등급 <b>{p.grade}</b>등급은 입회자 선임이 필수이며, 화기작업 시 등급과 무관하게 화재감시자를 지정·배치해야 합니다.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <F label="작업명" required>
              <input className={INPUT} value={p.work_name} onChange={(e) => set({ work_name: e.target.value })} placeholder="예) R-201 반응기 촉매 교체를 위한 맨홀 개방 및 내부 정비" />
            </F>
          </div>
          <F label="작업장소"><input className={INPUT} value={p.work_place} onChange={(e) => set({ work_place: e.target.value })} placeholder="예) 2공장 반응동 3층" /></F>
          <F label="시공업체명 (회사명)"><input className={INPUT} value={p.company_name} onChange={(e) => set({ company_name: e.target.value })} placeholder="예) (주)삼영순화 / 외주업체명" /></F>
        </div>
        <Sub title="설비번호 (Tag No.)">
          <Rows
            rows={p.tags}
            onChange={(tags) => set({ tags })}
            empty={{ name: "", tag: "" }}
            cols={2}
            addLabel="+ 설비 추가"
            render={(t, upd) => (
              <>
                <input className={INPUT} value={t.name} onChange={(e) => upd({ name: e.target.value })} placeholder="설비명" />
                <input className={`${INPUT} font-mono`} value={t.tag} onChange={(e) => upd({ tag: e.target.value })} placeholder="설비번호(Tag No.)" />
              </>
            )}
          />
        </Sub>
        <div className="grid gap-3 md:grid-cols-2">
          <F label="작업 시작일시" required><input type="datetime-local" className={INPUT} value={p.start_dt} onChange={(e) => set({ start_dt: e.target.value })} /></F>
          <F label="작업 종료일시" required><input type="datetime-local" className={INPUT} value={p.end_dt} onChange={(e) => set({ end_dt: e.target.value })} /></F>
        </div>
        {outsideHours(p.start_dt, p.end_dt) && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ! 허가 효력은 정상근무시간(08:30~17:30) 내로 제한됩니다. 익일까지 이어지거나 시간 연장이 필요하면 발급 후 현장 기록의 <b>연장 기록</b>에 추가하고 재발급·재확인 서명을 받으세요.
          </p>
        )}
        <Sub title="작업관리자 (외주 작업 시 공사업체 관리자)">
          <PeopleRows rows={p.managers} onChange={(managers) => set({ managers })} addLabel="+ 작업관리자 추가" />
        </Sub>
        <Sub title="입회자" tag="A·B등급 필수">
          <PeopleRows rows={p.witnesses} onChange={(witnesses) => set({ witnesses })} addLabel="+ 입회자 추가" />
          <Hint>화기작업 입회자는 화재감시자 역할을 겸하며, 밀폐공간작업 입회자는 관리감독자로 지정합니다.</Hint>
        </Sub>
      </Panel>

      {/* 02 */}
      <Panel num="02" title="작업 전 확인사항" sub="문서 · 안전보호구 · 안전조치요구사항 — 필요한 항목을 체크하세요" tone="warn">
        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
          여기서 체크하는 것은 <b>“필요”</b> 표시입니다. 허가서가 발급되면 <b>📱 현장 기록</b>에서 각 항목이 실제로 현장에 적용되었는지 <b>“○ 확인”</b>을 체크하고 서명합니다.
        </p>
        <Sub title="확인 서류">
          <CheckList group="docs" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Pill checked={!!p.checks.docs_proc} onChange={(v) => setCheck("docs_proc", v)}>작업절차서 필요</Pill>
              <input className={`${INPUT} font-mono`} value={p.fields.proc_no} onChange={(e) => setField("proc_no", e.target.value)} placeholder="※번호 예) WP-R201-07" />
            </div>
            <div className="space-y-1.5">
              <Pill checked={!!p.checks.docs_risk} onChange={(v) => setCheck("docs_risk", v)}>위험성평가서 필요</Pill>
              <input
                className={`${INPUT} font-mono`}
                value={linked ? linked.eval_no : p.fields.risk_no}
                readOnly={!!linked}
                onChange={(e) => setField("risk_no", e.target.value)}
                placeholder="※번호 예) RA-2026-114"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setPickerOpen(true)}>
                  🔗 위험성평가 불러오기
                </Button>
                {linked && (
                  <button type="button" className="text-xs text-gray-500 hover:text-red-600" onClick={() => set({ risk_eval_id: "" })}>
                    연동 해제
                  </button>
                )}
              </div>
              {linked && <p className="text-xs text-emerald-700">✓ 위험성평가({linked.eval_no})와 연동됨 — 허가서 인쇄 시 함께 출력됩니다.</p>}
            </div>
          </div>
          <Hint>절차서가 마련되어 있으면 위험성평가를 생략할 수 있으나, 없는 경우 반드시 작업 전 위험성평가를 실시해야 합니다(절차 6.2라).</Hint>
        </Sub>
        <Sub title="안전보호구">
          <CheckList group="ppe" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          <F label="기타 보호구"><input className={INPUT} value={p.fields.ppe_etc} onChange={(e) => setField("ppe_etc", e.target.value)} /></F>
        </Sub>
        <Sub title="일반 및 화기">
          <CheckList group="general" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          <Hint>화기작업 전 가스농도 측정 기준: LEL 25% 미만, 독성물질 TWA 기준 미만(초과 시 출입 금지). 측정 기록은 발급 후 현장 기록의 화기작업 가스농도 측정기록에 남깁니다.</Hint>
        </Sub>
        {has("confined") && (
          <Sub title="밀폐공간">
            <CheckList group="confined" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
            <Hint>허가 기준: 산소 18%↑23.5%미만 · CO₂ 1.5%미만 · CO 30ppm미만 · H₂S 10ppm미만. 입회자는 관리감독자로 지정하고, 출입 시 2인 1조 안전 대기조를 운영합니다.</Hint>
          </Sub>
        )}
        {has("power") && (
          <Sub title="정전" tag="EHS 확인 필요">
            <CheckList group="power1" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
            <div className="grid gap-3 md:grid-cols-2">
              <F label="차단기기 — 제어실"><input className={INPUT} value={p.fields.power_ctrl_room} onChange={(e) => setField("power_ctrl_room", e.target.value)} /></F>
              <F label="차단기기 — 현장"><input className={INPUT} value={p.fields.power_field} onChange={(e) => setField("power_field", e.target.value)} /></F>
            </div>
            <Hint>전원복구는 모든 작업이 완료된 후 작업관리자의 요청에 의해서만 실시합니다. (복구 시간·확인자는 현장 기록에서 입력)</Hint>
          </Sub>
        )}
        {has("excavation") && (
          <Sub title="굴착" tag="EHS 확인 필요">
            <Hint>가스·기계·소방배관 / 전기·계장·통신 매설 확인과 검토자 성명은 발급 후 현장 기록에서 입력합니다. 깊이 30cm 이상 굴착 시 적용하며, 굴착지점 외 지하에 배관·전력선·계장선 등이 있을 때는 수동굴착으로 작업합니다.</Hint>
          </Sub>
        )}
        {has("radiation") && (
          <Sub title="방사선" tag="EHS 확인 필요">
            <CheckList group="radiation" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          </Sub>
        )}
        {has("height") && (
          <Sub title="고소" tag="EHS 확인 필요">
            <CheckList group="height" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          </Sub>
        )}
        {has("heavy") && (
          <Sub title="중장비" tag="EHS 확인 필요">
            <div className="grid gap-3 md:grid-cols-2">
              <F label="장비명"><input className={INPUT} value={p.fields.heavy_equip} onChange={(e) => setField("heavy_equip", e.target.value)} placeholder="예) 25톤 이동식크레인" /></F>
              <F label="운전원"><input className={INPUT} value={p.fields.heavy_operator} onChange={(e) => setField("heavy_operator", e.target.value)} /></F>
            </div>
            <CheckList group="heavy" need={p.checks} ok={{}} onNeed={setCheck} mode="apply" />
          </Sub>
        )}
      </Panel>

      {submitOpen && (
        <Panel num="✓" title="결재 상신" sub="기본 결재선이 채워져 있습니다 · 협조(관련부서)가 필요하면 결재자를 지정하세요">
          <ApprovalLineEditor
            value={line}
            onChange={(v) => {
              setLine(v);
              setLineEdited(true);
            }}
            people={people}
          />
          <Hint>담당(발급) → 검토(EHS부서장) → 협조(관련부서, 필요 시) → 승인(해당부서장) 순으로 결재합니다. 최종 승인되면 허가서가 발급됩니다.</Hint>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={submit}>{pending ? "상신 중…" : "결재 상신"}</Button>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>닫기</Button>
          </div>
        </Panel>
      )}

      {pickerOpen && (
        <RiskPicker
          options={jsaOptions}
          startDt={p.start_dt}
          onClose={() => setPickerOpen(false)}
          onPick={(j) => {
            set({ risk_eval_id: j.id, checks: { ...p.checks, docs_risk: true }, fields: { ...p.fields, risk_no: j.eval_no } });
            setPickerOpen(false);
          }}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur left-[var(--sidebar-w)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><FormMessage state={state} /></div>
          <Button variant="secondary" disabled={pending} onClick={save}>{pending ? "저장 중…" : "💾 임시 저장"}</Button>
          <Button disabled={pending} onClick={() => (submitOpen ? submit() : setSubmitOpen(true))}>{submitOpen ? "결재 상신" : "상신하기 →"}</Button>
        </div>
      </div>
    </div>
  );
}

function Radio({ value, options, labels, onChange }: { value: string; options: string[]; labels?: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${value === o ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-gray-300 bg-gray-50"}`}
        >
          {labels?.[i] ?? o}
        </button>
      ))}
    </div>
  );
}

function Rows<T>({ rows, onChange, empty, addLabel, render, cols = 3 }: {
  cols?: 2 | 3;
  rows: T[];
  onChange: (rows: T[]) => void;
  empty: T;
  addLabel: string;
  render: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-1 items-center gap-2 ${cols === 2 ? "sm:grid-cols-[1fr_1fr_28px]" : "sm:grid-cols-[1fr_1fr_1fr_28px]"}`}>
          {render(r, (patch) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
          <button type="button" aria-label="삭제" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...empty }])} className="text-sm font-medium text-brand-700 hover:underline">{addLabel}</button>
    </div>
  );
}

function PeopleRows({ rows, onChange, addLabel }: { rows: Person3[]; onChange: (r: Person3[]) => void; addLabel: string }) {
  return (
    <Rows
      rows={rows}
      onChange={onChange}
      empty={emptyPerson()}
      addLabel={addLabel}
      render={(m, upd) => (
        <>
          <input className={INPUT} value={m.org} onChange={(e) => upd({ org: e.target.value })} placeholder="소속" />
          <input className={INPUT} value={m.name} onChange={(e) => upd({ name: e.target.value })} placeholder="이름" />
          <input className={INPUT} value={m.phone} onChange={(e) => upd({ phone: e.target.value })} placeholder="연락처" inputMode="tel" />
        </>
      )}
    />
  );
}

// 결재 완료된 위험성평가 중 선택 (작업일과 1년 이상 차이나면 연결 불가)
function RiskPicker({ options, startDt, onClose, onPick }: { options: JsaOption[]; startDt: string; onClose: () => void; onPick: (j: JsaOption) => void }) {
  const [warn, setWarn] = useState<string | null>(null);
  const days = (d: string) => Math.round(Math.abs(Date.parse(startDt.slice(0, 10)) - Date.parse(d)) / 86400000);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 sm:max-w-3xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">결재 완료된 위험성평가(수시) — 연동할 평가서를 선택하세요</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">✕</button>
        </div>
        <Hint>평가일자가 허가서의 작업 시작일시와 365일(1년) 이상 차이나는 평가서는 유효성 검증이 필요하여 연동되지 않습니다.</Hint>
        {warn && <p className="my-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{warn}</p>}
        {options.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">결재 완료된 위험성평가가 없습니다. 먼저 위험성평가 → 수시 위험성평가(JSA)에서 평가서를 작성·결재해 주세요.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="bg-brand-50 text-xs text-gray-700">
                <tr>
                  {["평가번호", "평가일자", "부서명", "작업명", "최대위험도", "유효성", ""].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((j) => {
                  const expired = days(j.eval_date) >= 365;
                  return (
                    <tr key={j.id}>
                      <td className="border border-gray-200 px-2 py-1.5 font-mono text-xs">{j.eval_no}</td>
                      <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{fmtDate(j.eval_date)}</td>
                      <td className="border border-gray-200 px-2 py-1.5">{j.department_name ?? "-"}</td>
                      <td className="border border-gray-200 px-2 py-1.5">{j.work_name}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">
                        <span className="rounded px-1.5 font-mono font-bold" style={{ background: riskColor(j.max_risk), color: riskTextColor(j.max_risk) }}>{j.max_risk || "-"}</span>
                      </td>
                      <td className={`border border-gray-200 px-2 py-1.5 text-center text-xs ${expired ? "font-bold text-red-600" : "text-emerald-700"}`}>{expired ? "⚠ 재검증필요" : "정상"}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">
                        <button
                          type="button"
                          className="rounded-md bg-brand-800 px-2.5 py-1 text-xs text-white"
                          onClick={() =>
                            expired
                              ? setWarn(`선택한 평가서(${j.eval_no})의 평가일자(${j.eval_date})와 허가서 작업 시작일시 사이 간격이 ${days(j.eval_date)}일로 1년(365일)을 초과합니다. 위험성평가를 재실시한 뒤 다시 연동해 주세요.`)
                              : onPick(j)
                          }
                        >
                          선택
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
