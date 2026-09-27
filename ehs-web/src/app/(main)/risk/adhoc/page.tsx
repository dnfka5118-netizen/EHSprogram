import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { riskColor, riskTextColor } from "@/lib/jsa";
import { JSA_STATUS } from "./status";

type Row = {
  id: string;
  eval_no: string;
  eval_date: string;
  department_name: string | null;
  work_name: string;
  work_area: string | null;
  max_risk: number;
  created_by: string | null;
  created_by_name: string | null;
  approval_status: keyof typeof JSA_STATUS;
  step_count: number;
};

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function JsaListPage({ searchParams }: PageProps<"/risk/adhoc">) {
  const sp = await searchParams;
  const me = await requireProfile();
  const q = str(sp.q).replace(/[,()%*]/g, "");
  const status = str(sp.status);
  const mine = str(sp.mine) === "1";
  const supabase = await createClient();

  let query = supabase.from("jsa_overview").select("*").order("eval_date", { ascending: false }).order("eval_no", { ascending: false }).limit(300);
  if (q) query = query.or(`work_name.ilike.%${q}%,eval_no.ilike.%${q}%,work_area.ilike.%${q}%`);
  if (status) query = query.eq("approval_status", status);
  if (mine) query = query.eq("created_by", me.id);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <Card title={`위험성평가서 (${rows.length}건)`}>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="작업명 · 평가번호 · 작업지역" className="w-60 rounded-md border border-gray-300 px-2 py-1.5" />
        <select name="status" defaultValue={status} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
          <option value="">전체 상태</option>
          {Object.entries(JSA_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-4 w-4" /> 내가 작성한 것만
        </label>
        <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
      </form>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">등록된 평가서가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-brand-50 text-xs text-gray-700">
              <tr>
                {["평가번호", "평가일자", "부서명", "작업명", "작업지역", "단계", "최대위험도", "작성자", "결재상태"].map((h) => (
                  <th key={h} className="border border-gray-200 px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/50">
                  <td className="border border-gray-200 px-2 py-2 font-mono text-xs whitespace-nowrap">
                    <Link href={`/risk/adhoc/${r.id}`} className="text-brand-800 hover:underline">{r.eval_no}</Link>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{fmtDate(r.eval_date)}</td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.department_name ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2">
                    <Link href={`/risk/adhoc/${r.id}`} className="hover:text-brand-800 hover:underline">{r.work_name || "(제목 없음)"}</Link>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-gray-600">{r.work_area ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{r.step_count}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">
                    {r.max_risk > 0 ? (
                      <span className="inline-block min-w-8 rounded px-1.5 py-0.5 font-mono font-bold" style={{ background: riskColor(r.max_risk), color: riskTextColor(r.max_risk) }}>
                        {r.max_risk}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.created_by_name ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${JSA_STATUS[r.approval_status].style}`}>
                      {JSA_STATUS[r.approval_status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
