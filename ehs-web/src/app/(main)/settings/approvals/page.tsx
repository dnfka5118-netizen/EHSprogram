import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getTemplate } from "@/lib/approval";
import { Card } from "@/components/ui";
import { TemplateEditor } from "./TemplateEditor";
import type { Department, Module, Site } from "@/lib/types";

const APPROVAL_FORMS = ["permit", "jsa"]; // 결재가 있는 양식 종류 (modules.form)

export default async function ApprovalTemplatesPage({ searchParams }: PageProps<"/settings/approvals">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: mods }, { data: depts }, { data: sites }, people] = await Promise.all([
    supabase.from("modules").select("*").in("form", APPROVAL_FORMS).order("sort_order"),
    supabase.from("departments").select("*").eq("is_active", true).is("parent_id", null).order("sort_order"),
    supabase.from("sites").select("*").order("sort_order"),
    getPeople(supabase),
  ]);
  const modules = (mods ?? []) as Module[];
  const current = modules.find((m) => m.code === sp.form) ?? modules[0];
  const template = current ? await getTemplate(supabase, current.code) : [];
  const siteList = (sites ?? []) as Site[];
  const siteName = (id: string) => siteList.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
        양식마다 <b>기본 결재 순서</b>를 정합니다. 상신 화면에 이 순서가 기본으로 채워지고, 상신하는 사람이 그때그때 결재자를 바꾸거나 단계를 추가·삭제할 수
        있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {modules.map((m) => (
          <Link
            key={m.code}
            href={`/settings/approvals?form=${m.code}`}
            className={`rounded-full border px-3 py-1 text-sm ${m.code === current?.code ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
          >
            {m.name}
            {!m.is_enabled && <span className="ml-1 text-xs opacity-70">(준비 중)</span>}
          </Link>
        ))}
      </div>
      {current && (
        <Card title={`${current.name} 기본 결재선`}>
          <TemplateEditor
            key={current.code}
            moduleCode={current.code}
            initial={template.map((t) => ({
              step_kind: t.step_kind,
              label: t.label,
              resolver: t.resolver,
              department_id: t.department_id,
              user_id: t.user_id,
              required: t.required,
            }))}
            departments={((depts ?? []) as Department[]).map((d) => ({ id: d.id, name: siteList.length > 1 ? `${siteName(d.site_id)} · ${d.name}` : d.name }))}
            people={people}
          />
        </Card>
      )}
    </div>
  );
}
