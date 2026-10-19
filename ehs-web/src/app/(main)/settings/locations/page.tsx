import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { NameRow, ROWS_GRID } from "../NameRow";
import { saveLocation, saveSubLocation } from "../actions";
import type { Location, Site, SubLocation } from "@/lib/types";

export default async function LocationsPage({ searchParams }: PageProps<"/settings/locations">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("*").order("sort_order");
  const siteList = (sites ?? []) as Site[];
  const siteId = (typeof sp.site === "string" && sp.site) || siteList[0]?.id || "";

  const { data: locs } = await supabase.from("locations").select("*, sub_locations(*)").eq("site_id", siteId).order("sort_order");
  const locations = (locs ?? []) as (Location & { sub_locations: SubLocation[] })[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {siteList.map((s) => (
          <Link
            key={s.id}
            href={`/settings/locations?site=${s.id}`}
            className={`rounded-full border px-3 py-1 text-sm ${s.id === siteId ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <Card title="장소 추가">
        <div className="max-w-md">
          <NameRow action={saveLocation} hidden={{ site_id: siteId }} placeholder="장소명 (예: HBC-C3)" />
        </div>
      </Card>

      {locations.map((l) => (
        <Card key={l.id}>
          <div className="mb-2 max-w-md">
            <NameRow action={saveLocation} id={l.id} name={l.name} sortOrder={l.sort_order} isActive={l.is_active} bold deleteWarning="세부장소도 함께 삭제됩니다." />
          </div>
          <p className="mb-1 text-xs text-gray-500">세부장소 ({l.sub_locations.length})</p>
          <div className={ROWS_GRID}>
            {l.sub_locations
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <NameRow key={s.id} action={saveSubLocation} id={s.id} name={s.name} sortOrder={s.sort_order} isActive={s.is_active} />
              ))}
            <NameRow action={saveSubLocation} hidden={{ location_id: l.id }} placeholder="세부장소 추가" />
          </div>
        </Card>
      ))}
    </div>
  );
}
