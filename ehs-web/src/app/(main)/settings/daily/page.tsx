import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { saveDailyArea } from "../actions";
import { AreaEditor } from "./AreaEditor";
import { ReissueButton } from "./ReissueButton";
import type { DailyArea, DailyForm } from "@/lib/daily";

// 환경설정 → 일일점검 구역 : My AREA 마다 양식(A~D) · 담당 관리감독자 · QR
export default async function DailyAreasPage() {
  const supabase = await createClient();
  const [{ data: areas }, { data: members }, { data: forms }, { data: depts }, { data: locs }, { data: people }] = await Promise.all([
    supabase.from("daily_areas").select("*").order("sort_order").order("name"),
    supabase.from("daily_area_members").select("area_id, user_id, profiles(name)"),
    supabase.from("daily_forms").select("*").order("sort_order"),
    supabase.from("departments").select("id, name").eq("is_active", true).is("parent_id", null).order("sort_order"),
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id, name, position").eq("is_active", true).order("name"),
  ]);
  const list = (areas ?? []) as DailyArea[];
  const formList = (forms ?? []) as DailyForm[];
  const mem = (members ?? []) as unknown as { area_id: string; user_id: string; profiles: { name: string } | null }[];
  const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const common = { forms: formList, departments: depts ?? [], locations: locs ?? [], people: people ?? [], action: saveDailyArea };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 rounded-md bg-blue-50 px-3 py-2 text-sm break-keep text-blue-900">
          관리감독자가 점검하는 구역(My AREA)마다 <b>양식(A~D형)</b>과 <b>담당 관리감독자</b>를 정하고, QR 을 인쇄해 현장에 붙입니다. 담당자만 QR 로 점검할 수 있습니다.
        </p>
        <Link href="/settings/daily/forms" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
          양식 · 점검 항목 수정
        </Link>
        {list.length > 0 && (
          <Link href="/print/daily-qr" target="_blank" className="rounded-md bg-brand-800 px-3 py-2 text-sm text-white hover:bg-brand-900">
            🖶 QR 전체 인쇄
          </Link>
        )}
      </div>

      <Card title="구역 추가">
        <AreaEditor area={null} memberIds={[]} {...common} />
      </Card>

      <Card title={`점검 구역 (${list.length})`}>
        {list.length === 0 && <p className="py-3 text-sm text-gray-500">아직 등록된 구역이 없습니다.</p>}
        <ul className="divide-y divide-gray-100">
          {list.map((a) => {
            const names = mem.filter((m) => m.area_id === a.id).map((m) => m.profiles?.name ?? "");
            return (
              <li key={a.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <b className={`font-medium ${a.is_active ? "" : "text-gray-400 line-through"}`}>{a.name}</b>
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-900">{a.form_code}형</span>
                    {a.department_id && <span className="text-xs text-gray-500">{deptName.get(a.department_id)}</span>}
                    <span className="text-xs break-keep text-gray-600">{names.length ? names.join(", ") : <span className="text-red-600">담당자 없음</span>}</span>
                  </summary>
                  <div className="mt-3 space-y-3 border-l-2 border-gray-100 pl-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/print/daily-qr?area=${a.id}`} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
                        🖶 QR 인쇄
                      </Link>
                      <Link href={`/d/${a.qr_token}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
                        점검 화면 미리보기
                      </Link>
                      <ReissueButton areaId={a.id} />
                    </div>
                    <AreaEditor area={a} memberIds={mem.filter((m) => m.area_id === a.id).map((m) => m.user_id)} {...common} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
