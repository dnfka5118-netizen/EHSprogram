"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { PermitApply, PermitField } from "@/lib/permit";

type Result = { error?: string; id?: string; message?: string };

export async function savePermit(id: string | null, data: PermitApply): Promise<Result> {
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("save_permit", { p_id: id, p_data: data });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  return { id: newId as string, message: "저장했습니다." };
}

export async function submitPermit(id: string | null, data: PermitApply, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<Result> {
  const saved = await savePermit(id, data);
  if (saved.error || !saved.id) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_permit", { p_id: saved.id, p_steps: steps });
  if (error) return { error: toMessage(error), id: saved.id };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: saved.id, message: "상신했습니다." };
}

// 현장 기록 저장 : base = 화면을 연(마지막 저장) 시각 — 그 뒤 다른 기기가 저장했으면 DB 가 합쳐서 저장
export async function savePermitField(id: string, field: PermitField, base: string | null): Promise<Result & { field?: PermitField; savedAt?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_permit_field", { p_id: id, p_field: field, p_base: base });
  if (error) return { error: toMessage(error) };
  revalidatePath(`/permit/${id}`, "layout");
  revalidatePath("/permit");
  const r = data as { field: PermitField; saved_at: string; merged: boolean };
  return {
    id,
    field: r.field,
    savedAt: r.saved_at,
    message: r.merged ? "다른 기기에서 먼저 저장한 서명·기록과 합쳐서 저장했습니다. 화면을 확인해 주세요." : "현장 기록을 저장했습니다.",
  };
}

export async function completePermit(id: string, field: PermitField, base: string | null): Promise<Result> {
  const saved = await savePermitField(id, field, base);
  if (saved.error) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_permit", { p_id: id });
  if (error) return { error: toMessage(error), id };
  revalidatePath("/", "layout");
  return { id, message: "작업완료 처리했습니다." };
}

export type TbmInput = { tbm_dt: string; work_dt: string; work_name: string; content: string; place: string; leader: string; photo_path: string | null };

export async function savePermitTbm(id: string, data: TbmInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_permit_tbm", { p_id: id, p_data: data });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  return { id, message: "TBM 실시 기록이 저장되었습니다." };
}

export async function deletePermit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_permit", { p_id: id });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  redirect("/permit");
}
