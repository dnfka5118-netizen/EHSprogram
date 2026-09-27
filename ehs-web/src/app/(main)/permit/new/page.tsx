import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { emptyPermit } from "@/lib/permit";
import { permitFromRow } from "@/lib/permit-row";
import { PermitEditor } from "../PermitEditor";
import { getJsaOptions } from "../data";
import { nowKstLocal } from "@/lib/format";

// 새 허가서 (?from=허가서ID 이면 이전 허가서를 기초 자료로 · 결재·서명은 새로)
export default async function NewPermitPage({ searchParams }: PageProps<"/permit/new">) {
  const { from } = await searchParams;
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "permit");
  if (mod?.level !== "write" || me.user_type !== "employee") notFound();
  const supabase = await createClient();

  const [depts, template, people, jsaOptions, { data: src }] = await Promise.all([
    getDeptHeads(supabase),
    getTemplate(supabase, "permit"),
    getPeople(supabase),
    getJsaOptions(supabase),
    typeof from === "string" ? supabase.from("permits").select("*").eq("id", from).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const fresh = emptyPermit(nowKstLocal(), me.department_id ?? "");
  const initial = src ? { ...permitFromRow(src), start_dt: fresh.start_dt, end_dt: fresh.end_dt, risk_eval_id: "" } : fresh;

  return <PermitEditor id={null} permitNo={null} initial={initial} departments={depts} template={template} people={people} meId={me.id} jsaOptions={jsaOptions} />;
}
