"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

// 관리자 : 지난해 점검 지표 다시 확정 (이전 확정본도 기록으로 남음)
export async function confirmKpi(year: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_kpi", { p_year: year, p_note: String(formData.get("note") ?? "") });
  if (error) return { error: error.message };
  revalidatePath("/insp/kpi");
  return { ok: true, message: `${year}년 지표를 다시 확정했습니다.` };
}
