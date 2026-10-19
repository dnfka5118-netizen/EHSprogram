import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { chemStamps, getChemCheck } from "@/lib/chem-check";
import { ChemSheet } from "@/components/ChemSheet";
import { PrintBar } from "../../PrintButton";
import "../../paper.css";

// 유해화학물질 취급시설 자체점검대장 인쇄 (A4 세로)
export default async function ChemPrintPage({ params }: PageProps<"/print/chem/[id]">) {
  const { id } = await params;
  if (!(await getProfile())) redirect("/login");
  const supabase = await createClient();
  const d = await getChemCheck(supabase, id, false);
  if (!d) notFound();
  const approval = await getApproval(supabase, "insp_chem", id);
  return (
    <div className="paper-screen">
      <PrintBar title="유해화학물질 취급시설 자체점검대장 인쇄 미리보기" sub={`양식 CE310-07 · ${d.group.name}${approval?.status !== "approved" ? " · ⚠ 결재 완료 전 문서" : ""}`} />
      <style>{`@page { size: A4 ${d.places.length > 6 ? "landscape" : "portrait"}; margin: 8mm; }`}</style>
      <div className={`mx-auto bg-white p-[6mm] print:p-0 ${d.places.length > 6 ? "max-w-[285mm]" : "max-w-[200mm]"}`}>
        <ChemSheet d={d} stamps={chemStamps(approval?.steps)} />
      </div>
    </div>
  );
}
