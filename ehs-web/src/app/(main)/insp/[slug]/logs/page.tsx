import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APPROVAL_STATUS_LABEL } from "@/lib/approval";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { todayKst } from "@/lib/format";
import { ymLabel } from "@/lib/daily";
import { OpenLogForm } from "./OpenLogForm";

// 관리감독자 일일점검 → 월간 일지 (구역 · 월마다 1장, 전자결재)
export default async function DailyLogsPage({ params }: PageProps<"/insp/[slug]/logs">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || mod.level === "none") notFound();
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data: areas }, { data: mine }, { data: logs }, { data: aps }] = await Promise.all([
    supabase.from("daily_areas").select("id, name, form_code").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("daily_area_members").select("area_id").eq("user_id", me?.id ?? ""),
    supabase.from("daily_logs").select("id, ym, area_id, daily_areas(name, form_code)").order("ym", { ascending: false }).limit(300),
    supabase.from("approvals").select("doc_id, status").eq("module_code", "insp_daily"),
  ]);
  const myIds = new Set((mine ?? []).map((m) => m.area_id as string));
  const openable = ((areas ?? []) as { id: string; name: string; form_code: string }[]).filter((a) => me?.is_admin || myIds.has(a.id));
  const status = new Map((aps ?? []).map((a) => [a.doc_id as string, a.status as keyof typeof APPROVAL_STATUS_LABEL]));
  const rows = (logs ?? []) as unknown as { id: string; ym: string; area_id: string; daily_areas: { name: string; form_code: string } | null }[];

  return (
    <div className="space-y-4">
      <Card title="일지 열기">
        {openable.length ? (
          <OpenLogForm areas={openable} month={todayKst().slice(0, 7)} />
        ) : (
          <p className="text-sm break-keep text-gray-500">담당 구역이 없습니다. 관리감독자로 지정되면 이곳에서 월간 일지를 만들고 상신할 수 있습니다.</p>
        )}
        <p className="mt-2 text-xs break-keep text-gray-500">한 달 동안 QR 로 저장한 점검 기록이 원본 양식(1~31일 칸)으로 자동 작성됩니다. 월말에 열어 확인하고 상신해 주세요.</p>
      </Card>

      <Card title={`월간 일지 (${rows.length})`}>
        <ScrollX>
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">월</th>
                <th className="px-2 py-1.5 font-medium">구역</th>
                <th className="px-2 py-1.5 font-medium">결재</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const st = status.get(r.id);
                return (
                  <tr key={r.id} className={myIds.has(r.area_id) ? "bg-brand-50/40" : ""}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{ymLabel(r.ym)}</td>
                    <td className="px-2 py-1.5">
                      <Link href={`/insp/daily/logs/${r.id}`} className="text-brand-800 hover:underline">
                        {r.daily_areas?.name}
                      </Link>{" "}
                      <span className="text-xs text-gray-500">{r.daily_areas?.form_code}형</span>
                    </td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">{st ? APPROVAL_STATUS_LABEL[st] : <span className="text-gray-500">작성 중</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                    아직 만든 일지가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollX>
      </Card>
    </div>
  );
}
