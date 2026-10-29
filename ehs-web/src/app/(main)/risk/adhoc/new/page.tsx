import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { emptyJsa, jsaFromRow, type JsaForm } from "@/lib/jsa";
import { draftFromSop, jsaFromRef, sopQuery, type RiskRef } from "@/lib/risk-ref";
import type { SopStep } from "@/lib/sop";
import { todayKst } from "@/lib/format";
import { JsaEditor } from "../JsaEditor";

// 새 평가서 (?from=평가서ID 이면 이전 평가서를 기초 자료로 복사 · 결재는 새로)
//   ?ref=참고자료ID : AI 위험성평가 작성에서 고른 과거 JSA · 타사 참고 (risk_refs)
//   ?sop=절차서ID   : 절차서 단계 + 단계마다 비슷한 과거 위험요인
export default async function NewJsaPage({ searchParams }: PageProps<"/risk/adhoc/new">) {
  const { from, ref, sop } = await searchParams;
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (mod?.level !== "write") notFound();
  const supabase = await createClient();
  const today = todayKst();

  const [depts, template, people, { data: src }, { data: refRow }, { data: sopRow }] = await Promise.all([
    getDeptHeads(supabase),
    getTemplate(supabase, "risk_adhoc", me.id),
    getPeople(supabase),
    typeof from === "string" ? supabase.from("jsa_evals").select("*").eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
    typeof ref === "string" && /^\d+$/.test(ref)
      ? supabase.from("risk_refs").select("id, source, title, area, group_name, year, meta, steps").eq("id", ref).maybeSingle()
      : Promise.resolve({ data: null }),
    typeof sop === "string" ? supabase.from("sop_docs").select("id, sop_no, rev, title, process_name, ppe, steps").eq("id", sop).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const base = emptyJsa(today, me.department_id ?? "");
  let initial: JsaForm = src ? { ...jsaFromRow(src), eval_date: today } : base;
  if (refRow) initial = jsaFromRef(base, { ...(refRow as Omit<RiskRef, "score">), score: 0 });
  if (sopRow) {
    const steps = (sopRow.steps ?? []) as SopStep[];
    const q = sopQuery(sopRow.title, sopRow.process_name, steps);
    const found = await Promise.all((["jsa", "ext"] as const).map((s) => supabase.rpc("search_risk_refs", { p_q: q, p_source: s, p_limit: 15 })));
    const draft = draftFromSop(
      steps,
      found.flatMap((r) => (r.data ?? []) as RiskRef[]),
    );
    initial = {
      ...base,
      work_name: sopRow.title,
      sop_no: sopRow.sop_no ? `${sopRow.sop_no} Rev.${sopRow.rev}` : "",
      ppe: sopRow.ppe ?? "",
      steps: draft.length ? draft.map(({ cat, content, safe, hazards, control }) => ({ cat, content, safe, hazards, control })) : base.steps,
    };
  }

  return <JsaEditor id={null} evalNo={null} initial={initial} departments={depts} template={template} people={people} meId={me.id} today={today} />;
}
