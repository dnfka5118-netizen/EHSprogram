import { ScrollX } from "@/components/ScrollX";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { PERMIT_STATUS, SUPP_TYPES, type PermitStatus } from "@/lib/permit";
import { todayKst } from "@/lib/format";

type Row = {
  id: string;
  permit_no: string;
  work_type: string | null;
  supp: string[];
  grade: string | null;
  work_name: string;
  work_place: string | null;
  company_name: string | null;
  start_dt: string | null;
  end_dt: string | null;
  psm: string;
  preop: string;
  proc_no: string | null;
  risk_no: string | null;
  risk_eval_no: string | null;
  manager_name: string | null;
  department_name: string | null;
  status: PermitStatus;
  has_tbm: boolean;
  field_saved_at: string | null;
};

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const d = (v: string | null) => (v ? v.slice(0, 10) : "-");
const t = (v: string | null) => (v ? v.slice(11, 16) : "");

// 안전작업허가 현황 / 금일 작업 현황 (원본 21개 열)
export default async function PermitListPage({ searchParams }: PageProps<"/permit">) {
  const sp = await searchParams;
  const today = str(sp.tab) === "today";
  const q = str(sp.q).replace(/[,()%*]/g, "");
  const status = str(sp.status);
  const supabase = await createClient();
  const day = todayKst();

  let query = supabase.from("permit_overview").select("*").order("start_dt", { ascending: false }).order("permit_no", { ascending: false }).limit(300);
  if (today) query = query.lte("start_dt", `${day}T23:59:59`).gte("end_dt", `${day}T00:00:00`);
  if (q) query = query.or(`work_name.ilike.%${q}%,permit_no.ilike.%${q}%,work_place.ilike.%${q}%,company_name.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const ck = (on: boolean) => (on ? <span className="font-bold text-brand-800">✓</span> : "");

  return (
    <Card title={today ? `금일 작업 현황 (${day} · ${rows.length}건)` : `안전작업허가 현황 (${rows.length}건)`}>
      {today ? (
        <p className="mb-3 text-sm text-gray-600">오늘({day}) 작업 기간에 해당하는 허가 신청 건만 모아서 보여줍니다.</p>
      ) : (
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="작업명 · 허가번호 · 장소 · 회사명" className="w-64 rounded-md border border-gray-300 px-2 py-1.5" />
          <select name="status" defaultValue={status} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            <option value="">전체 상태</option>
            {Object.entries(PERMIT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">{today ? "오늘 작업 예정인 허가서가 없습니다." : "등록된 허가서가 없습니다."}</p>
      ) : (
        <ScrollX>
          <table className="w-full min-w-[1500px] border-collapse text-xs">
            <thead className="bg-brand-50 text-gray-700">
              <tr>
                {["작업일자", "허가번호", "작업장소", "회사명", "작업명", "승인여부", "화기", "일반", ...SUPP_TYPES.map((s) => s.value), "위험성평가 번호", "작업절차서 번호", "가동전점검", "변경관리", "담당자", "TBM", "현장기록"].map((h) => (
                  <th key={h} className="border border-gray-200 px-1.5 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const live = r.status === "issued" || r.status === "completed";
                return (
                  <tr key={r.id} className="hover:bg-brand-50/50">
                    <td className="border border-gray-200 px-1.5 py-1.5 whitespace-nowrap">
                      {d(r.start_dt)} <span className="text-gray-400">{t(r.start_dt)}~{t(r.end_dt)}</span>
                    </td>
                    <td className="border border-gray-200 px-1.5 py-1.5 font-mono whitespace-nowrap">
                      <Link href={`/permit/${r.id}`} className="text-brand-800 hover:underline">{r.permit_no}</Link>
                    </td>
                    <td className="border border-gray-200 px-1.5 py-1.5">{r.work_place ?? "-"}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5">{r.company_name ?? "-"}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5">
                      <Link href={`/permit/${r.id}`} className="hover:text-brand-800 hover:underline">{r.work_name || "(제목 없음)"}</Link>
                      {r.grade && <span className={`ml-1 rounded px-1 text-[10px] font-bold ${r.grade === "A" ? "bg-red-100 text-red-700" : r.grade === "B" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{r.grade}</span>}
                    </td>
                    <td className="border border-gray-200 px-1.5 py-1.5 text-center">
                      <span className={`rounded-full px-2 py-0.5 font-medium whitespace-nowrap ${PERMIT_STATUS[r.status].style}`}>{PERMIT_STATUS[r.status].label}</span>
                    </td>
                    <td className="border border-gray-200 text-center">{ck(r.work_type === "화기")}</td>
                    <td className="border border-gray-200 text-center">{ck(r.work_type === "일반위험")}</td>
                    {SUPP_TYPES.map((s) => (
                      <td key={s.key} className="border border-gray-200 text-center">{ck(r.supp?.includes(s.key))}</td>
                    ))}
                    <td className="border border-gray-200 px-1.5 py-1.5 font-mono whitespace-nowrap">{r.risk_eval_no ?? r.risk_no ?? "-"}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5 font-mono whitespace-nowrap">{r.proc_no || "-"}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5 text-center">{r.preop}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5 text-center">{r.psm}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5 whitespace-nowrap">{r.manager_name ?? "-"}</td>
                    <td className="border border-gray-200 px-1.5 py-1.5 text-center whitespace-nowrap">
                      {live ? (
                        <Link href={`/permit/${r.id}/tbm`} className={r.has_tbm ? "text-emerald-700" : "rounded bg-brand-800 px-2 py-0.5 text-white"}>
                          {r.has_tbm ? "✓ TBM 완료" : "📋 TBM 실시"}
                        </Link>
                      ) : (
                        <span className="text-gray-400">허가 후 가능</span>
                      )}
                    </td>
                    <td className="border border-gray-200 px-1.5 py-1.5 text-center whitespace-nowrap">
                      {live ? (
                        <Link href={`/permit/${r.id}#field`} className={r.field_saved_at ? "text-emerald-700" : "rounded bg-brand-800 px-2 py-0.5 text-white"}>
                          {r.status === "completed" ? "✓ 작업완료" : r.field_saved_at ? "✓ 현장 기록 (수정)" : "📱 현장 기록 시작"}
                        </Link>
                      ) : (
                        <span className="text-gray-400">허가 후 가능</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Card>
  );
}
