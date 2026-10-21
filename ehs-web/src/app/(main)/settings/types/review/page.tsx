import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { TypeReview } from "./TypeReview";

// 유형 정리 : 비슷한 문제점인데 유형이 갈린 과거 사례를 묶어 보여 주고, 관리자가 골라 통일
export default async function TypeReviewPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("finding_types").select("name").eq("is_active", true).order("sort_order");

  return (
    <Card
      title="유형 정리 — 애매했던 과거 사례"
      actions={<Link href="/settings/types" className="text-sm text-brand-700 underline">← 유형 목록</Link>}
    >
      <p className="mb-4 text-sm text-gray-600">
        문제점이 비슷한데 유형이 다르게 등록된 과거 사례 묶음입니다. 맞는 유형을 고르면 묶음 전체가 그 유형으로 바뀌고,
        점검 등록 때의 유형 추천이 이 기준을 따릅니다. 다른 유형이 맞는 건은 체크를 풀면 그대로 둡니다.
      </p>
      <TypeReview types={(data ?? []).map((t) => t.name as string)} />
    </Card>
  );
}
