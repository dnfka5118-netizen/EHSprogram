import { notFound } from "next/navigation";
import { canViewKpi, getInternalModules, getModuleAccess } from "@/lib/access";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { TabLinks } from "@/components/TabLinks";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { fmtDate, fmtDateTime, todayKst } from "@/lib/format";
import { KpiExcelButton } from "./KpiExcelButton";
import { ConfirmKpiButton } from "./ConfirmKpiButton";
import type { KpiData, KpiRow } from "./types";

const FIRST_YEAR = 2026;
const pct = (late: number, due: number) => (due ? `${Math.round((late / due) * 1000) / 10}%` : "-");

// 점검 지표 (인사평가용) : 1월 1일부터 누적 · 팀별 / 개인별 / 월별 — 환경설정에서 '점검 지표' 권한을 준 사람만
export default async function KpiPage({ searchParams }: PageProps<"/insp/kpi">) {
  if (!(await canViewKpi())) notFound();
  const sp = await searchParams;
  const thisYear = Number(todayKst().slice(0, 4));
  const year = Math.min(thisYear, Math.max(FIRST_YEAR, Number(sp.year) || thisYear));
  const modules = (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding");
  const mod = modules.find((m) => m.code === sp.module)?.code ?? null;
  const me = await getProfile();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_year", { p_year: year, p_module: mod });
  if (error) throw new Error(error.message);
  const k = data as KpiData;
  const { data: depts } = await supabase.from("departments").select("id, name");
  const deptName = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]));
  k.people = k.people.map((p) => ({ ...p, team_name: p.team ? (deptName.get(p.team) ?? null) : null }));
  const tabs = [...(await getInternalModules()).map((m) => ({ href: `/insp/${m.slug}`, label: m.name })), { href: "/insp/kpi", label: "점검 지표" }];

  const sum = (key: keyof KpiRow) => k.teams.reduce((a, t) => a + Number(t[key] ?? 0), 0);
  const totals = { found: sum("found"), closed: sum("closed"), due: sum("due"), late: sum("late"), expected: k.people.reduce((a, p) => a + p.expected, 0), missed: k.people.reduce((a, p) => a + p.missed, 0) };
  const maxMonth = Math.max(1, ...k.months.map((m) => Math.max(m.found, m.closed)));
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  const modName = mod ? modules.find((m) => m.code === mod)?.name : "전체 점검";

  return (
    <div className="space-y-4">
      <PageHeader title="점검 지표" crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "점검" }, { label: "점검 지표" }]}>
        <TabLinks tabs={tabs} />
      </PageHeader>

      <Card>
        <form className="flex flex-wrap items-center gap-2">
          <select name="year" defaultValue={year} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="연도">
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select name="module" defaultValue={mod ?? ""} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="점검">
            <option value="">전체 점검</option>
            {modules.map((m) => (
              <option key={m.code} value={m.code}>{m.name}</option>
            ))}
          </select>
          <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <KpiExcelButton data={k} title={`${year}년 점검 지표 (${modName})`} />
            {me?.is_admin && year < thisYear && <ConfirmKpiButton year={year} />}
          </span>
        </form>
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${k.confirmed_at ? "bg-emerald-50 text-emerald-900" : "bg-blue-50 text-blue-900"}`}>
          {k.confirmed_at ? (
            <>
              <b>{year}년 확정본</b> · 확정 {fmtDateTime(k.confirmed_at)} ({k.confirmed_by ?? "자동 확정"}) — 이후 데이터가 바뀌어도 이 숫자는 그대로입니다.
            </>
          ) : (
            <>
              <b>{year}년 1월 1일 ~ {fmtDate(k.as_of)} 누적</b> (실시간) · {modName}
              {year < thisYear && " — 아직 확정되지 않았습니다."}
            </>
          )}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="점검 발굴" value={`${totals.found}건`} />
        <Tile label="개선 조치 (종결)" value={`${totals.closed}건`} />
        <Tile label="개선조치 지연율" value={pct(totals.late, totals.due)} sub={`지연 ${totals.late} / 목표일 지난 조치 ${totals.due}`} warn={totals.late > 0} />
        <Tile label="점검 미진행" value={`${totals.missed}회`} sub={totals.expected ? `주기 ${totals.expected}회 중` : "점검 주기 미설정"} warn={totals.missed > 0} />
      </div>

      <Card title="팀별">
        <KpiTable rows={k.teams} kind="team" />
      </Card>
      <Card title="개인별">
        <KpiTable rows={k.people} kind="person" />
      </Card>

      <Card title="월별 추이">
        <ScrollX>
          <div className="flex min-w-[560px] items-end gap-2 pt-2">
            {k.months.map((m) => (
              <div key={m.mo} className="flex flex-1 flex-col items-center gap-1 text-[11px]">
                <div className="flex h-28 items-end gap-0.5">
                  <span className="w-3 rounded-t bg-brand-600" style={{ height: `${(m.found / maxMonth) * 100}%` }} title={`발굴 ${m.found}`} />
                  <span className="w-3 rounded-t bg-emerald-500" style={{ height: `${(m.closed / maxMonth) * 100}%` }} title={`조치 ${m.closed}`} />
                </div>
                <span className="text-gray-500">{m.mo}월</span>
                <span className="text-gray-700">
                  {m.found}/{m.closed}
                </span>
                {m.late > 0 && <span className="text-red-600">지연 {m.late}</span>}
              </div>
            ))}
          </div>
        </ScrollX>
        <p className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
          <span>
            <span className="mr-1 inline-block h-2 w-3 rounded bg-brand-600" />발굴
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-3 rounded bg-emerald-500" />개선 조치(종결)
          </span>
          <span>숫자 = 발굴/조치</span>
        </p>
      </Card>

      <Card title="지표 기준">
        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li><b>점검 발굴</b> : 지적사항을 등록한 사람 1건 (등록일 기준). 팀은 등록할 때의 부서. 기존 엑셀에서 옮긴 건은 제외.</li>
          <li><b>개선 조치</b> : 종결(부서장 승인)된 건을 조치담당자 각자 1건 (종결일 기준). 팀은 1건.</li>
          <li><b>지연</b> : 원래 목표일이 올해이고 이미 지난 조치 중, 원래 목표일 안에 완료하지 못한 조치 1건. 지연율 = 지연 ÷ 목표일이 지난 조치.</li>
          <li><b>점검 미진행</b> : 환경설정 → 점검 주기에 정한 점검·사람별 주기(매일/매주/매월) 중, 끝난 주기에 지적사항 등록이나 &quot;지적사항 없이 점검 완료&quot; 기록이 없는 횟수. 매일은 영업일만. 관리감독자 일일점검은 구역 담당자로 지정되면 자동으로 &quot;매일&quot; 이 되고, 대체 점검을 받은 날은 실시, 나중에 소급 입력한 날은 미진행으로 셉니다.</li>
          <li>올해는 실시간 누적, 지난해는 1월 1일 자동 확정본으로 보여 줍니다 (관리자는 다시 확정 가능).</li>
        </ul>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-red-600" : "text-brand-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function KpiTable({ rows, kind }: { rows: KpiRow[]; kind: "team" | "person" }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-gray-500">해당 기간 실적이 없습니다.</p>;
  const sorted = [...rows].sort((a, b) => b.found - a.found || b.closed - a.closed);
  const th = "border border-gray-200 px-2 py-1.5 font-medium whitespace-nowrap";
  const td = "border border-gray-200 px-2 py-1.5 text-right tabular-nums";
  return (
    <ScrollX>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-brand-50 text-xs text-gray-700">
          <tr>
            <th className={`${th} text-left`}>{kind === "team" ? "팀" : "이름"}</th>
            {kind === "person" && <th className={`${th} text-left`}>팀</th>}
            <th className={th}>발굴</th>
            <th className={th}>조치</th>
            <th className={th}>지연 / 목표일 지난 조치</th>
            <th className={th}>지연율</th>
            <th className={th}>미진행 / 주기</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.uid ?? r.team} className="hover:bg-brand-50/40">
              <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">
                {kind === "team" ? (
                  <>
                    {r.division && <span className="mr-1 text-xs text-gray-400">{r.division}</span>}
                    {r.name}
                  </>
                ) : (
                  <>
                    <b className="font-medium">{r.name}</b> <span className="text-xs text-gray-500">{r.position ?? ""}</span>
                  </>
                )}
              </td>
              {kind === "person" && <td className="border border-gray-200 px-2 py-1.5 text-xs whitespace-nowrap text-gray-600">{r.team_name ?? "-"}</td>}
              <td className={td}>{r.found}</td>
              <td className={td}>{r.closed}</td>
              <td className={`${td} ${r.late ? "text-red-600" : ""}`}>
                {r.late} / {r.due}
              </td>
              <td className={`${td} ${r.late ? "font-medium text-red-600" : ""}`}>{pct(r.late, r.due)}</td>
              <td className={`${td} ${r.missed ? "text-red-600" : ""}`}>{r.expected ? `${r.missed} / ${r.expected}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}
