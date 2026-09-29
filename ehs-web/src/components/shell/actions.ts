"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";

export async function saveFavorites(hrefs: string[]): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_favorites", { p_items: hrefs });
  if (error) return { error: toMessage(error) };
  revalidatePath("/", "layout");
  return {};
}
