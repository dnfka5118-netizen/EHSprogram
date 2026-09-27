import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { todayKst } from "@/lib/format";
import { NewInspectionForm } from "./NewInspectionForm";
import type { Site } from "@/lib/types";

export default async function NewInspectionPage({ params }: PageProps<"/insp/[slug]/new">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level !== "write") notFound();
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("*").eq("is_active", true).order("sort_order");
  const list = (sites ?? []) as Site[];

  return (
    <Card title={`${mod.name} · 점검 등록`} className="mx-auto max-w-2xl">
      <NewInspectionForm
        slug={slug}
        moduleCode={mod.code}
        moduleName={mod.name}
        sites={list}
        defaultSite={profile.site_id ?? list[0]?.id ?? ""}
        today={todayKst()}
      />
    </Card>
  );
}
