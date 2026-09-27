"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Department, Profile, Site } from "@/lib/types";

// 사용자 입력 항목 (사업장 선택에 따라 부서 목록이 바뀜)
export function UserFields({ sites, departments, user }: { sites: Site[]; departments: Department[]; user?: Profile }) {
  const [siteId, setSiteId] = useState(user?.site_id ?? sites[0]?.id ?? "");
  const [type, setType] = useState(user?.user_type ?? "employee");
  const depts = departments.filter((d) => d.site_id === siteId);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {!user && (
        <Field label="이메일 (아이디)" required>
          <Input name="email" type="email" required />
        </Field>
      )}
      <Field label="이름" required>
        <Input name="name" defaultValue={user?.name} required />
      </Field>
      <Field label="직위/직책">
        <Input name="position" defaultValue={user?.position ?? ""} />
      </Field>
      <Field label="사업장">
        <Select name="site_id" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="부서">
        <Select name="department_id" defaultValue={user?.department_id ?? ""} key={siteId}>
          <option value="">(없음)</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="구분">
        <Select name="user_type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="employee">임직원</option>
          <option value="contractor">협력업체</option>
        </Select>
      </Field>
      {type === "contractor" && (
        <Field label="협력업체명">
          <Input name="company_name" defaultValue={user?.company_name ?? ""} />
        </Field>
      )}
      <div className="flex items-end gap-4 pb-2 md:col-span-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_admin" defaultChecked={user?.is_admin} className="h-4 w-4" />
          관리자 (환경설정·전체 처리 권한)
        </label>
        {user && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={user.is_active} className="h-4 w-4" />
            사용
          </label>
        )}
      </div>
    </div>
  );
}
