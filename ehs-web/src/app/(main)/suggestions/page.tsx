import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import type { SuggestionRow } from "@/lib/suggestion";
import { SuggestionTable } from "./SuggestionTable";

// 게시판 (개선 의견) : 모두 공개 · 익명 작성자는 DB 함수에서 가림 · 표 머리글에서 엑셀처럼 필터
export default async function SuggestionsPage({ searchParams }: PageProps<"/suggestions">) {
  const sp = await searchParams;
  const mine = sp.mine === "1";
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_suggestions", { p_status: null, p_mine: mine });
  const rows = (data ?? []) as SuggestionRow[];

  return (
    <div className="space-y-4">
      <PageHeader title="게시판 (개선 의견)" crumbs={[{ label: "공통" }, { label: "게시판 (개선 의견)" }]} />

      <p className="text-sm break-keep text-gray-600">
        프로그램을 쓰면서 불편한 점·바라는 점을 자유롭게 적어 주세요. EHS팀이 검토해 <b>수용</b> 또는 <b>미수용(사유)</b>으로 답변드리고, 반영되면
        알려 드립니다. 표 머리글의 <b>▼</b>를 누르면 엑셀처럼 골라 볼 수 있습니다.
      </p>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={mine ? "/suggestions" : "/suggestions?mine=1"}
          className={`rounded-md border px-3 py-1.5 text-xs ${mine ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"}`}
        >
          내 글만
        </Link>
        <Link href="/suggestions/new" className="rounded-md border border-gray-400 bg-white px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
          글쓰기
        </Link>
      </div>

      <SuggestionTable rows={rows} />
    </div>
  );
}
