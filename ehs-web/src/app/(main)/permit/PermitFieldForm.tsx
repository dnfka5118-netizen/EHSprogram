"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { completePermit, savePermitField } from "./actions";
import { SignaturePad } from "@/components/SignaturePad";
import { Button, FormMessage } from "@/components/ui";
import { SIG, rid, requiredSigs, type PermitApply, type PermitField, type SigKey } from "@/lib/permit";
import type { ActionState } from "@/lib/types";
import { CheckList, F, Hint, INPUT, Panel, Pill, Sub } from "./ui";

// 발급된 허가서의 현장 기록 : ○ 확인 · 서명 · 연장/중단 · 작업완료 · 가스측정 · 밀폐 출입 · 작업자 확인서명
export function PermitFieldForm({ id, permit, initial, readOnly }: { id: string; permit: PermitApply; initial: PermitField; readOnly: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<PermitField>(initial);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const edit = !readOnly;

  const setOk = (k: string, v: boolean) => setF((x) => ({ ...x, checks_ok: { ...x.checks_ok, [k]: v } }));
  const setSig = (k: SigKey, v: string) => setF((x) => ({ ...x, sigs: { ...x.sigs, [k]: v } }));
  const setFld = (k: keyof PermitField["fields"], v: string) => setF((x) => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const has = (s: string) => permit.supp.includes(s as PermitApply["supp"][number]);
  const need = permit.checks;
  const req = requiredSigs(permit);
  const completeReq: SigKey[] = ["complete_mgr", ...(permit.grade === "A" || permit.grade === "B" ? (["complete_wit"] as SigKey[]) : [])];
  const missing = [
    ...req.filter((k) => !f.sigs[k]).map((k) => `작업 전 ${SIG[k]}`),
    ...(f.fields.complete_time ? [] : ["작업완료 시간"]),
    ...completeReq.filter((k) => !f.sigs[k]).map((k) => `작업완료 ${SIG[k]}`),
  ];

  const sig = (k: SigKey) => (
    <div key={k}>
      <SignaturePad value={f.sigs[k] ?? ""} onChange={(v) => setSig(k, v)} disabled={!edit} label={`${SIG[k]}${req.includes(k) || completeReq.includes(k) ? " *" : ""}`} />
    </div>
  );

  function save(done: boolean) {
    setState(undefined);
    start(async () => {
      if (done && !confirm("작업완료 처리할까요? 완료 후에는 현장 기록을 수정할 수 없습니다.")) return;
      const res = done ? await completePermit(id, f) : await savePermitField(id, f);
      if (res.error) return setState({ error: res.error });
      setState({ message: res.message });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <Panel num="02" title="작업 전 확인사항 — 현장 조치 확인" sub="필요로 표시된 항목이 현장에 적용되었는지 ○ 확인" tone="warn">
        <Sub title="확인 서류">
          <CheckList group="docs" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          {(["docs_proc", "docs_risk"] as const)
            .filter((k) => need[k])
            .map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-44 flex-1">
                  <Pill checked disabled>
                    {k === "docs_proc" ? `작업절차서 (${permit.fields.proc_no || "-"})` : `위험성평가서 (${permit.fields.risk_no || "-"})`}
                  </Pill>
                </span>
                <Pill checked={!!f.checks_ok[`${k}_ok`]} onChange={(v) => setOk(`${k}_ok`, v)} disabled={!edit} tone="ok">○ 확인</Pill>
              </div>
            ))}
        </Sub>
        <Sub title="안전보호구">
          <CheckList group="ppe" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          {permit.fields.ppe_etc && <Hint>기타 보호구: {permit.fields.ppe_etc}</Hint>}
        </Sub>
        <Sub title="일반 및 화기">
          <CheckList group="general" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
        </Sub>
        {has("confined") && (
          <Sub title="밀폐공간">
            <CheckList group="confined" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          </Sub>
        )}
        {has("power") && (
          <Sub title="정전" tag="EHS 확인 필요">
            <CheckList group="power1" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
            <Hint>차단기기 : 제어실({permit.fields.power_ctrl_room || "-"}) / 현장({permit.fields.power_field || "-"}) · 전원복구는 모든 작업이 완료된 후 작업관리자의 요청에 의해서만 실시합니다.</Hint>
            <div className="grid gap-3 md:grid-cols-2">
              <F label="전원복구 시간"><input type="datetime-local" disabled={!edit} className={INPUT} value={f.fields.power_restore_time} onChange={(e) => setFld("power_restore_time", e.target.value)} /></F>
              <F label="전원복구 확인자"><input disabled={!edit} className={INPUT} value={f.fields.power_restore_by} onChange={(e) => setFld("power_restore_by", e.target.value)} /></F>
            </div>
          </Sub>
        )}
        {has("excavation") && (
          <Sub title="굴착" tag="EHS 확인 필요">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Pill checked={!!f.checks_ok.excGas} onChange={(v) => setOk("excGas", v)} disabled={!edit} tone="ok">가스·기계·소방배관 매설 확인</Pill>
                <input disabled={!edit} className={INPUT} value={f.fields.exc_gas_by} onChange={(e) => setFld("exc_gas_by", e.target.value)} placeholder="검토자 성명" />
              </div>
              <div className="space-y-1.5">
                <Pill checked={!!f.checks_ok.excElec} onChange={(v) => setOk("excElec", v)} disabled={!edit} tone="ok">전기·계장·통신 매설 확인</Pill>
                <input disabled={!edit} className={INPUT} value={f.fields.exc_elec_by} onChange={(e) => setFld("exc_elec_by", e.target.value)} placeholder="검토자 성명" />
              </div>
            </div>
          </Sub>
        )}
        {has("radiation") && (
          <Sub title="방사선" tag="EHS 확인 필요">
            <CheckList group="radiation" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          </Sub>
        )}
        {has("height") && (
          <Sub title="고소" tag="EHS 확인 필요">
            <CheckList group="height" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          </Sub>
        )}
        {has("heavy") && (
          <Sub title="중장비" tag="EHS 확인 필요">
            <Hint>장비명: {permit.fields.heavy_equip || "-"} · 운전원: {permit.fields.heavy_operator || "-"}</Hint>
            <CheckList group="heavy" need={need} ok={f.checks_ok} onOk={setOk} mode={edit ? "field" : "view"} />
          </Sub>
        )}
        <Hint>
          위 전체 내용(문서~중장비)에 대해 <b>작업관리자·입회자·EHS 3인이 현장에서 함께 확인</b>하고 서명합니다. * 표시 서명은 이 허가서에서 필수입니다
          {req.includes("prework_ehs") && " (B등급 이상 또는 정전·굴착·방사선·고소·중장비 → EHS 확인 필수)"}.
        </Hint>
        <div className="flex flex-wrap gap-4">{(["prework_mgr", "prework_wit", "prework_ehs"] as SigKey[]).map(sig)}</div>
      </Panel>

      <Panel num="+" title="작업시간 연장 기록">
        <Hint>연장 시에는 작업관리자(또는 위임자)가 현장을 재확인하여 안전하다고 판단될 때만 연장하고, 사유·연장시각·승인자를 적은 뒤 오른쪽 칸에 현장을 재확인한 사람이 직접 서명해야 합니다(절차 5.3라).</Hint>
        <RowList
          rows={f.extends}
          edit={edit}
          onChange={(extends_) => setF((x) => ({ ...x, extends: extends_ }))}
          make={() => ({ id: rid(), reason: "", time: "", approver: "", sig: "" })}
          addLabel="+ 연장 기록 추가"
          render={(r, upd) => (
            <div className="grid flex-1 grid-cols-1 items-center gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
              <input disabled={!edit} className={INPUT} value={r.reason} onChange={(e) => upd({ reason: e.target.value })} placeholder="연장 사유" />
              <input disabled={!edit} className={INPUT} value={r.time} onChange={(e) => upd({ time: e.target.value })} placeholder="연장 시각(HH:MM까지)" />
              <input disabled={!edit} className={INPUT} value={r.approver} onChange={(e) => upd({ approver: e.target.value })} placeholder="승인자" />
              <SignaturePad value={r.sig} onChange={(v) => upd({ sig: v })} disabled={!edit} width={140} height={44} label="현장확인 서명" />
            </div>
          )}
        />
      </Panel>

      <Panel num="03" title="작업중단 후 개시" sub="식사 등으로 1시간 이상 중단 시 작성">
        <RowList
          rows={f.suspends}
          edit={edit}
          onChange={(suspends) => setF((x) => ({ ...x, suspends }))}
          make={() => ({ id: rid(), stop: "", resume: "", reason: "" })}
          addLabel="+ 중단 기록 추가"
          render={(r, upd) => (
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
              <input disabled={!edit} className={INPUT} value={r.stop} onChange={(e) => upd({ stop: e.target.value })} placeholder="중단 시각" />
              <input disabled={!edit} className={INPUT} value={r.resume} onChange={(e) => upd({ resume: e.target.value })} placeholder="재개 시각" />
              <input disabled={!edit} className={INPUT} value={r.reason} onChange={(e) => upd({ reason: e.target.value })} placeholder="사유" />
            </div>
          )}
        />
        <CheckList group="resume" need={{}} ok={f.checks_ok} onOk={edit ? setOk : undefined} mode="single" />
        <div className="flex flex-wrap gap-4">{(["suspend_mgr", "suspend_wit"] as SigKey[]).map(sig)}</div>
      </Panel>

      <Panel num="04" title="작업완료" tone="done">
        <F label="작업완료 시간" required>
          <input type="datetime-local" disabled={!edit} className={`${INPUT} max-w-60`} value={f.fields.complete_time} onChange={(e) => setFld("complete_time", e.target.value)} />
        </F>
        <CheckList group="complete" need={{}} ok={f.checks_ok} onOk={edit ? setOk : undefined} mode="single" />
        <div className="flex flex-wrap gap-4">{(["complete_mgr", "complete_wit"] as SigKey[]).map(sig)}</div>
        <Hint>허가서는 작업 현장에 1부 게시 후 회수하여 보존합니다. 보존년한: 일반 1년, <b>밀폐공간 출입작업 허가서는 3년</b>.</Hint>
      </Panel>

      {permit.work_type === "화기" && (
        <Panel num="05" title="화기작업 가스농도 측정기록" sub="기준: 인화성 LEL 25% 미만 · 독성 TWA 미만">
          <Table
            head={["물질명", "측정결과", "측정시간", "측정자"]}
            rows={f.fire_logs}
            edit={edit}
            keys={["material", "result", "time", "by"]}
            onChange={(fire_logs) => setF((x) => ({ ...x, fire_logs }))}
            make={() => ({ id: rid(), material: "", result: "", time: "", by: "" })}
            addLabel="+ 측정 기록 추가"
          />
        </Panel>
      )}
      {has("confined") && (
        <Panel num="06" title="밀폐공간 출입기록" sub="O₂18~23.5% · CO₂1.5%미만 · CO 30ppm미만 · H₂S 10ppm미만">
          <Hint>(측정주기 : 작업 전, 점심식사 후, 휴식 후 등 작업에 관계된 모든 근로자가 작업장소를 떠난 후 다시 돌아와 작업하기 전)</Hint>
          <Table
            head={["입장/퇴장", "시간", "이름", "산소·유해가스 농도 측정기록", "밀폐공간 내 인원"]}
            rows={f.confined_logs}
            edit={edit}
            keys={["inout", "time", "name", "record", "count"]}
            onChange={(confined_logs) => setF((x) => ({ ...x, confined_logs }))}
            make={() => ({ id: rid(), inout: "", time: "", name: "", record: "", count: "" })}
            addLabel="+ 출입 기록 추가"
          />
        </Panel>
      )}

      <Panel num="07" title="작업자 확인서명" sub="MSDS 숙지·대피로·보호구·작업절차(위험성평가) 확인">
        <RowList
          rows={f.acks}
          edit={edit}
          onChange={(acks) => setF((x) => ({ ...x, acks }))}
          make={() => ({ id: rid(), name: "", sig: "" })}
          addLabel="+ 작업자 추가"
          grid
          render={(r, upd, i) => (
            <div className="flex flex-1 items-center gap-2">
              <span className="w-6 text-center font-mono text-xs text-gray-400">{i + 1}</span>
              <input disabled={!edit} className={`${INPUT} w-28`} value={r.name} onChange={(e) => upd({ name: e.target.value })} placeholder="성명" />
              <SignaturePad value={r.sig} onChange={(v) => upd({ sig: v })} disabled={!edit} width={150} height={44} />
            </div>
          )}
        />
      </Panel>

      {edit && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur left-[var(--sidebar-w)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              {state ? (
                <FormMessage state={state} />
              ) : missing.length ? (
                <p className="text-xs text-amber-700">완료 보고 전 필요: {missing.join(", ")}</p>
              ) : (
                <p className="text-xs text-emerald-700">✓ 필수 서명·완료 시간이 모두 입력되었습니다.</p>
              )}
            </div>
            <Button variant="secondary" disabled={pending} onClick={() => save(false)}>{pending ? "저장 중…" : "💾 현장 기록 저장"}</Button>
            <Button disabled={pending || missing.length > 0} onClick={() => save(true)} title={missing.length ? `필요: ${missing.join(", ")}` : undefined}>
              ✅ 작업완료 보고
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowList<T extends { id: string }>({ rows, onChange, make, addLabel, render, edit, grid }: {
  rows: T[];
  onChange: (rows: T[]) => void;
  make: () => T;
  addLabel: string;
  render: (row: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  edit: boolean;
  grid?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={grid ? "grid gap-2 md:grid-cols-2" : "space-y-2"}>
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
            {render(r, (patch) => onChange(rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x))), i)}
            {edit && (
              <button type="button" aria-label="삭제" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="self-start text-gray-400 hover:text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>
      {edit && (
        <button type="button" onClick={() => onChange([...rows, make()])} className="text-sm font-medium text-brand-700 hover:underline">{addLabel}</button>
      )}
    </div>
  );
}

function Table<T extends { id: string }>({ head, rows, keys, onChange, make, addLabel, edit }: {
  head: string[];
  rows: T[];
  keys: (keyof T & string)[];
  onChange: (rows: T[]) => void;
  make: () => T;
  addLabel: string;
  edit: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="w-8 border border-gray-200 py-1.5">No</th>
              {head.map((h) => (
                <th key={h} className="border border-gray-200 px-2 py-1.5">{h}</th>
              ))}
              {edit && <th className="w-8 border border-gray-200" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="border border-gray-200 text-center font-mono text-gray-400">{i + 1}</td>
                {keys.map((k) => (
                  <td key={k} className="border border-gray-200 p-0">
                    <input
                      disabled={!edit}
                      className="w-full bg-transparent px-2 py-1.5 focus:bg-brand-50 focus:outline-none"
                      value={String(r[k] ?? "")}
                      onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, [k]: e.target.value } : x)))}
                    />
                  </td>
                ))}
                {edit && (
                  <td className="border border-gray-200 text-center">
                    <button type="button" aria-label="삭제" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="text-gray-400 hover:text-red-600">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <button type="button" onClick={() => onChange([...rows, make()])} className="text-sm font-medium text-brand-700 hover:underline">{addLabel}</button>
      )}
    </div>
  );
}
