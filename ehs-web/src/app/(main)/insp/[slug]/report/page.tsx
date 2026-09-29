import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { todayKst } from "@/lib/format";
import type { FindingOverview, Site } from "@/lib/types";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// 월별 보고서 : 당월 점검 + 이전 점검 중 미완료(또는 당월에 완료된) 건 — 기존 엑셀 보고 양식과 같은 범위
export default async function ReportPage({ params, searchParams }: PageProps<"/insp/[slug]/report">) {
  const { slug } = await params;
  const sp = await searchParams;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();

  const supabase = await createClient();
  const { data: siteRows } = await supabase.from("sites").select("*").eq("is_active", true).order("sort_order");
  const sites = (siteRows ?? []) as Site[];

  const month = /^\d{4}-\d{2}$/.test(str(sp.month)) ? str(sp.month) : todayKst().slice(0, 7);
  const siteId = str(sp.site) || sites[0]?.id || "";
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const base = () => supabase.from("finding_overview").select(FINDING_ROW_SELECT).eq("module_code", mod.code).eq("site_id", siteId);
  const [{ data: current }, { data: carried }] = await Promise.all([
    base().gte("inspection_date", start).lt("inspection_date", end),
    base().lt("inspection_date", start).or(`status.neq.closed,closed_at.gte.${start}`),
  ]);
  const findings = [...((carried ?? []) as FindingOverview[]), ...((current ?? []) as FindingOverview[])].sort(
    (a, b) => a.inspection_date.localeCompare(b.inspection_date) || a.seq - b.seq,
  );
  const rows = await enrichFindings(supabase, findings);

  const siteName = sites.find((s) => s.id === siteId)?.name ?? "";
  const title = `${mod.name} 현황 (${m}월 점검 현황 + 이전 점검 미완료 현황)`;
  const stat = {
    total: rows.length,
    closed: rows.filter((r) => r.status === "closed").length,
    open: rows.filter((r) => r.status !== "closed").length,
    overdue: rows.filter((r) => r.is_overdue).length,
  };

  return (
    <div className="space-y-4">
      <Link href={`/insp/${slug}`} className="text-sm text-gray-600 hover:underline">
        ← {mod.name}
      </Link>
      <Card
        title="월별 보고서"
        actions={<ExcelButton rows={rows} title={title} currentMonth={month} fileName={`${month}_${siteName}_${mod.name}.xlsx`} />}
      >
        <form className="mb-4 flex flex-wrap gap-2">
          {sites.length > 1 && (
            <select name="site" defaultValue={siteId} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <input type="month" name="month" defaultValue={month} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" />
          <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
        </form>
        <h2 className="mb-2 font-semibold text-gray-900">
          {siteName} · {title}
        </h2>
        <div className="mb-4 grid grid-cols-4 gap-2 text-center text-sm">
          <Stat label="전체" value={stat.total} />
          <Stat label="완료" value={stat.closed} />
          <Stat label="미완료" value={stat.open} />
          <Stat label="기한 초과" value={stat.overdue} tone="red" />
        </div>
        <FindingTable rows={rows} empty="해당 월의 점검 내역이 없습니다." />
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className="rounded-md border border-gray-200 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${tone === "red" && value ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
