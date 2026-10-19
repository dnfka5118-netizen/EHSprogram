import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { saveDailyArea, saveDailyPoint } from "../actions";
import { AreaEditor } from "./AreaEditor";
import { PointEditor } from "./PointEditor";
import { ReissueButton } from "./ReissueButton";
import type { DailyArea, DailyForm, DailyPoint } from "@/lib/daily";

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
        <ul className="divide-y divide-gray-100">
          {list.map((a) => {
            const names = mem.filter((m) => m.area_id === a.id).map((m) => m.profiles?.name ?? "");
            const myPts = lk.filter((x) => x.area_id === a.id).map((x) => x.point_id);
            return (
              <li key={a.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <b className={`font-medium ${a.is_active ? "" : "text-gray-400 line-through"}`}>{a.name}</b>
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-900">{a.form_code}형</span>
                    {a.department_id && <span className="text-xs text-gray-500">{deptName.get(a.department_id)}</span>}
                    {!names.length && <span className="text-xs text-red-600">관리감독자 없음</span>}
                    <span className="basis-full text-xs break-keep text-gray-600 sm:basis-auto">
                      {qrForm.has(a.form_code) ? (myPts.length ? myPts.map((p) => pointName.get(p)).join(", ") : <span className="text-red-600">담당 장소 QR 없음</span>) : (a.area_text ?? "QR 없음")}
                    </span>
                  </summary>
                  <div className="mt-3 border-l-2 border-gray-100 pl-3">
                    <AreaEditor area={a} memberIds={mem.filter((m) => m.area_id === a.id).map((m) => m.user_id)} pointIds={myPts} {...common} />
                  </div>
                </details>
              </li>
            );
          })}
          {list.length === 0 && <li className="py-3 text-sm text-gray-500">아직 등록된 담당 Area 가 없습니다.</li>}
        </ul>
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
        <ul className="divide-y divide-gray-100">
          {pointList.map((p) => (
            <li key={p.id} className="space-y-1.5 py-2">
              <PointEditor point={p} locations={locList} action={saveDailyPoint} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="min-w-0 flex-1 break-keep">담당 : {usedBy(p.id).join(", ") || <span className="text-red-600">없음</span>}</span>
                <Link href={`/print/daily-qr?point=${p.id}`} target="_blank" className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50">
                  🖶 인쇄
                </Link>
                <ReissueButton pointId={p.id} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <PointEditor point={null} locations={locList} action={saveDailyPoint} />
        </div>
      </Card>
    </div>
  );
}
