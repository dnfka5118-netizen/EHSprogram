"use server";

import { createClient } from "@/lib/supabase/server";
import { getModuleAccess } from "@/lib/access";
import { FINDING_ROW_SELECT, enrichFindings, type FindingRow } from "@/lib/finding-rows";
import { applyFindingFilters, type Filters } from "@/components/FindingFilters";
import type { FindingOverview } from "@/lib/types";

const EXCEL_PAGE = 300; // ExcelButton 의 300 과 같아야 함

// 엑셀 다운로드용 : 화면 조회(최근 500건)와 달리 조건에 맞는 건을 전부, 300건씩 나눠 가져감 (응답 크기 제한 대비)
//   scope.module = 점검 하나 (점검 현황) · 없으면 볼 수 있는 모든 점검 (부서별 현황)
export async function findingRowsPage(scope: { module?: string }, filters: Filters, page: number): Promise<FindingRow[]> {
  const readable = (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding" && m.level !== "none").map((m) => m.code);
  const codes = scope.module ? readable.filter((c) => c === scope.module) : readable;
  if (codes.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await applyFindingFilters(supabase.from("finding_overview").select(FINDING_ROW_SELECT).in("module_code", codes), filters)
    .order("inspection_date", { ascending: false })
    .order("seq")
    .order("id")
    .range(page * EXCEL_PAGE, page * EXCEL_PAGE + EXCEL_PAGE - 1);
  if (error) throw new Error(error.message);
  return enrichFindings(supabase, (data ?? []) as unknown as FindingOverview[]);
}
