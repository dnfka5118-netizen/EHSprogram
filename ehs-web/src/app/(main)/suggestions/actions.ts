"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

export type SuggestionInput = { id: string; category: string; title: string; body: string; anonymous: boolean; photos: string[] };

async function run(fn: string, args: Record<string, unknown>, message: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/suggestions", "layout");
  return { ok: true, message };
}

const args = (v: SuggestionInput) => ({ p_id: v.id, p_category: v.category, p_title: v.title, p_body: v.body, p_anonymous: v.anonymous, p_photos: v.photos });

export async function createSuggestion(v: SuggestionInput) {
  return run("create_suggestion", args(v), "의견을 올렸습니다. EHS팀이 확인 후 답변드립니다.");
}

export async function updateSuggestion(v: SuggestionInput) {
  return run("update_suggestion", args(v), "수정했습니다.");
}

// 삭제 후 첨부 사진도 지움
export async function deleteSuggestion(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_suggestion", { p_id: id });
  if (error) return { error: toMessage(error) };
  const paths = (data ?? []) as string[];
  if (paths.length) await supabase.storage.from("docs").remove(paths);
  revalidatePath("/suggestions", "layout");
  return { ok: true, message: "삭제했습니다." };
}

export async function answerSuggestion(id: string, status: string, answer: string) {
  return run("answer_suggestion", { p_id: id, p_status: status, p_answer: answer }, "처리했습니다. 작성자에게 알림이 갑니다.");
}

export async function addSuggestionComment(id: string, body: string) {
  return run("add_suggestion_comment", { p_id: id, p_body: body }, "댓글을 남겼습니다.");
}
