"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import { thumbPathOf } from "@/lib/photo-path";
import type { ActionState } from "@/lib/types";
import type { FindingPayload } from "./FindingFields";

// 점검 등록 = 지적사항 1건. 사업장·점검일·점검자·회차는 DB(register_finding)가 정함
export async function registerFinding(module: string, inspectors: string, finding: FindingPayload): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_finding", { p_module: module, p_inspectors: inspectors, p_finding: finding });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: data as string };
}

export async function deleteFinding(findingId: string, backTo: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_finding", { p_finding: findingId });
  if (error) return { error: toMessage(error) };
  const paths = (data as string[]) ?? [];
  if (paths.length) await supabase.storage.from("findings").remove([...paths, ...paths.map(thumbPathOf)]);
  revalidatePath("/", "layout");
  redirect(backTo);
}
