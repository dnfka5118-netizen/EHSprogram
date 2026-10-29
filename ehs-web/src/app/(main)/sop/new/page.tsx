import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { emptySop } from "@/lib/sop";
import { todayKst } from "@/lib/format";
import { getJsaOptions } from "../../permit/data";
import { SopEditor } from "../SopEditor";

// 새 표준운전절차서 (문서 ID 를 미리 정해 사진을 바로 올릴 수 있게)
export default async function NewSopPage() {
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "sop");
  if (mod?.level !== "write" || me.user_type !== "employee") notFound();
  const supabase = await createClient();
  const [depts, template, people, jsaOptions] = await Promise.all([
    getDeptHeads(supabase),
    getTemplate(supabase, "sop", me.id),
    getPeople(supabase),
    getJsaOptions(supabase),
  ]);
  // 작성부서 기본값 = 내 팀 (파트 소속이면 상위 팀)
  return (
    <SopEditor
      id={randomUUID()}
      isNew
      rev={0}
      initial={emptySop(todayKst(), me.team_id ?? me.department_id ?? "", me.name)}
      photoUrls={{}}
      departments={depts}
      template={template}
      people={people}
      meId={me.id}
      jsaOptions={jsaOptions}
    />
  );
}
