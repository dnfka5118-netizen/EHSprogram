import { emptyFieldRecord, emptyFields, emptyPerson, rid, type PermitApply, type PermitField } from "./permit";

// DB 행(permits) → 화면 데이터
/* eslint-disable @typescript-eslint/no-explicit-any */
const ts = (v: unknown) => (v ? String(v).replace(" ", "T").slice(0, 16) : "");

export function permitFromRow(row: Record<string, any>): PermitApply {
  const people = (v: any) => (Array.isArray(v) && v.length ? v.map((m: any) => ({ ...emptyPerson(), ...m })) : [emptyPerson()]);
  return {
    department_id: row.department_id ?? "",
    psm: row.psm === "해당" ? "해당" : "미해당",
    preop: row.preop === "해당" ? "해당" : "미해당",
    work_type: row.work_type ?? "",
    supp: row.supp ?? [],
    grade: row.grade ?? "",
    work_name: row.work_name ?? "",
    work_place: row.work_place ?? "",
    company_name: row.company_name ?? "",
    start_dt: ts(row.start_dt),
    end_dt: ts(row.end_dt),
    tags: Array.isArray(row.tags) && row.tags.length ? row.tags : [{ name: "", tag: "" }],
    managers: people(row.managers),
    witnesses: people(row.witnesses),
    risk_eval_id: row.risk_eval_id ?? "",
    checks: row.checks ?? {},
    fields: { ...emptyFields(), ...(row.fields ?? {}) },
  };
}

export function fieldFromRow(row: Record<string, any>): PermitField {
  const f = row.field ?? {};
  const base = emptyFieldRecord();
  const withIds = (arr: any, fallback: any[]) => (Array.isArray(arr) && arr.length ? arr.map((x: any) => ({ id: x.id ?? rid(), ...x })) : fallback);
  return {
    checks_ok: f.checks_ok ?? {},
    sigs: f.sigs ?? {},
    extends: withIds(f.extends, []),
    suspends: withIds(f.suspends, []),
    fire_logs: withIds(f.fire_logs, base.fire_logs),
    confined_logs: withIds(f.confined_logs, base.confined_logs),
    acks: withIds(f.acks, base.acks),
    fields: { ...base.fields, ...(f.fields ?? {}) },
  };
}
