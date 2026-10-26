import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { getDailyLog, reviewStamps } from "@/lib/daily-log";
import { DailyLogSheet } from "@/components/DailyLogSheet";
import { PrintBar } from "../../PrintButton";
import "../../paper.css";

// 월간 일지 인쇄 (A4 가로)
export default async function DailyLogPrintPage({ params }: PageProps<"/print/daily-log/[id]">) {
  const { id } = await params;
  if (!(await getProfile())) redirect("/login");
  const supabase = await createClient();
  const d = await getDailyLog(supabase, id);
  if (!d) notFound();
  const approval = await getApproval(supabase, "insp_daily", id);

  return (
    <div className="paper-screen">
      <PrintBar title="관리감독자 일일업무일지 인쇄 미리보기" sub={`${d.form.form_no ?? ""} · A4 가로${approval?.status !== "approved" && d.review?.status !== "approved" ? " · ⚠ 승인 완료 전 문서" : ""}`} />
      <style>{`@page { size: A4 landscape; margin: 8mm; }`}</style>
      <div className="mx-auto max-w-[285mm] bg-white p-[6mm] print:p-0">
        <DailyLogSheet d={d} stamps={reviewStamps(d, approval)} />
      </div>
    </div>
  );
}
