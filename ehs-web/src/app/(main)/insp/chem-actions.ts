"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";

// 유해화학물질 자체점검 : 이번 주(또는 고른 날의 주) 점검대장 열기 — 없으면 만듦
export async function openChemCheck(groupId: string, date: string | null): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_chem_check", { p_group: groupId, p_date: date });
  if (error) return { error: toMessage(error) };
  return { id: data as string };
}

// 점검 내용 저장 (빈 칸 · 비고 검사, 정밀 재점검 필요 → 지적사항)
export async function saveChemCheck(
  id: string,
  date: string,
  time: string,
  results: { item_id: string; place_id: string; result: string }[],
  notes: { item_id: string; note: string }[],
  subReason: string | null, // 대체 점검 사유 (점검자 본인이면 null)
): Promise<{ findings: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_chem_check", { p_id: id, p_date: date, p_time: time, p_results: results, p_notes: notes, p_sub_reason: subReason });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/insp/chem", "layout");
  return { findings: (data as { findings: number }).findings };
}

// 상신 : 점검자 → EHS부서장 → 해당 부서장
export async function submitChemCheck(id: string, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_chem_check", { p_id: id, p_steps: steps });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true };
}
