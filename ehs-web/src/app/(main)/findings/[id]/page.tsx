import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { MEASURE_KINDS, MEASURE_LABEL } from "@/lib/labels";
import { fmtDate, fmtDateTime, todayKst } from "@/lib/format";
import { AssignPanel } from "./AssignPanel";
import { PlanForm } from "./PlanForm";
import { ReportForm } from "./ReportForm";
import { ApprovalPanel } from "./ApprovalPanel";
import { CommentForm } from "./CommentForm";
import { DeleteButton } from "./DeleteButton";
import { thumbPathOf } from "@/lib/photo-path";
import type { Department, FindingOverview, Measure, Photo } from "@/lib/types";

type Named = { profiles: { name: string } | null };

export default async function FindingDetailPage({ params }: PageProps<"/findings/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: row } = await supabase.from("finding_overview").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const f = row as FindingOverview;

  const [
    { data: measureRows },
    { data: photoRows },
    { data: progressRows },
    { data: commentRows },
    { data: eventRows },
    { data: assigneeRows },
    { data: deptRow },
    { data: memberRows },
    { data: creator },
  ] = await Promise.all([
    supabase.from("finding_measures").select("*").eq("finding_id", id),
    supabase.from("finding_photos").select("*").eq("finding_id", id).order("created_at"),
    supabase.from("finding_progress").select("*, profiles(name)").eq("finding_id", id).order("created_at", { ascending: false }),
    supabase.from("finding_comments").select("*, profiles(name)").eq("finding_id", id).order("created_at"),
    supabase.from("finding_events").select("*, profiles(name)").eq("finding_id", id).order("created_at", { ascending: false }),
    supabase.from("finding_assignees").select("user_id").eq("finding_id", id),
    supabase.from("departments").select("*").eq("id", f.request_department_id).single(),
    supabase.from("profiles").select("id, name, position").eq("department_id", f.request_department_id).eq("is_active", true).order("name"),
    f.created_by ? supabase.from("profiles").select("name").eq("id", f.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const measures = ((measureRows ?? []) as Measure[]).sort((a, b) => MEASURE_KINDS.indexOf(a.kind) - MEASURE_KINDS.indexOf(b.kind));
  const photos = (photoRows ?? []) as Photo[];
  const dept = deptRow as Department;
  const assigneeIds = (assigneeRows ?? []).map((a) => a.user_id as string);

  const { data: historyRows } = measures.length
    ? await supabase.from("measure_date_history").select("*").in("measure_id", measures.map((m) => m.id)).order("changed_at")
    : { data: [] };

  const signed = photos.length
    ? (await supabase.storage.from("findings").createSignedUrls(photos.flatMap((p) => [p.path, thumbPathOf(p.path)]), 3600)).data ?? []
    : [];
  const urlOf = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? "";
  const thumbOf = (path: string) => urlOf(thumbPathOf(path)) || urlOf(path);
  const before = photos.filter((p) => p.kind === "before");
  const after = photos.filter((p) => p.kind === "after");

  // 화면 표시용 권한 (실제 권한은 DB 함수가 검사)
  const isAdmin = profile.is_admin;
  const canAssign = isAdmin || profile.id === dept.assigner_id || profile.id === dept.approver_id;
  const canApprove = isAdmin || profile.id === dept.approver_id;
  const isAssignee = assigneeIds.includes(profile.id) || isAdmin;
  const canDelete = isAdmin || (f.created_by === profile.id && f.status === "assign_wait");
  const today = todayKst();
  const measureKey = measures.map((m) => `${m.id}:${m.target_date}:${m.is_done}`).join("|");

  const lastReject = (eventRows ?? []).find((e) => e.action === "반려");
  const showRejectNotice = f.status === "in_progress" && lastReject && (eventRows ?? [])[0]?.id === lastReject.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/insp/${f.module_slug}/${f.inspection_id}`} className="text-sm text-gray-600 hover:underline">
          ← {f.inspection_title}
        </Link>
        {canDelete && <DeleteButton findingId={f.id} backTo={`/insp/${f.module_slug}/${f.inspection_id}`} />}
      </div>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {f.module_name} #{f.seq}
            </span>
            <StatusBadge status={f.status} overdue={f.is_overdue} />
          </span>
        }
      >
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Info label="사업장" value={f.site_name} />
          <Info label="장소 / 세부장소" value={`${f.location_name ?? "-"}${f.sub_location_name ? ` / ${f.sub_location_name}` : ""}`} />
          <Info label="유형" value={f.type_name ?? "-"} />
          <Info label="점검일" value={fmtDate(f.inspection_date)} />
          <Info label="조치 요청 부서" value={f.department_name} />
          <Info label="조치담당자" value={f.assignee_names ?? "미지정"} />
          <Info label="등록자" value={(creator as { name: string } | null)?.name ?? "-"} />
          <Info label="등록일" value={fmtDateTime(f.created_at)} />
        </dl>
        <div className="mt-4">
          <p className="mb-1 text-xs text-gray-500">문제점</p>
          <p className="rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-900">{f.problem}</p>
        </div>
        <PhotoGrid title="개선 전 사진" photos={before} urlOf={urlOf} thumbOf={thumbOf} />
      </Card>

      {showRejectNotice && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>반려됨</b> · {lastReject.detail} <span className="text-red-600">({(lastReject as unknown as Named).profiles?.name})</span>
        </p>
      )}

      {/* ---- 단계별 처리 영역 ---- */}
      {canAssign && f.status !== "closed" && (
        <AssignPanel
          findingId={f.id}
          members={(memberRows ?? []) as { id: string; name: string; position: string | null }[]}
          selected={assigneeIds}
          initialOpen={f.status === "assign_wait"}
        />
      )}
      {f.status === "plan_wait" && isAssignee && <PlanForm findingId={f.id} measures={measures} mode="create" />}
      {f.status === "in_progress" && isAssignee && (
        <>
          <ReportForm key={`r-${measureKey}-${after.length}`} findingId={f.id} measures={measures} today={today} hasAfterPhotos={after.length > 0} />
          <PlanForm key={`p-${measureKey}`} findingId={f.id} measures={measures} mode="edit" />
        </>
      )}
      {f.status === "approval_wait" && canApprove && <ApprovalPanel findingId={f.id} />}

      {/* ---- 조치 현황 ---- */}
      <Card title="조치계획 및 진행">
        {measures.length === 0 ? (
          <p className="text-sm text-gray-500">아직 조치계획이 등록되지 않았습니다.</p>
        ) : (
          <ul className="space-y-3">
            {measures.map((m) => {
              const hist = (historyRows ?? []).filter((h) => h.measure_id === m.id);
              const overdue = !m.is_done && m.target_date < today && f.status !== "closed";
              return (
                <li key={m.id} className="rounded-md border border-gray-200 p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{MEASURE_LABEL[m.kind]}</span>
                    <span className={`text-xs ${m.is_done ? "text-emerald-700" : overdue ? "font-medium text-red-600" : "text-gray-600"}`}>
                      {m.is_done ? `완료 (${fmtDate(m.done_at)})` : `목표 ${fmtDate(m.target_date)}${overdue ? " · 기한 초과" : ""}`}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-gray-700">{m.content}</p>
                  {hist.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      일정 변경 {hist.length}회 : {fmtDate(m.original_target_date)}
                      {hist.map((h) => ` → ${fmtDate(h.new_date)}`).join("")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <PhotoGrid title="개선 후 사진" photos={after} urlOf={urlOf} thumbOf={thumbOf} />
        {(progressRows ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-gray-500">미완료 이유 및 진행현황</p>
            <ul className="space-y-2">
              {(progressRows ?? []).map((p) => (
                <li key={p.id} className="rounded-md bg-amber-50 p-3 text-sm">
                  <p className="mb-1 text-xs text-amber-800">
                    {fmtDateTime(p.created_at)} · {(p as unknown as Named).profiles?.name}
                  </p>
                  <p className="whitespace-pre-wrap text-gray-800"><b className="font-medium">미완료 이유</b> {p.reason}</p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800"><b className="font-medium">진행현황</b> {p.progress}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ---- 지시사항 / 코멘트 ---- */}
      <Card title="지시사항 · 코멘트">
        {(commentRows ?? []).length > 0 && (
          <ul className="mb-4 space-y-2">
            {(commentRows ?? []).map((c) => (
              <li key={c.id} className={`rounded-md p-3 text-sm ${c.is_directive ? "border border-red-200 bg-red-50" : "bg-gray-50"}`}>
                <p className="mb-1 text-xs text-gray-500">
                  {c.is_directive && <span className="mr-1 rounded bg-red-600 px-1.5 py-0.5 text-white">지시</span>}
                  {(c as unknown as Named).profiles?.name} · {fmtDateTime(c.created_at)}
                </p>
                <p className="whitespace-pre-wrap text-gray-800">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <CommentForm findingId={f.id} />
      </Card>

      {/* ---- 처리 이력 ---- */}
      <Card title="처리 이력">
        <ol className="space-y-2 text-sm">
          {(eventRows ?? []).map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-28 shrink-0 text-xs text-gray-500">{fmtDateTime(e.created_at)}</span>
              <span>
                <b className="font-medium text-gray-900">{e.action}</b>
                <span className="text-gray-600"> · {(e as unknown as Named).profiles?.name ?? "-"}</span>
                {e.detail && <span className="block whitespace-pre-line text-gray-600">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

function PhotoGrid({ title, photos, urlOf, thumbOf }: { title: string; photos: Photo[]; urlOf: (p: string) => string; thumbOf: (p: string) => string }) {
  if (photos.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-gray-500">{title}</p>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {photos.map((p) => (
          <a key={p.id} href={urlOf(p.path)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbOf(p.path)} alt={title} className="h-full w-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}
