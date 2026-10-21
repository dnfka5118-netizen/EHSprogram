import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { saveType } from "../actions";
import { NameRow, ROWS_GRID } from "../NameRow";
import type { FindingType } from "@/lib/types";

export default async function TypesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("finding_types").select("*").order("sort_order");
  const list = (data ?? []) as FindingType[];

  return (
    <Card
      title={`지적사항 유형 (${list.length})`}
      actions={<Link href="/settings/types/review" className="rounded-md border border-brand-700 px-3 py-1.5 text-sm text-brand-800">유형 정리 (애매했던 과거 사례)</Link>}
    >
      <div className={ROWS_GRID}>
        {list.map((t) => (
          <NameRow key={t.id} action={saveType} id={t.id} name={t.name} sortOrder={t.sort_order} isActive={t.is_active} />
        ))}
      </div>
      <div className="mt-3 max-w-md">
        <NameRow action={saveType} placeholder="새 유형" />
      </div>
    </Card>
  );
}
