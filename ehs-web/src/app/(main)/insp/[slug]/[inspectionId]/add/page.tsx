import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FindingForm } from "./FindingForm";
import type { Department, FindingType, Inspection, Location, SubLocation } from "@/lib/types";

export default async function AddFindingPage({ params }: PageProps<"/insp/[slug]/[inspectionId]/add">) {
  const { slug, inspectionId } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level !== "write") notFound();

  const supabase = await createClient();
  const { data: insp } = await supabase.from("inspections").select("*").eq("id", inspectionId).maybeSingle();
  if (!insp) notFound();
  const inspection = insp as Inspection;

  const [{ data: locations }, { data: types }, { data: depts }, { count }] = await Promise.all([
    supabase.from("locations").select("*, sub_locations(*)").eq("site_id", inspection.site_id).eq("is_active", true).order("sort_order"),
    supabase.from("finding_types").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").eq("site_id", inspection.site_id).eq("is_active", true).order("sort_order"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("inspection_id", inspectionId),
  ]);

  const locs = ((locations ?? []) as (Location & { sub_locations: SubLocation[] })[]).map((l) => ({
    ...l,
    sub_locations: l.sub_locations.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link href={`/insp/${slug}/${inspectionId}`} className="text-sm text-gray-600 hover:underline">
        ← {inspection.title} (등록 {count ?? 0}건)
      </Link>
      <Card title="지적사항 등록">
        <FindingForm
          inspectionId={inspectionId}
          backHref={`/insp/${slug}/${inspectionId}`}
          locations={locs}
          types={(types ?? []) as FindingType[]}
          departments={(depts ?? []) as Department[]}
        />
      </Card>
    </div>
  );
}
