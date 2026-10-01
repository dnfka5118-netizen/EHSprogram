import { ScrollX } from "@/components/ScrollX";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { UserFields } from "../UserFields";
import { bulkCreateUsers, createUser } from "../actions";
import type { Department, Profile, Site } from "@/lib/types";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const sp = await searchParams;
  const q = str(sp.q).replace(/[,()%*]/g, "");
  const dept = str(sp.dept);
  const supabase = await createClient();

  let query = supabase.from("profiles").select("*").order("name");
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  if (dept) query = query.eq("department_id", dept);

  const [{ data: users }, { data: sites }, { data: depts }] = await Promise.all([
    query.limit(500),
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
  ]);
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];
  const deptName = (id: string | null) => deptList.find((d) => d.id === id)?.name ?? "-";
  const siteName = (id: string | null) => siteList.find((s) => s.id === id)?.name ?? "-";

  return (
    <div className="space-y-4">
      <Card title="사용자 추가">
        <ActionForm action={createUser} resetOnSuccess className="space-y-3">
          <UserFields sites={siteList} departments={deptList} />
          <SubmitButton>계정 만들기</SubmitButton>
        </ActionForm>
      </Card>

      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">사용자 일괄 등록</summary>
        <div className="border-t border-gray-100 p-4">
          <ActionForm action={bulkCreateUsers} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="사업장" required>
                <Select name="site_id">
                  {siteList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="구분">
                <Select name="user_type">
                  <option value="employee">임직원</option>
                  <option value="contractor">협력업체</option>
                </Select>
              </Field>
              <Field label="협력업체명" hint="협력업체일 때">
                <Input name="company_name" />
              </Field>
            </div>
            <Field label="사용자 목록" hint="한 줄에 한 명 · 이메일, 이름, 부서명, 직위 (엑셀에서 복사해 붙여넣기 가능)">
              <Textarea name="rows" rows={8} placeholder={"hong@sypchem.co.kr, 홍길동, 생산팀, 과장\nkim@sypchem.co.kr, 김철수, 품질팀, 대리"} />
            </Field>
            <SubmitButton pendingText="등록 중… (인원이 많으면 시간이 걸립니다)">일괄 등록</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <Card title={`사용자 (${users?.length ?? 0}명)`}>
        <form className="mb-3 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="이름 또는 이메일" className="rounded-md border border-gray-300 px-2 py-1.5" />
          <select name="dept" defaultValue={dept} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            <option value="">전체 부서</option>
            {deptList.map((d) => (
              <option key={d.id} value={d.id}>
                {siteName(d.site_id)} · {d.name}
              </option>
            ))}
          </select>
          <button className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white">검색</button>
        </form>
        <ScrollX>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 font-medium">이름</th>
                <th className="px-2 py-2 font-medium">이메일</th>
                <th className="px-2 py-2 font-medium">사업장</th>
                <th className="px-2 py-2 font-medium">부서</th>
                <th className="px-2 py-2 font-medium">구분</th>
                <th className="px-2 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {((users ?? []) as Profile[]).map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2">
                    <Link href={`/settings/users/${u.id}`} className="font-medium text-brand-800 hover:underline">
                      {u.name}
                    </Link>
                    {u.position && <span className="ml-1 text-xs text-gray-500">{u.position}</span>}
                    {u.is_admin && <span className="ml-1 rounded bg-brand-100 px-1 text-xs text-brand-800">관리자</span>}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{u.email}</td>
                  <td className="px-2 py-2 text-gray-600">{siteName(u.site_id)}</td>
                  <td className="px-2 py-2 text-gray-600">{deptName(u.department_id)}</td>
                  <td className="px-2 py-2 text-gray-600">{u.user_type === "contractor" ? `협력업체${u.company_name ? ` (${u.company_name})` : ""}` : "임직원"}</td>
                  <td className="px-2 py-2 text-xs">
                    {!u.is_active ? (
                      <span className="text-red-600">사용 중지</span>
                    ) : u.must_change_password ? (
                      <span className="text-amber-700">최초 로그인 전</span>
                    ) : (
                      <span className="text-gray-500">사용</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      </Card>
    </div>
  );
}
