// 직위 정렬 순서 : 임원 → 팀/파트 리더 → 부장 - 차장 - 과장 - 대리 - 주임 - 사원 → 그 밖(목록에 없는 직위·미입력)
// 새 직위가 생기면 이 목록에 알맞은 자리로 추가한다.
export const RANK_ORDER = [
  "대표이사", "부사장", "전무", "상무", "공장장", "고문", "연구소장", "연구위원",
  "TL", "PL",
  "부장", "차장", "과장", "대리", "주임", "사원",
];

const rankOf = (position: string | null | undefined) => {
  const i = RANK_ORDER.indexOf((position ?? "").trim());
  return i < 0 ? RANK_ORDER.length : i;
};

export function sortByRank<T extends { name: string; position: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => rankOf(a.position) - rankOf(b.position) || a.name.localeCompare(b.name, "ko"));
}

// 점검자 고정값 (실제 저장값은 DB inspector_for 함수가 정함 — 화면 표시용)
export function inspectorLabel(moduleCode: string, me: { name: string; position: string | null }) {
  if (moduleCode === "insp_ceo") return "대표이사";
  if (moduleCode === "insp_plant") return "공장장";
  return `${me.name}${me.position?.trim() ? ` ${me.position.trim()}` : ""}`;
}
