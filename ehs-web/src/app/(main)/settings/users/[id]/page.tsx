import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { UserFields } from "../../UserFields";
import { releaseUserRoles, resetPassword, savePermissions, updateUser } from "../../actions";
import { PERM_LABEL } from "@/lib/labels";
import type { Department, Module, Profile, Site } from "@/lib/types";

export default async function UserEditPage({ params }: PageProps<"/settings/users/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: user }, { data: sites }, { data: depts }, { data: modules }, { data: perms }, { data: duties }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("user_permissions").select("*").eq("user_id", id),
    // 맡고 있는 역할 · 진행 중인 건 (퇴사·사용 중지 전 확인, 0038)
    supabase.rpc("user_responsibilities", { p_user: id }),
  ]);
  if (!user) notFound();
  const u = user as Profile;
  const defaultLevel = u.user_type === "employee" ? "write" : "none";
  type Duty = { kind: string; label: string; link: string; releasable: boolean };
  const dutyList = (duties ?? []) as Duty[];
  const kinds = [...new Set(dutyList.map((d) => d.kind))];
  const releasable = dutyList.filter((d) => d.releasable).length;
  const deactivateWarning = dutyList.length
    ? `${u.name}님은 아직 맡고 있는 역할·진행 중인 건이 ${dutyList.length}건 있습니다.\n\n` +
      kinds.map((k) => `· ${k} ${dutyList.filter((d) => d.kind === k).length}건`).join("\n") +
      "\n\n사용 중지 후 아래 '맡고 있는 역할 · 진행 중인 건'에서 정리해 주세요. 사용 중지할까요?"
    : undefined;

  return (
    <div className="space-y-4">
      <Link href="/settings/users" className="text-sm text-gray-600 hover:underline">
        ← 사용자 목록
      </Link>
      <Card title={`${u.name} · ${u.email}`}>
        <ActionForm action={updateUser} className="space-y-3">
          <input type="hidden" name="id" value={u.id} />
          <UserFields sites={(sites ?? []) as Site[]} departments={(depts ?? []) as Department[]} user={u} deactivateWarning={deactivateWarning} />
          <SubmitButton>저장</SubmitButton>
        </ActionForm>
      </Card>

      <Card title={`맡고 있는 역할 · 진행 중인 건 (${dutyList.length})`}>
        {dutyList.length === 0 ? (
          <p className="text-sm text-gray-500">맡고 있는 역할이나 진행 중인 건이 없습니다. 바로 사용 중지해도 됩니다.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              퇴사·휴직으로 <b>사용 중지</b>할 때는 아래 항목을 다른 사람에게 넘겨 주세요. 지적사항·결재·양식별 결재선은 눌러서 들어가 직접 바꿉니다.
              {!u.is_active && <span className="ml-1 font-medium text-red-600">(사용 중지된 계정)</span>}
            </p>
            {kinds.map((k) => (
              <div key={k}>
                <p className="text-xs font-semibold text-gray-500">{k}</p>
                <ul className="mt-1 space-y-1">
                  {dutyList
                    .filter((d) => d.kind === k)
                    .map((d, i) => (
                      <li key={i} className="text-sm">
                        <Link href={d.link} className="break-all text-brand-800 hover:underline">{d.label}</Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {releasable > 0 && (
              <ActionForm action={releaseUserRoles} className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
                <input type="hidden" name="id" value={u.id} />
                <p className="text-sm text-gray-600">
                  부서 지정자·승인자, 일일점검 구역, 유해화학물질 점검자, 점검 주기 <b>{releasable}건</b>을 한 번에 뺍니다. (부서장이었다면 다음 승인자가 결재선 부서장이 됩니다)
                </p>
                <SubmitButton variant="danger" pendingText="빼는 중…">역할 지정 한 번에 빼기</SubmitButton>
              </ActionForm>
            )}
          </div>
        )}
      </Card>

      <Card title="프로세스별 권한">
        <p className="mb-3 text-sm text-gray-600">
          기본값: 임직원은 모든 프로세스 <b>작성</b>, 협력업체는 <b>없음</b>. 필요한 프로세스만 따로 지정하세요.
          {u.is_admin && <span className="text-brand-800"> (관리자는 항상 전체 권한)</span>}
        </p>
        <ActionForm action={savePermissions} className="space-y-3">
          <input type="hidden" name="id" value={u.id} />
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {((modules ?? []) as Module[]).map((m) => {
                const current = perms?.find((p) => p.module_code === m.code)?.level ?? "default";
                return (
                  <tr key={m.code}>
                    <td className="py-2 pr-2">
                      <span className="text-xs text-gray-500">{m.category}</span> {m.name}
                      {!m.is_enabled && <span className="ml-1 text-xs text-gray-400">(준비 중)</span>}
                    </td>
                    <td className="py-2">
                      <select name={`perm_${m.code}`} defaultValue={current} className="rounded-md border border-gray-300 bg-white px-2 py-1">
                        <option value="default">기본값 ({PERM_LABEL[m.restricted ? "none" : defaultLevel]})</option>
                        <option value="none">없음</option>
                        <option value="read">열람</option>
                        <option value="write">작성</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SubmitButton>권한 저장</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="비밀번호 초기화">
        <ActionForm action={resetPassword} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={u.id} />
          <p className="text-sm text-gray-600">초기 비밀번호로 되돌리고, 다음 로그인 때 변경하도록 합니다.</p>
          <SubmitButton variant="danger">초기화</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
