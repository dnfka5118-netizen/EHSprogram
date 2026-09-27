import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { MEASURE_KINDS, MEASURE_LABEL } from "@/lib/labels";
import { fmtDate, fmtMonth, todayKst } from "@/lib/format";
import { ExportButton, type ReportRow } from "./ExportButton";
import type { FindingOverview, Measure, Photo, Site } from "@/lib/types";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

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

  // 당월 점검 + 이전 점검 중 (미종결 또는 당월 이후 종결) 건
  const [{ data: current }, { data: carried }] = await Promise.all([
    supabase.from("finding_overview").select("*").eq("module_code", mod.code).eq("site_id", siteId)
      .gte("inspection_date", start).lt("inspection_date", end),
    supabase.from("finding_overview").select("*").eq("module_code", mod.code).eq("site_id", siteId)
      .lt("inspection_date", start).or(`status.neq.closed,closed_at.gte.${start}`),
  ]);

  const findings = [...((carried ?? []) as FindingOverview[]), ...((current ?? []) as FindingOverview[])].sort(
    (a, b) => a.inspection_date.localeCompare(b.inspection_date) || a.seq - b.seq,
  );
  const ids = findings.map((f) => f.id);

  const [{ data: measureRows }, { data: progressRows }, { data: commentRows }, { data: photoRows }] = ids.length
    ? await Promise.all([
        supabase.from("finding_measures").select("*").in("finding_id", ids),
        supabase.from("finding_progress").select("finding_id, reason, progress, created_at").in("finding_id", ids).order("created_at", { ascending: false }),
        supabase.from("finding_comments").select("finding_id, body, created_at").eq("is_directive", true).in("finding_id", ids).order("created_at"),
        supabase.from("finding_photos").select("*").in("finding_id", ids).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const measures = (measureRows ?? []) as Measure[];
  const { data: historyRows } = measures.length
    ? await supabase.from("measure_date_history").select("measure_id, new_date, changed_at").in("measure_id", measures.map((x) => x.id)).order("changed_at")
    : { data: [] };

  const photos = (photoRows ?? []) as Photo[];
  const signed = photos.length ? (await supabase.storage.from("findings").createSignedUrls(photos.map((p) => p.path), 3600)).data ?? [] : [];
  const urlOf = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? "";

  const rows: ReportRow[] = findings.map((f, i) => {
    const ms = measures.filter((x) => x.finding_id === f.id);
    const byKind = Object.fromEntries(MEASURE_KINDS.map((k) => [k, ms.find((x) => x.kind === k)?.content ?? "-"])) as ReportRow["measures"];
    const schedule = MEASURE_KINDS.flatMap((k) => {
      const x = ms.find((mm) => mm.kind === k);
      if (!x) return [];
      const hist = (historyRows ?? []).filter((h) => h.measure_id === x.id).map((h) => fmtDate(h.new_date as string));
      const dates = [fmtDate(x.original_target_date), ...hist].join(" → ");
      return [`${MEASURE_LABEL[k]}: ${dates}${x.is_done ? " (완료)" : ""}`];
    }).join("\n");
    const prog = (progressRows ?? []).find((p) => p.finding_id === f.id);
    return {
      no: i + 1,
      month: fmtMonth(f.inspection_date) + (f.inspection_date < start ? " / 이월" : ""),
      location: f.location_name ?? "-",
      subLocation: f.sub_location_name ?? "-",
      type: f.type_name ?? "-",
      problem: f.problem,
      measures: byKind,
      schedule: schedule || "-",
      department: f.department_name,
      assignees: f.assignee_names ?? "-",
      status: f.status,
      overdue: f.is_overdue,
      progress: prog ? `[미완료 이유] ${prog.reason}\n[진행현황] ${prog.progress}` : "",
      directives: (commentRows ?? []).filter((c) => c.finding_id === f.id).map((c) => c.body).join("\n"),
      before: photos.filter((p) => p.finding_id === f.id && p.kind === "before").map((p) => urlOf(p.path)),
      after: photos.filter((p) => p.finding_id === f.id && p.kind === "after").map((p) => urlOf(p.path)),
      href: `/findings/${f.id}`,
    };
  });

  const siteName = sites.find((s) => s.id === siteId)?.name ?? "";
  const title = `${mod.name} 현황 (${m}월 점검 현황 + 이전 점검 미완료 현황)`;
  const summary = {
    total: rows.length,
    closed: rows.filter((r) => r.status === "closed").length,
    open: rows.filter((r) => r.status !== "closed").length,
    overdue: rows.filter((r) => r.overdue).length,
  };

  return (
    <div className="space-y-4">
      <Link href={`/insp/${slug}`} className="text-sm text-gray-600 hover:underline">
        ← {mod.name}
      </Link>
      <Card title="월별 보고서" actions={<ExportButton rows={rows} title={title} fileName={`${month}_${siteName}_${mod.name}.xlsx`} />}>
        <form className="mb-4 flex flex-wrap gap-2">
          <select name="site" defaultValue={siteId} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input type="month" name="month" defaultValue={month} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" />
          <button className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white">조회</button>
        </form>
        <h2 className="mb-2 font-semibold text-gray-900">
          {siteName} · {title}
        </h2>
        <div className="mb-4 grid grid-cols-4 gap-2 text-center text-sm">
          <Stat label="전체" value={summary.total} />
          <Stat label="완료" value={summary.closed} />
          <Stat label="미완료" value={summary.open} />
          <Stat label="기한 초과" value={summary.overdue} tone="red" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-xs">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                {["NO", "시행 월", "장소", "세부장소", "유형", "문제점", "개선 전", "즉시조치", "단기대책", "장기대책", "개선일정", "개선 후", "담당부서", "담당자", "상태", "미완료 이유 및 진행현황"].map((h) => (
                  <th key={h} className="border border-gray-200 px-1.5 py-1.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.href} className="align-top">
                  <td className="border border-gray-200 px-1.5 py-1 text-center">
                    <Link href={r.href} className="text-emerald-800 underline">{r.no}</Link>
                  </td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{r.month}</td>
                  <td className="border border-gray-200 px-1.5 py-1">{r.location}</td>
                  <td className="border border-gray-200 px-1.5 py-1">{r.subLocation}</td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{r.type}</td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{r.problem}</td>
                  <td className="border border-gray-200 px-1.5 py-1"><Thumbs urls={r.before} /></td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{r.measures.immediate}</td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{r.measures.short}</td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{r.measures.long}</td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{r.schedule}</td>
                  <td className="border border-gray-200 px-1.5 py-1"><Thumbs urls={r.after} /></td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{r.department}</td>
                  <td className="border border-gray-200 px-1.5 py-1">{r.assignees}</td>
                  <td className="border border-gray-200 px-1.5 py-1"><StatusBadge status={r.status} overdue={r.overdue} /></td>
                  <td className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">
                    {r.progress}
                    {r.directives && <p className="mt-1 text-red-700">[지시] {r.directives}</p>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="py-8 text-center text-gray-500">해당 월의 점검 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

function Thumbs({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex w-20 flex-wrap gap-1">
      {urls.slice(0, 2).map((u) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" className="h-16 w-20 rounded object-cover" loading="lazy" />
      ))}
      {urls.length > 2 && <span className="text-gray-500">+{urls.length - 2}</span>}
    </div>
  );
}
