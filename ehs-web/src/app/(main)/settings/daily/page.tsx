import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { saveDailyArea, saveDailyPoint } from "../actions";
import { AreaEditor } from "./AreaEditor";
import { PointEditor } from "./PointEditor";
import { AreaTable, type AreaRow } from "./AreaTable";
import { ReissueButton } from "./ReissueButton";
import { POINT_GRID, type DailyArea, type DailyForm, type DailyPoint } from "@/lib/daily";

// 환경설정 → 일일점검 구역 : 관리감독자별 담당 Area(양식 A~D · 담당 장소) + 현장 QR 지점
export default async function DailyAreasPage() {
  const supabase = await createClient();
  const [{ data: areas }, { data: members }, { data: links }, { data: pts }, { data: forms }, { data: depts }, { data: locs }, { data: people }] = await Promise.all([
    supabase.from("daily_areas").select("*").order("sort_order").order("name"),
    supabase.from("daily_area_members").select("area_id, user_id, profiles(name)"),
    supabase.from("daily_area_points").select("area_id, point_id"),
    supabase.from("daily_points").select("*").order("sort_order").order("name"),
    supabase.from("daily_forms").select("*").order("sort_order"),
    supabase.from("departments").select("id, name").eq("is_active", true).is("parent_id", null).order("sort_order"),
    supabase.from("locations").select("id, name, sub_locations(id, name, is_active, sort_order)").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id, name, position").eq("is_active", true).order("name"),
  ]);
  const list = (areas ?? []) as DailyArea[];
  const pointList = (pts ?? []) as DailyPoint[];
  const formList = (forms ?? []) as DailyForm[];
  const mem = (members ?? []) as unknown as { area_id: string; user_id: string; profiles: { name: string } | null }[];
  const lk = (links ?? []) as { area_id: string; point_id: string }[];
  const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const pointName = new Map(pointList.map((p) => [p.id, p.name]));
  const qrForm = new Set(formList.filter((f) => f.use_qr).map((f) => f.code));
  const locList = ((locs ?? []) as { id: string; name: string; sub_locations: { id: string; name: string; is_active: boolean; sort_order: number }[] }[]).map((l) => ({
    id: l.id,
    name: l.name,
    subs: l.sub_locations.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order),
  }));
  const common = { forms: formList, departments: depts ?? [], points: pointList.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name })), people: people ?? [], action: saveDailyArea };
  // 표 : 부서 → 이름 순
  const rows: AreaRow[] = list
    .map((a) => {
      const pointIds = lk.filter((x) => x.area_id === a.id).map((x) => x.point_id);
      return {
        ...a,
        dept: a.department_id ? (deptName.get(a.department_id) ?? "") : "",
        where: qrForm.has(a.form_code) ? pointIds.map((p) => pointName.get(p)).join(", ") : (a.area_text ?? "QR 없음"),
        who: mem.filter((m) => m.area_id === a.id).map((m) => m.profiles?.name ?? "").join(", "),
        memberIds: mem.filter((m) => m.area_id === a.id).map((m) => m.user_id),
        pointIds,
        noPoint: qrForm.has(a.form_code) && pointIds.length === 0,
      };
    })
    .sort((x, y) => x.dept.localeCompare(y.dept, "ko") || x.who.localeCompare(y.who, "ko"));
  const usedBy = (pid: string) => lk.filter((x) => x.point_id === pid).map((x) => list.find((a) => a.id === x.area_id)?.name ?? "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 rounded-md bg-blue-50 px-3 py-2 text-sm break-keep text-blue-900">
          관리감독자마다 <b>담당 Area</b>(양식 A~D형 · 담당 장소)를 정합니다. 점검표와 월간 일지는 <b>사람별 1장</b>이고, 담당 장소에 붙은 QR 중 아무거나 찍으면 그 사람의 점검표가 열립니다. C·D형은 QR 없이 [점검하기]로 점검합니다.
        </p>
        <Link href="/settings/daily/forms" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
          양식 · 점검 항목 수정
        </Link>
      </div>

      <Card title={`관리감독자 담당 Area (${list.length})`}>
        <AreaTable rows={rows} {...common} />
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-brand-800">+ 담당 Area 추가</summary>
          <div className="mt-3">
            <AreaEditor area={null} memberIds={[]} pointIds={[]} {...common} />
          </div>
        </details>
      </Card>

      <Card
        title={`QR 지점 (${pointList.length})`}
        actions={
          pointList.length > 0 && (
            <Link href="/print/daily-qr" target="_blank" className="rounded-md bg-brand-800 px-3 py-1.5 text-sm text-white hover:bg-brand-900">
              🖶 QR 전체 인쇄
            </Link>
          )
        }
      >
        <p className="mb-3 text-xs break-keep text-gray-500">현장(세부장소)마다 붙이는 QR 입니다. 여러 관리감독자가 같은 QR 을 같이 쓸 수 있습니다. 부적합은 찍은 QR 의 장소로 등록됩니다.</p>
        <div className={`${POINT_GRID} hidden border-b border-gray-200 pb-1 text-xs font-medium text-gray-500 sm:grid`}>
          <span>QR 이름</span>
          <span>장소</span>
          <span>세부장소</span>
          <span>순서</span>
          <span className="text-center">사용</span>
          <span />
        </div>
        <ul className="divide-y divide-gray-100">
          {pointList.map((p) => {
            const who = usedBy(p.id);
            return (
              <li key={p.id}>
                <PointEditor
                  point={p}
                  locations={locList}
                  action={saveDailyPoint}
                  extra={
                    <>
                      <span className={`px-1 text-xs whitespace-nowrap ${who.length ? "text-gray-500" : "text-red-600"}`} title={who.join(", ")}>
                        담당 {who.length}
                      </span>
                      <Link href={`/print/daily-qr?point=${p.id}`} target="_blank" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        🖶
                      </Link>
                      <ReissueButton pointId={p.id} />
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <PointEditor point={null} locations={locList} action={saveDailyPoint} />
        </div>
      </Card>
    </div>
  );
}
