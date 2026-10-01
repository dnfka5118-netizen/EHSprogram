import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { fmtDate } from "@/lib/format";
import type { FindingOverview, Inspection } from "@/lib/types";

export default async function InspectionSessionPage({ params }: PageProps<"/insp/[slug]/[inspectionId]">) {
  const { slug, inspectionId } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();

  const supabase = await createClient();
  const [{ data: insp }, { data: findings }] = await Promise.all([
    supabase.from("inspections").select("*, sites(name)").eq("id", inspectionId).eq("module_code", mod.code).maybeSingle(),
    supabase.from("finding_overview").select(FINDING_ROW_SELECT).eq("inspection_id", inspectionId).order("seq"),
  ]);
  if (!insp) notFound();
  const inspection = insp as Inspection & { sites: { name: string } | null };
  const rows = await enrichFindings(supabase, (findings ?? []) as FindingOverview[]);

  return (
    <div className="space-y-4">
      <Link href={`/insp/${slug}`} className="text-sm text-gray-600 hover:underline">
        ← {mod.name}
      </Link>
      <Card
        title={inspection.title}
        actions={
          mod.level === "write" && (
            <Link
              href={`/insp/${slug}/new`}
              className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
            >
              + 점검 등록
            </Link>
          )
        }
      >
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500">사업장</dt>
            <dd>{inspection.sites?.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">점검일</dt>
            <dd>{fmtDate(inspection.inspection_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">점검자</dt>
            <dd>{inspection.inspector ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">점검 참여자</dt>
            <dd>{inspection.inspectors ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">지적사항</dt>
            <dd>{findings?.length ?? 0}건</dd>
          </div>
        </dl>
        {inspection.note && <p className="mt-3 text-sm whitespace-pre-wrap text-gray-700">{inspection.note}</p>}
      </Card>
      <Card title={`지적사항 (${rows.length}건)`} actions={<ExcelButton rows={rows} title={`${inspection.title} 현황`} fileName={`${inspection.title}.xlsx`} />}>
        <FindingTable rows={rows} empty="아직 등록된 지적사항이 없습니다." />
      </Card>
    </div>
  );
}
