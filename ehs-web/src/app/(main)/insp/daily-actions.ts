"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";

// 관리감독자 일일점검 저장 (QR 화면) — 검사·지적사항 생성은 DB submit_daily_check
//   대체 점검이면 subFor(대신한 담당자) · subReason(휴가·외근 등)
export async function submitDailyCheck(token: string, results: unknown[], scannedAt: string, subFor: string | null, subReason: string, areaId: string | null): Promise<{ findings: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_daily_check", { p_token: token, p_results: results, p_scanned_at: scannedAt, p_sub_for: subFor, p_sub_reason: subReason, p_area: areaId });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { findings: (data as { findings: number }).findings };
}

// 소급 입력 (월간 일지에서 빠진 날) — 그 달 일지 상신 전까지, 지표에서는 미진행
export async function submitDailyBackfill(areaId: string, day: string, results: unknown[], reason: string): Promise<{ findings: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_daily_backfill", { p_area: areaId, p_day: day, p_results: results, p_reason: reason });
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

// 월간 일지 → 부서장 제출 · 제출 취소 · 일괄 승인 · 반려 (0029)
async function runLog(fn: string, args: Record<string, unknown>): Promise<{ ok: true; n?: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true, n: typeof data === "number" ? data : undefined };
}

export async function submitLogToHead(id: string) {
  return runLog("submit_daily_log_to_head", { p_log: id });
}

export async function cancelLogSubmit(id: string) {
  return runLog("cancel_daily_log_submit", { p_log: id });
}

export async function approveLogs(ids: string[]) {
  return runLog("approve_daily_logs", { p_logs: ids });
}

export async function rejectLog(id: string, reason: string) {
  return runLog("reject_daily_log", { p_log: id, p_reason: reason });
}
