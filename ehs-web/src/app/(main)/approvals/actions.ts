"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

async function run(fn: string, args: Record<string, unknown>, message: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function approveStep(approvalId: string, comment: string) {
  return run("approve_step", { p_approval: approvalId, p_comment: comment }, "결재했습니다.");
}

export async function rejectStep(approvalId: string, comment: string) {
  return run("reject_step", { p_approval: approvalId, p_comment: comment }, "반려했습니다.");
}

export async function withdrawApproval(approvalId: string) {
  return run("withdraw_approval", { p_approval: approvalId }, "상신을 취소했습니다.");
}
