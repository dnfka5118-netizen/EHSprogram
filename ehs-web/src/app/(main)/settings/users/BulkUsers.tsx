"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Field, Input, Select } from "@/components/ui";
import { DeptOptions, deptLabel } from "../UserFields";
import type { Department, Site } from "@/lib/types";

type Row = { key: number; email: string; name: string; department_id: string; position: string };

let seq = 0; // 줄 구분용 번호
const blank = (): Row => ({ key: ++seq, email: "", name: "", department_id: "", position: "" });

// 사용자 일괄 등록 : 사람마다 한 줄 (이메일·이름 입력, 부서·직위는 목록에서 선택)
// 엑셀에서 "이메일, 이름, 부서명, 직위" 여러 줄을 이메일 칸에 붙여넣으면 줄로 나누고 부서·직위를 목록에서 찾아 고름
export function BulkUsers({ sites, departments, positions }: { sites: Site[]; departments: Department[]; positions: string[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [type, setType] = useState<"employee" | "contractor">("employee");
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank(), blank()]);
  const box = useRef<HTMLDivElement>(null);
  const depts = departments.filter((d) => d.site_id === siteId);

  // 등록 성공 → 폼 초기화(ActionForm) 때 줄도 비움
  useEffect(() => {
    const form = box.current?.closest("form");
    const clear = () => setRows([blank(), blank(), blank()]);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const findDept = (text: string) => {
    const t = text.replace(/\s/g, "");
    if (!t) return "";
    const hit = depts.find((d) => deptLabel(d, depts).replace(/\s/g, "") === t || d.name.replace(/\s/g, "") === t);
    return hit?.id ?? "";
  };
  const findPosition = (text: string) => positions.find((p) => p === text.trim()) ?? "";

  const onPaste = (key: number, e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t,]/.test(text.trim())) return; // 한 칸짜리는 그대로 붙여넣기
    e.preventDefault();
    const pasted = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [email = "", name = "", dept = "", position = ""] = l.split(/[,\t]/).map((x) => x.trim());
        return { ...blank(), email, name, department_id: findDept(dept), position: findPosition(position) };
      });
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const rest = rs.slice(i + 1).filter((r) => r.email || r.name);
      return [...rs.slice(0, i), ...pasted, ...rest];
    });
  };

  const filled = rows.filter((r) => r.email || r.name);

  return (
    <div ref={box} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="사업장" required>
          <Select name="site_id" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
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
            <Input name="company_name" />
          </Field>
        )}
      </div>

      <input type="hidden" name="users" value={JSON.stringify(filled.map((r) => ({ email: r.email, name: r.name, department_id: r.department_id, position: r.position })))} />
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">
          사용자 목록 <span className="ml-1 text-xs font-normal text-gray-500">엑셀의 &quot;이메일, 이름, 부서명, 직위&quot; 여러 줄을 이메일 칸에 붙여넣어도 됩니다</span>
        </p>
        <div className="hidden gap-2 px-1 text-xs text-gray-500 md:grid md:grid-cols-[2fr_1fr_2fr_1fr_32px]">
          <span>이메일 (아이디)</span>
          <span>이름</span>
          <span>부서 / 파트</span>
          <span>직위</span>
          <span />
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-flow-row-dense grid-cols-[1fr_1fr_24px] items-center gap-2 rounded-md border border-gray-100 p-2 md:grid-flow-row md:grid-cols-[2fr_1fr_2fr_1fr_32px] md:border-0 md:p-0">
              <Input
                type="email"
                value={r.email}
                onChange={(e) => set(r.key, { email: e.target.value })}
                onPaste={(e) => onPaste(r.key, e)}
                placeholder={`${i + 1}. 이메일`}
                className="col-span-2 md:col-span-1"
              />
              <Input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="이름" />
              <Select
                value={r.department_id}
                onChange={(e) => set(r.key, { department_id: e.target.value })}
                className={`col-span-3 md:col-span-1 ${(r.email || r.name) && !r.department_id ? "border-amber-400" : ""}`}
              >
                <option value="">(부서 선택)</option>
                <DeptOptions depts={depts} />
              </Select>
              <Select value={r.position} onChange={(e) => set(r.key, { position: e.target.value })} className="col-span-2 md:col-span-1">
                <option value="">(직위)</option>
                {positions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}
                className="col-start-3 row-start-1 text-gray-400 hover:text-red-600 md:col-start-auto md:row-start-auto"
                aria-label="줄 빼기"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="mt-2 text-sm text-brand-700 hover:underline">
          + 줄 추가
        </button>
        <span className="ml-3 text-xs text-gray-500">입력한 {filled.length}명</span>
      </div>
    </div>
  );
}
