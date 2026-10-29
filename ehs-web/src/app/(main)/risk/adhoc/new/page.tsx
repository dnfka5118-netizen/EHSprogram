import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { emptyJsa, jsaFromRow, type JsaForm } from "@/lib/jsa";
import { draftToJsaSteps, jsaFromRef, type RiskRef } from "@/lib/risk-ref";
import { aiInput, loadAiDraft } from "@/lib/risk-draft";
import { todayKst } from "@/lib/format";
import { JsaEditor } from "../JsaEditor";

// 새 평가서 (?from=평가서ID 이면 이전 평가서를 기초 자료로 복사 · 결재는 새로)
//   ?ref=참고자료ID : AI 위험성평가 작성에서 고른 과거 JSA · 타사 참고 하나 그대로 (risk_refs)
//   ?ai=1&…        : AI 위험성평가 작성 초안 (작업 설명 q · 장비 eq · 물질 mat · 조건 c, 또는 mode=sop&sop=절차서ID · 채택한 빠진 단계 add)
export default async function NewJsaPage({ searchParams }: PageProps<"/risk/adhoc/new">) {
  const sp = await searchParams;
  const { from, ref, ai } = sp;
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (mod?.level !== "write") notFound();
  const supabase = await createClient();
  const today = todayKst();
  const input = ai === "1" ? aiInput(sp) : null;

  const [depts, template, people, { data: src }, { data: refRow }, aiResult] = await Promise.all([
    getDeptHeads(supabase),
    getTemplate(supabase, "risk_adhoc", me.id),
    getPeople(supabase),
    typeof from === "string" ? supabase.from("jsa_evals").select("*").eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
    typeof ref === "string" && /^\d+$/.test(ref)
      ? supabase.from("risk_refs").select("id, source, title, area, group_name, year, meta, steps").eq("id", ref).maybeSingle()
      : Promise.resolve({ data: null }),
    input ? loadAiDraft(supabase, input) : Promise.resolve(null),
  ]);
  const base = emptyJsa(today, me.department_id ?? "");
  let initial: JsaForm = src ? { ...jsaFromRow(src), eval_date: today } : base;
  if (refRow) initial = jsaFromRef(base, { ...(refRow as Omit<RiskRef, "score">), score: 0 });
  if (aiResult && input) {
    const { draft, sop } = aiResult;
    initial = {
      ...base,
      work_name: sop ? sop.title : input.q.split("\n")[0].slice(0, 100),
      sop_no: sop?.sop_no ? `${sop.sop_no} Rev.${sop.rev}` : "",
      work_area: draft.meta.area,
      material: input.mat,
      ppe: sop?.ppe ?? draft.meta.ppe,
      equip: [input.eq, draft.meta.equip].filter(Boolean).join(", "),
      safety_equip: draft.meta.safety_equip,
      req_docs: draft.meta.docs,
      steps: draftToJsaSteps(draft, input.add),
    };
  }

  return <JsaEditor id={null} evalNo={null} initial={initial} departments={depts} template={template} people={people} meId={me.id} today={today} />;
}
