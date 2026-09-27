import { STATUS_LABEL, STATUS_STYLE } from "@/lib/labels";
import type { FindingStatus } from "@/lib/types";

export function StatusBadge({ status, overdue }: { status: FindingStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-700">기한 초과</span>}
    </span>
  );
}
