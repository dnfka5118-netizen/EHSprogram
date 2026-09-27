export const JSA_STATUS = {
  draft: { label: "작성중", style: "bg-gray-100 text-gray-700" },
  in_review: { label: "결재중", style: "bg-amber-100 text-amber-800" },
  approved: { label: "결재완료", style: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "반려", style: "bg-red-100 text-red-700" },
  withdrawn: { label: "상신취소", style: "bg-gray-100 text-gray-600" },
} as const;
