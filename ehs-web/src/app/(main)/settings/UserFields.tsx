"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Department, Profile, Site } from "@/lib/types";

// 부서 선택지 : 부문별로 묶고, 부서 바로 아래에 그 부서의 파트 ("생산팀 › HBC-C2")
export const deptLabel = (d: Department, depts: Department[]) =>
  d.parent_id ? `${depts.find((t) => t.id === d.parent_id)?.name ?? ""} › ${d.name}` : d.name;

export function DeptOptions({ depts }: { depts: Department[] }) {
  return [...new Set(depts.filter((d) => !d.parent_id).map((d) => d.division ?? ""))].map((div) => (
    <optgroup key={div || "-"} label={div || "부문 미지정"}>
      {depts
        .filter((d) => !d.parent_id && (d.division ?? "") === div)
        .flatMap((t) => [t, ...depts.filter((p) => p.parent_id === t.id)])
        .map((d) => (
          <option key={d.id} value={d.id}>{deptLabel(d, depts)}</option>
        ))}
    </optgroup>
  ));
}

// 사용자 입력 항목 : 사업장 › 부문 › 팀 › 파트 차례로 고름 (윗단계를 고르면 아랫단계 목록이 바뀜) · 저장은 파트, 없으면 팀
// deactivateWarning : 사용 체크를 풀 때 보여 줄 확인 문구 (맡은 역할·진행 중인 건이 있을 때)
export function UserFields({ sites, departments, user, deactivateWarning }: { sites: Site[]; departments: Department[]; user?: Profile; deactivateWarning?: string }) {
  const [siteId, setSiteId] = useState(user?.site_id ?? sites[0]?.id ?? "");
  const [type, setType] = useState(user?.user_type ?? "employee");
  const depts = departments.filter((d) => d.site_id === siteId);
  const mine = departments.find((d) => d.id === user?.department_id);
  const myTeam = mine?.parent_id ? departments.find((d) => d.id === mine.parent_id) : mine;
  const [div, setDiv] = useState(myTeam?.division ?? "");
  const [teamId, setTeamId] = useState(myTeam?.id ?? "");
  const [partId, setPartId] = useState(mine?.parent_id ? mine.id : "");
  const teamsAll = depts.filter((d) => !d.parent_id);
  const divisions = [...new Set(teamsAll.map((d) => d.division ?? ""))].filter(Boolean);
  const teams = div ? teamsAll.filter((d) => d.division === div) : teamsAll; // 부문을 안 고르면 팀 전체
  const parts = depts.filter((d) => d.parent_id === teamId);

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
        <Select
          name="site_id"
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value);
            setDiv("");
            setTeamId("");
            setPartId("");
          }}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name="department_id" value={partId || teamId} />
      <Field label="부문">
        <Select
          value={div}
          onChange={(e) => {
            setDiv(e.target.value);
            setTeamId("");
            setPartId("");
          }}
        >
          <option value="">(전체)</option>
          {divisions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Select>
      </Field>
      <Field label="팀">
        <Select
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setPartId("");
          }}
        >
          <option value="">(없음)</option>
          {teams.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="파트">
        <Select value={partId} onChange={(e) => setPartId(e.target.value)} disabled={parts.length === 0}>
          <option value="">{parts.length ? "(파트 없음 · 팀 직속)" : "(파트 없음)"}</option>
          {parts.map((d) => (
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
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={user.is_active}
              onChange={(e) => {
                if (!e.currentTarget.checked && deactivateWarning && !window.confirm(deactivateWarning)) e.currentTarget.checked = true;
              }}
              className="h-4 w-4"
            />
            사용
          </label>
        )}
      </div>
    </div>
  );
}
