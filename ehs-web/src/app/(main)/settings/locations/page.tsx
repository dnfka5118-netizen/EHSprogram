import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
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
            className={`rounded-full border px-3 py-1 text-sm ${s.id === siteId ? "border-emerald-800 bg-emerald-800 text-white" : "border-gray-300 bg-white"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <Card title="장소 추가">
        <ActionForm action={saveLocation} resetOnSuccess className="flex flex-wrap gap-2">
          <input type="hidden" name="site_id" value={siteId} />
          <Input name="name" placeholder="장소명 (예: HBC-C3)" className="max-w-xs" />
          <Input name="sort_order" type="number" placeholder="순서" className="w-24" />
          <SubmitButton>추가</SubmitButton>
        </ActionForm>
      </Card>

      {locations.map((l) => (
        <Card
          key={l.id}
          title={
            <ActionForm action={saveLocation} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={l.id} />
              <Input name="name" defaultValue={l.name} className="w-48 font-semibold" />
              <Input name="sort_order" type="number" defaultValue={l.sort_order} className="w-20" />
              <label className="flex items-center gap-1 text-sm font-normal">
                <input type="checkbox" name="is_active" defaultChecked={l.is_active} className="h-4 w-4" /> 사용
              </label>
              <SubmitButton variant="secondary" className="px-2 py-1">저장</SubmitButton>
            </ActionForm>
          }
        >
          <p className="mb-2 text-xs text-gray-500">세부장소</p>
          <div className="space-y-2">
            {l.sub_locations
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <ActionForm key={s.id} action={saveSubLocation} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <Input name="name" defaultValue={s.name} className="w-48" />
                  <Input name="sort_order" type="number" defaultValue={s.sort_order} className="w-20" />
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="is_active" defaultChecked={s.is_active} className="h-4 w-4" /> 사용
                  </label>
                  <SubmitButton variant="secondary" className="px-2 py-1">저장</SubmitButton>
                </ActionForm>
              ))}
            <ActionForm action={saveSubLocation} resetOnSuccess className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
              <input type="hidden" name="location_id" value={l.id} />
              <Input name="name" placeholder="세부장소 추가" className="w-48" />
              <Input name="sort_order" type="number" placeholder="순서" className="w-20" />
              <SubmitButton variant="secondary" className="px-2 py-1">추가</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      ))}
    </div>
  );
}
