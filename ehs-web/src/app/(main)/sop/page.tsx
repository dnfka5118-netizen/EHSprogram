import { ScrollX } from "@/components/ScrollX";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SOP_STATUS } from "@/lib/sop";

type Row = {
  id: string;
  sop_no: string | null;
  rev: number;
  department_name: string | null;
  process_name: string | null;
  title: string;
  risk_no: string | null;
  grade: "A" | "B" | "C" | null;
  created_by_name: string | null;
  approval_status: keyof typeof SOP_STATUS;
  superseded: boolean;
};

const GRADE_STYLE = { A: "bg-red-100 text-red-700", B: "bg-amber-100 text-amber-800", C: "bg-emerald-100 text-emerald-800" } as const;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// 표준운전절차서 현황 : 작성부서 · 공정명 · 표준명 · 위험성평가 번호 · 위험등급 (개정된 이전 Rev. 은 "이전 Rev. 보기" 때만)
export default async function SopListPage({ searchParams }: PageProps<"/sop">) {
  const sp = await searchParams;
  const me = await requireProfile();
  const q = str(sp.q).replace(/[,()%*]/g, "");
  const status = str(sp.status);
  const grade = str(sp.grade);
  const mine = str(sp.mine) === "1";
  const old = str(sp.old) === "1";
  const supabase = await createClient();

  let query = supabase.from("sop_overview").select("*").order("department_name").order("process_name").order("sop_no").order("rev", { ascending: false }).limit(500);
  if (q) query = query.or(`title.ilike.%${q}%,sop_no.ilike.%${q}%,process_name.ilike.%${q}%,department_name.ilike.%${q}%,risk_no.ilike.%${q}%`);
  if (status) query = query.eq("approval_status", status);
  if (grade) query = query.eq("grade", grade);
  if (mine) query = query.eq("created_by", me.id);
  if (!old) query = query.eq("superseded", false);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <Card title={`표준운전절차서 (${rows.length}건)`}>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="표준명 · 표준번호 · 공정명 · 부서 · 위험성평가 번호" className="w-72 max-w-full rounded-md border border-gray-300 px-2 py-1.5" />
        <select name="grade" defaultValue={grade} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
          <option value="">전체 등급</option>
          {(["A", "B", "C"] as const).map((g) => (
            <option key={g} value={g}>{g}등급</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
          <option value="">전체 상태</option>
          {Object.entries(SOP_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-4 w-4" /> 내가 작성한 것만
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="old" value="1" defaultChecked={old} className="h-4 w-4" /> 이전 Rev. 도 보기
        </label>
        <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
      </form>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">등록된 절차서가 없습니다.</p>
      ) : (
        <ScrollX>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-brand-50 text-xs text-gray-700">
              <tr>
                {["작성부서", "공정명", "표준명", "표준번호", "Rev.", "위험성평가 번호", "위험등급", "작성자", "결재상태"].map((h) => (
                  <th key={h} className="border border-gray-200 px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-brand-50/50 ${r.superseded ? "text-gray-400" : ""}`}>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.department_name ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.process_name ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2">
                    <Link href={`/sop/${r.id}`} className="font-medium text-brand-800 hover:underline">{r.title || "(제목 없음)"}</Link>
                    {r.superseded && <span className="ml-1 text-xs">(개정됨)</span>}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 font-mono text-xs whitespace-nowrap">{r.sop_no ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{r.rev}</td>
                  <td className="border border-gray-200 px-2 py-2 font-mono text-xs whitespace-nowrap">{r.risk_no ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">
                    {r.grade ? <span className={`rounded px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[r.grade]}`}>{r.grade}등급</span> : "-"}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.created_by_name ?? "-"}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SOP_STATUS[r.approval_status].style}`}>
                      {SOP_STATUS[r.approval_status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Card>
  );
}
