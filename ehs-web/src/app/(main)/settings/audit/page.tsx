import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { fmtDateTime, todayKst } from "@/lib/format";
import { AuditCsvButton } from "./AuditCsvButton";

type Row = {
  id: number;
  at: string;
  actor_name: string | null;
  category: string;
  action: string;
  target_table: string | null;
  target_label: string | null;
  changes: Record<string, unknown> | null;
};

const CATS = ["결재", "문서", "계정", "권한", "조직", "설정"];
const PAGE = 200;

// 칸 이름 (바뀐 내용 표시용)
const COL: Record<string, string> = {
  name: "이름", email: "이메일", department_id: "부서", site_id: "사업장", position: "직위", is_admin: "관리자", is_active: "사용",
  user_type: "구분", company_name: "업체", must_change_password: "비밀번호 변경 필요", level: "권한", module_code: "프로세스", role: "역할",
  user_id: "사용자", approver_id: "결재자", status: "상태", comment: "의견", title: "제목", acted_at: "처리 시각", label: "단계",
  step_kind: "구분", drafter_id: "상신자", submitted_at: "상신 시각", completed_at: "완료 시각", round: "차수", value: "값",
  submitted_by: "제출자", approved_by: "승인자", approved_at: "승인 시각", reject_reason: "반려 사유", parent_id: "상위 부서",
  sort_order: "순서", required: "필수", resolver: "지정 방법", area_id: "구역", work_name: "작업명", permit_no: "허가 번호", eval_no: "평가 번호",
};
const STATUS: Record<string, string> = {
  approved: "승인", rejected: "반려", pending: "결재 차례", waiting: "대기", skipped: "생략", in_review: "결재 중", withdrawn: "상신 취소",
  draft: "작성 중", submitted: "제출", employee: "임직원", contractor: "협력업체", none: "없음", read: "열람", write: "작성", approver: "종결 승인자", assigner: "조치담당자 지정자",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 환경설정 → 감사 로그 : 결재 · 문서 · 계정 · 권한 · 조직 · 설정 변경 기록 (고칠 수 없음, 0035)
export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const sp = await searchParams;
  const today = todayKst();
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.from)) ? str(sp.from) : new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.to)) ? str(sp.to) : today;
  const cat = CATS.includes(str(sp.cat)) ? str(sp.cat) : "";
  const q = str(sp.q).trim();
  const page = Math.max(0, Number(str(sp.page)) || 0);

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, at, actor_name, category, action, target_table, target_label, changes", { count: "exact" })
    .gte("at", `${from}T00:00:00+09:00`)
    .lte("at", `${to}T23:59:59+09:00`)
    .order("id", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (cat) query = query.eq("category", cat);
  if (q) query = query.or(`actor_name.ilike.%${q.replace(/[%,()]/g, "")}%,target_label.ilike.%${q.replace(/[%,()]/g, "")}%,action.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data, count, error }, { data: people }, { data: depts }, { data: sites }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, name"),
    supabase.from("departments").select("id, name"),
    supabase.from("sites").select("id, name"),
  ]);
  const rows = (data ?? []) as Row[];
  const names = new Map<string, string>([...(people ?? []), ...(depts ?? []), ...(sites ?? [])].map((x) => [x.id as string, x.name as string]));
  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "(없음)";
    if (typeof v === "boolean") return v ? "예" : "아니오";
    if (typeof v === "string") return UUID.test(v) ? (names.get(v) ?? "(삭제된 항목)") : (STATUS[v] ?? v);
    return JSON.stringify(v).slice(0, 300);
  };
  const lines = (r: Row) =>
    Object.entries(r.changes ?? {})
      .filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
      .map(([k, v]) => {
        const label = COL[k] ?? k;
        return Array.isArray(v) && v.length === 2 && r.action !== "추가" && r.action !== "계정 추가" && r.action !== "상신" && r.action !== "삭제"
          ? `${label} : ${show(v[0])} → ${show(v[1])}`
          : `${label} : ${show(v)}`;
      });
  const qs = (p: number) => `/settings/audit?${new URLSearchParams({ from, to, ...(cat ? { cat } : {}), ...(q ? { q } : {}), page: String(p) })}`;
  const total = count ?? 0;

  return (
    <Card
      title={`감사 로그 (${total}건)`}
      actions={<AuditCsvButton rows={rows.map((r) => ({ at: fmtDateTime(r.at), actor: r.actor_name ?? "시스템", category: r.category, action: r.action, target: r.target_label ?? "", detail: lines(r).join(" / ") }))} />}
    >
      <p className="mb-3 text-sm break-keep text-gray-600">
        결재(상신·승인·반려·결재자 변경·결재선), 문서(허가서·위험성평가·일지·점검대장) 작성·수정, 계정·권한·조직·설정 변경이 자동으로 남습니다.
        <b> 한 번 남은 기록은 관리자도 고치거나 지울 수 없습니다.</b> 처리자가 &apos;시스템&apos;이면 자동 처리 또는 관리 작업입니다.
      </p>
      <form className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="date" name="from" defaultValue={from} className="rounded-md border border-gray-300 px-2 py-1.5" aria-label="시작일" />
        <span>~</span>
        <input type="date" name="to" defaultValue={to} className="rounded-md border border-gray-300 px-2 py-1.5" aria-label="종료일" />
        <select name="cat" defaultValue={cat} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="분류">
          <option value="">전체 분류</option>
          {CATS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="처리자 · 대상 · 작업 검색" className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 sm:max-w-xs" />
        <button className="rounded-md bg-gray-800 px-4 py-1.5 text-white">조회</button>
      </form>
      {error && <p className="text-sm text-red-600">불러오지 못했습니다 ({error.message})</p>}
      <ScrollX>
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead className="bg-brand-50 text-gray-700">
            <tr>
              {["일시", "처리자", "분류", "작업", "대상", "바뀐 내용"].map((h) => (
                <th key={h} className="border border-gray-200 px-2 py-2 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{fmtDateTime(r.at)}</td>
                <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{r.actor_name ?? <span className="text-gray-400">시스템</span>}</td>
                <td className="border border-gray-200 px-2 py-1.5 text-center whitespace-nowrap">{r.category}</td>
                <td className="border border-gray-200 px-2 py-1.5 font-medium whitespace-nowrap">{r.action}</td>
                <td className="border border-gray-200 px-2 py-1.5 break-keep">{r.target_label ?? "-"}</td>
                <td className="border border-gray-200 px-2 py-1.5">
                  <ul className="space-y-0.5 break-all text-gray-700">
                    {lines(r).slice(0, 12).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="border border-gray-200 py-8 text-center text-gray-500">
                  기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollX>
      {total > PAGE && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          {page > 0 && <Link href={qs(page - 1)} className="text-brand-700 underline">← 최근</Link>}
          <span className="text-gray-500">
            {page * PAGE + 1}–{Math.min(total, page * PAGE + PAGE)} / {total}
          </span>
          {(page + 1) * PAGE < total && <Link href={qs(page + 1)} className="text-brand-700 underline">이전 기록 →</Link>}
        </div>
      )}
    </Card>
  );
}
