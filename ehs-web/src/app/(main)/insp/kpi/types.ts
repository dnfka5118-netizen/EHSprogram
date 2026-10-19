// kpi_year() 결과 (0017 _kpi_compute)
export type KpiRow = {
  uid?: string;
  name: string;
  position?: string | null;
  team: string | null;
  team_name?: string | null;
  division?: string | null;
  found: number;
  closed: number;
  due: number;
  late: number;
  expected: number;
  missed: number;
};
export type KpiMonth = { mo: number; found: number; closed: number; due: number; late: number; missed: number };
export type KpiData = {
  year: number;
  module: string | null;
  as_of: string;
  people: KpiRow[];
  teams: KpiRow[];
  months: KpiMonth[];
  confirmed_at: string | null;
  confirmed_by?: string | null;
};
