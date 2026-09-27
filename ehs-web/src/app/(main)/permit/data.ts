import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsaOption } from "./PermitEditor";

// 허가서에 연결할 수 있는 위험성평가 : 결재 완료 · 최근 2년
export async function getJsaOptions(supabase: SupabaseClient): Promise<JsaOption[]> {
  const since = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("jsa_overview")
    .select("id, eval_no, eval_date, department_name, work_name, max_risk")
    .eq("approval_status", "approved")
    .gte("eval_date", since)
    .order("eval_date", { ascending: false })
    .limit(200);
  return (data ?? []) as JsaOption[];
}
