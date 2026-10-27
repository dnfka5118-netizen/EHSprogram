// 알림 종류 (환경설정 → 알림 · 0034 app_settings('notify').kinds 키) — DB notifications.kind 와 같음 (결재 결과는 approval_result 하나로)
export const NOTIFY_KINDS: { key: string; label: string; to: string }[] = [
  { key: "request", label: "조치 요청 (지적사항 등록)", to: "요청 부서의 조치담당자 지정자 (없으면 종결 승인자)" },
  { key: "assigned", label: "조치담당자 지정", to: "지정된 조치담당자" },
  { key: "approval", label: "종결 승인 요청 (완료 보고)", to: "요청 부서의 종결 승인자" },
  { key: "rejected", label: "완료 반려", to: "조치담당자" },
  { key: "closed", label: "종결", to: "등록자 · 조치담당자" },
  { key: "directive", label: "지시사항 등록", to: "조치담당자 · 부서장" },
  { key: "approval_request", label: "결재 요청", to: "결재할 차례인 사람" },
  { key: "approval_result", label: "결재 결과 (승인 · 반려)", to: "상신자" },
  { key: "approval_cc", label: "결재 완료 공유", to: "수신참조 · 시행자" },
  { key: "suggestion", label: "게시판 (개선 의견)", to: "새 글 → EHS팀 · 답변·댓글 → 작성자" },
  { key: "daily_log", label: "관리감독자 일지 제출 · 승인 · 반려", to: "제출 → 부서장 · 승인·반려 → 제출자" },
];

export const NOTIFY_MODES = ["digest", "immediate", "off"] as const;
export const NOTIFY_STAGES = ["assign", "plan", "due_soon", "overdue", "approve"] as const;
