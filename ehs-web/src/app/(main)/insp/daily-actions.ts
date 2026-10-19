"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";

// 관리감독자 일일점검 저장 (QR 화면) — 검사·지적사항 생성은 DB submit_daily_check
export async function submitDailyCheck(token: string, results: unknown[], scannedAt: string): Promise<{ findings: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_daily_check", { p_token: token, p_results: results, p_scanned_at: scannedAt });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { findings: (data as { findings: number }).findings };
}

// 월간 일지 열기 (없으면 만들기)
export async function openDailyLog(areaId: string, ym: string): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_daily_log", { p_area: areaId, p_ym: ym });
  if (error) return { error: toMessage(error) };
  return { id: data as string };
}

// 월간 일지 상신 (공통 전자결재)
export async function submitDailyLog(id: string, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_daily_log", { p_id: id, p_steps: steps });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true };
}
