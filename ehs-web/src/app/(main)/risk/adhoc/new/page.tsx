import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { emptyJsa, jsaFromRow } from "@/lib/jsa";
import { todayKst } from "@/lib/format";
import { JsaEditor } from "../JsaEditor";

// 새 평가서 (?from=평가서ID 이면 이전 평가서를 기초 자료로 복사 · 결재는 새로)
export default async function NewJsaPage({ searchParams }: PageProps<"/risk/adhoc/new">) {
  const { from } = await searchParams;
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (mod?.level !== "write") notFound();
  const supabase = await createClient();
  const today = todayKst();

  const [depts, template, people, { data: src }] = await Promise.all([
    getDeptHeads(supabase),
    getTemplate(supabase, "risk_adhoc"),
    getPeople(supabase),
    typeof from === "string" ? supabase.from("jsa_evals").select("*").eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const initial = src ? { ...jsaFromRow(src), eval_date: today } : emptyJsa(today, me.department_id ?? "");

  return <JsaEditor id={null} evalNo={null} initial={initial} departments={depts} template={template} people={people} meId={me.id} today={today} />;
}
