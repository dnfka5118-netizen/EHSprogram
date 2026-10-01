import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { todayKst } from "@/lib/format";
import { inspectorLabel } from "@/lib/rank";
import { NewInspectionForm } from "./NewInspectionForm";
import type { Site } from "@/lib/types";
import type { Person } from "./ParticipantPicker";

export default async function NewInspectionPage({ params }: PageProps<"/insp/[slug]/new">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level !== "write") notFound();
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: sites }, { data: users }] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id, name, position, departments!profiles_department_fk(name)").eq("is_active", true).order("name"),
  ]);
  const list = (sites ?? []) as Site[];
  const people: Person[] = ((users ?? []) as unknown as { id: string; name: string; position: string | null; departments: { name: string } | null }[]).map((u) => ({
    id: u.id,
    name: u.name,
    position: u.position,
    dept: u.departments?.name ?? null,
  }));

  return (
    <Card title={`${mod.name} · 점검 등록`} className="mx-auto max-w-2xl">
      <NewInspectionForm
        slug={slug}
        moduleCode={mod.code}
        moduleName={mod.name}
        sites={list}
        defaultSite={profile.site_id ?? list[0]?.id ?? ""}
        today={todayKst()}
        people={people}
        inspector={inspectorLabel(mod.code, profile)}
      />
    </Card>
  );
}
