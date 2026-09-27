"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import { thumbPathOf } from "@/lib/photo-path";
import type { ActionState } from "@/lib/types";

export async function createInspection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const slug = String(formData.get("slug"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_inspection", {
    p_module: String(formData.get("module")),
    p_site: String(formData.get("site")),
    p_date: String(formData.get("date")),
    p_title: String(formData.get("title") ?? "").trim(),
    p_inspectors: String(formData.get("inspectors") ?? ""),
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) return { error: toMessage(error) };
  redirect(`/insp/${slug}/${data}`);
}

export type NewFinding = {
  id: string;
  inspectionId: string;
  locationId: string | null;
  subLocationId: string | null;
  subLocationText: string | null;
  typeId: string | null;
  problem: string;
  departmentId: string;
  photos: string[];
};

export async function createFinding(input: NewFinding): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_finding", {
    p_id: input.id,
    p_inspection: input.inspectionId,
    p_location: input.locationId,
    p_sub_location: input.subLocationId,
    p_sub_location_text: input.subLocationText,
    p_type: input.typeId,
    p_problem: input.problem,
    p_department: input.departmentId,
    p_photos: input.photos,
  });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true };
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
