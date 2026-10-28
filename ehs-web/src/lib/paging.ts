// 현황표 페이지 나누기 : DB 에서 보이는 쪽만 가져옴 (주소의 ?page=2&size=50)
export const PAGE_SIZES = [10, 20, 50, 100];

export type Paging = { page: number; size: number };

export function readPaging(sp: Record<string, string | string[] | undefined>): Paging {
  const n = (v: string | string[] | undefined) => (typeof v === "string" ? Number(v) : NaN);
  const size = PAGE_SIZES.includes(n(sp.size)) ? n(sp.size) : 20;
  const page = Number.isInteger(n(sp.page)) && n(sp.page) > 0 ? n(sp.page) : 1;
  return { page, size };
}

// supabase .range(from, to)
export const pageRange = ({ page, size }: Paging): [number, number] => [(page - 1) * size, page * size - 1];
