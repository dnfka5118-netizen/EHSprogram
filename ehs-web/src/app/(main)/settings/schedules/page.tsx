import { createClient } from "@/lib/supabase/server";
import { Card, DeleteSubmit, Input, Select, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveSchedule } from "../actions";
import { AddSchedule } from "./AddSchedule";

const PERIOD: Record<string, string> = { daily: "매일 (영업일)", weekly: "매주", monthly: "매월" };

type Row = {
  id: string;
  module_code: string;
  period: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  note: string | null;
  profiles: { name: string; position: string | null } | null;
};

// 환경설정 → 점검 주기 : 점검별 · 사람별로 해야 하는 주기. 끝난 주기에 등록·"지적사항 없이 점검 완료" 가 없으면 점검 지표의 '미진행'
export default async function SchedulesPage() {
  const supabase = await createClient();
  const [{ data: mods }, { data: rows }, { data: people }] = await Promise.all([
    supabase.from("modules").select("code, name").eq("form", "finding").eq("is_enabled", true).order("sort_order"),
    supabase.from("inspection_schedules").select("id, module_code, period, start_date, end_date, is_active, note, profiles(name, position)").order("created_at"),
    supabase.from("profiles").select("id, name, position").eq("is_active", true).order("name"),
  ]);
  const list = (rows ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <Card title="점검 주기 추가">
        <p className="mb-3 text-sm break-keep text-gray-600">
          정한 주기(매일·매주·매월)마다 그 사람이 해당 점검에서 지적사항을 등록하거나 <b>&quot;지적사항 없이 점검 완료&quot;</b> 를 누르지 않으면 점검 지표에 <b>미진행 1회</b>로 기록됩니다.
        </p>
        <AddSchedule modules={mods ?? []} people={people ?? []} action={saveSchedule} />
      </Card>

      {(mods ?? []).map((m) => {
        const items = list.filter((r) => r.module_code === m.code);
        if (items.length === 0) return null;
        return (
          <Card key={m.code} title={`${m.name} (${items.length}명)`}>
            <ul className="divide-y divide-gray-100">
              {items.map((r) => (
                <li key={r.id} className="py-2">
                  <ActionForm action={saveSchedule} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <span className="w-full text-sm sm:w-32">
                      <b className="font-medium">{r.profiles?.name}</b> <span className="text-xs text-gray-500">{r.profiles?.position ?? ""}</span>
                    </span>
                    <Select name="period" defaultValue={r.period} className="w-32">
                      {Object.entries(PERIOD).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </Select>
                    <span className="flex w-full items-center gap-1 text-sm sm:w-auto">
                      <Input name="start_date" type="date" defaultValue={r.start_date} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="시작일" />~
                      <Input name="end_date" type="date" defaultValue={r.end_date ?? ""} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="종료일" />
                    </span>
                    <Input name="note" defaultValue={r.note ?? ""} placeholder="메모" className="min-w-0 flex-1 sm:max-w-48" />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="is_active" defaultChecked={r.is_active} className="h-4 w-4" /> 사용
                    </label>
                    <SubmitButton variant="secondary" className="px-2 py-1">저장</SubmitButton>
                    <DeleteSubmit what={`${r.profiles?.name} ${m.name} 주기`} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {list.length === 0 && <p className="text-center text-sm text-gray-500">아직 정해진 점검 주기가 없습니다.</p>}
    </div>
  );
}
