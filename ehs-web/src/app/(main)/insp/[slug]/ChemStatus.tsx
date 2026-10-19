import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { APPROVAL_STATUS_LABEL } from "@/lib/approval";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { fmtDate, todayKst } from "@/lib/format";
import { OpenChemButton } from "./OpenChemButton";

type Check = { id: string; group_id: string; check_date: string; week_start: string; saved_at: string | null; profiles: { name: string } | null; chem_groups: { name: string } | null };

// 유해화학물질 자체점검 화면 : 내 점검(이번 주) · 점검 단위별 이번 주 실시 여부 · 최근 점검대장
export async function ChemStatus() {
  const supabase = await createClient();
  const me = await getProfile();
  const today = todayKst();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const week = new Date(Date.parse(today) - dow * 86400000).toISOString().slice(0, 10);
  const [{ data: groups }, { data: members }, { data: checks }, { data: aps }, { data: subRow }] = await Promise.all([
    supabase.from("chem_groups").select("id, name, departments(name), chem_places(id, is_active)").eq("is_active", true).order("sort_order"),
    supabase.from("chem_group_members").select("group_id, user_id, profiles(name)"),
    supabase.from("chem_checks").select("id, group_id, check_date, week_start, saved_at, profiles(name), chem_groups(name)").order("week_start", { ascending: false }).limit(60),
    supabase.from("approvals").select("doc_id, status").eq("module_code", "insp_chem"),
    supabase.from("chem_substitutes").select("user_id").eq("user_id", me?.id ?? "").maybeSingle(),
  ]);
  const gs = (groups ?? []) as unknown as { id: string; name: string; departments: { name: string } | null; chem_places: { id: string; is_active: boolean }[] }[];
  const mem = (members ?? []) as unknown as { group_id: string; user_id: string; profiles: { name: string } | null }[];
  const ck = (checks ?? []) as unknown as Check[];
  const st = new Map((aps ?? []).map((a) => [a.doc_id as string, a.status as keyof typeof APPROVAL_STATUS_LABEL]));
  const mine = gs.filter((g) => mem.some((m) => m.group_id === g.id && m.user_id === me?.id));
  const thisWeek = (gid: string) => ck.find((c) => c.group_id === gid && c.week_start === week);
  const canSub = !!subRow || !!me?.is_admin; // 대체 점검자 (환경설정 명단)
  const others = gs.filter((g) => !mine.includes(g));
  const label = (c: Check | undefined) => (!c || !c.saved_at ? "미실시" : st.get(c.id) ? APPROVAL_STATUS_LABEL[st.get(c.id)!] : "저장됨 · 상신 전");

  return (
    <>
      {mine.length > 0 && (
        <Card title="내 유해화학물질 자체점검 (주 1회)">
          <ul className="divide-y divide-gray-100">
            {mine.map((g) => {
              const c = thisWeek(g.id);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 flex-1 basis-40">
                    <b className="font-medium">{g.name}</b> <span className="text-xs text-gray-500">점검장소 {g.chem_places.filter((p) => p.is_active).length}곳</span>
                  </span>
                  <span className={`text-xs ${c?.saved_at ? "text-emerald-700" : "font-medium text-red-600"}`}>이번 주 {label(c)}</span>
                  <OpenChemButton groupId={g.id} label={c?.saved_at ? "이번 주 점검대장" : "이번 주 점검하기"} primary={!c?.saved_at} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {canSub && others.length > 0 && (
        <Card title="대체 점검 (점검자 휴가·외근 시)">
          <p className="mb-2 text-xs break-keep text-gray-500">대체 점검자로 지정되어 있습니다. 점검자가 없을 때 그 점검 단위의 이번 주 점검대장을 대신 작성합니다 (사유 필수).</p>
          <ul className="divide-y divide-gray-100">
            {others.map((g) => {
              const c = thisWeek(g.id);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 basis-40">
                    <b className="font-medium">{g.name}</b>{" "}
                    <span className="text-xs text-gray-500">
                      {mem
                        .filter((m) => m.group_id === g.id)
                        .map((m) => m.profiles?.name)
                        .join(", ")}
                    </span>
                  </span>
                  <span className={`text-xs ${c?.saved_at ? "text-emerald-700" : "text-red-600"}`}>{label(c)}</span>
                  {!c?.saved_at && <OpenChemButton groupId={g.id} label="대체 점검" />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title={`점검 단위별 이번 주 (${fmtDate(week)} 주)`}>
        <ul className="divide-y divide-gray-100">
          {gs.map((g) => {
            const c = thisWeek(g.id);
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 basis-40">
                  <b className="font-medium">{g.name}</b>{" "}
                  <span className="text-xs text-gray-500">
                    {mem
                      .filter((m) => m.group_id === g.id)
                      .map((m) => m.profiles?.name)
                      .join(", ") || "점검자 없음"}
                  </span>
                </span>
                {c?.saved_at ? (
                  <Link href={`/insp/chem/checks/${c.id}`} className="text-xs text-emerald-700 hover:underline">
                    ✓ {fmtDate(c.check_date)} {c.profiles?.name} · {label(c)}
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-red-600">미실시</span>
                )}
              </li>
            );
          })}
          {gs.length === 0 && <li className="py-3 text-sm text-gray-500">점검 단위가 없습니다. 환경설정 → 유해화학물질 점검에서 등록해 주세요.</li>}
        </ul>
      </Card>

      <Card title="점검대장 기록 (최근)">
        <ScrollX>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">점검일</th>
                <th className="px-2 py-1.5 font-medium">점검 단위</th>
                <th className="px-2 py-1.5 font-medium">점검자</th>
                <th className="px-2 py-1.5 font-medium">결재</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ck
                .filter((c) => c.saved_at)
                .map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <Link href={`/insp/chem/checks/${c.id}`} className="text-brand-800 hover:underline">
                        {fmtDate(c.check_date)}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">{c.chem_groups?.name}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{c.profiles?.name}</td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">{label(c)}</td>
                  </tr>
                ))}
              {!ck.some((c) => c.saved_at) && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
                    아직 저장된 점검대장이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollX>
      </Card>
    </>
  );
}
