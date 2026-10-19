import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { todayKst } from "@/lib/format";
import { inspectorLabel } from "@/lib/rank";
import { NewInspectionForm } from "./NewInspectionForm";
import { NoFindingButton } from "./NoFindingButton";
import type { Department, FindingType, Location, SubLocation } from "@/lib/types";
import type { Person } from "./ParticipantPicker";

// 점검 등록 : 사진 → (사업장·점검일·점검자 고정) → 장소 → 세부장소 → 유형 → 문제점 → 조치 요청 부서
export default async function NewInspectionPage({ params }: PageProps<"/insp/[slug]/new">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level !== "write") notFound();
  const session = await getSession();
  if (!session) notFound();
  const { profile, siteName } = session;

  if (!profile.site_id) {
    return (
      <Card title={`${mod.name} · 점검 등록`} className="mx-auto max-w-2xl">
        <p className="text-sm text-gray-600">사업장이 지정되지 않은 계정입니다. 관리자에게 환경설정 → 사용자에서 사업장 지정을 요청해 주세요.</p>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ data: users }, { data: locations }, { data: types }, { data: depts }, { count: checkedToday }] = await Promise.all([
    supabase.from("profiles").select("id, name, position, departments!profiles_department_fk(name)").eq("is_active", true).order("name"),
    supabase.from("locations").select("*, sub_locations(*)").eq("site_id", profile.site_id).eq("is_active", true).order("sort_order"),
    supabase.from("finding_types").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").eq("site_id", profile.site_id).eq("is_active", true).is("parent_id", null).order("sort_order"), // 조치 요청은 부서(팀)까지
    supabase.from("inspection_checks").select("id", { count: "exact", head: true }).eq("module_code", mod.code).eq("user_id", profile.id).eq("done_on", todayKst()),
  ]);
  const people: Person[] = ((users ?? []) as unknown as { id: string; name: string; position: string | null; departments: { name: string } | null }[]).map((u) => ({
    id: u.id,
    name: u.name,
    position: u.position,
    dept: u.departments?.name ?? null,
  }));
  const locs = ((locations ?? []) as (Location & { sub_locations: SubLocation[] })[]).map((l) => ({
    ...l,
    sub_locations: l.sub_locations.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card title={`${mod.name} · 점검 등록`}>
        <NewInspectionForm
          slug={slug}
          moduleCode={mod.code}
          siteName={siteName ?? ""}
          today={todayKst()}
          inspector={inspectorLabel(mod.code, profile)}
          people={people}
          locations={locs}
          types={(types ?? []) as FindingType[]}
          departments={(depts ?? []) as Department[]}
        />
      </Card>
      <Card title="지적사항이 없나요?">
        <p className="mb-2 text-sm break-keep text-gray-600">점검을 했지만 지적할 것이 없으면 아래 버튼을 눌러 주세요. 점검 실시로 기록됩니다.</p>
        <NoFindingButton moduleCode={mod.code} doneToday={(checkedToday ?? 0) > 0} />
      </Card>
    </div>
  );
}
