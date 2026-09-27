import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { UserFields } from "../../UserFields";
import { resetPassword, savePermissions, updateUser } from "../../actions";
import { PERM_LABEL } from "@/lib/labels";
import type { Department, Module, Profile, Site } from "@/lib/types";

export default async function UserEditPage({ params }: PageProps<"/settings/users/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: user }, { data: sites }, { data: depts }, { data: modules }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("user_permissions").select("*").eq("user_id", id),
  ]);
  if (!user) notFound();
  const u = user as Profile;
  const defaultLevel = u.user_type === "employee" ? "write" : "none";

  return (
    <div className="space-y-4">
      <Link href="/settings/users" className="text-sm text-gray-600 hover:underline">
        ← 사용자 목록
      </Link>
      <Card title={`${u.name} · ${u.email}`}>
        <ActionForm action={updateUser} className="space-y-3">
          <input type="hidden" name="id" value={u.id} />
          <UserFields sites={(sites ?? []) as Site[]} departments={(depts ?? []) as Department[]} user={u} />
          <SubmitButton>저장</SubmitButton>
        </ActionForm>
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
                        <option value="default">기본값 ({PERM_LABEL[defaultLevel]})</option>
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
