export type FindingStatus = "assign_wait" | "plan_wait" | "in_progress" | "approval_wait" | "closed";
export type MeasureKind = "immediate" | "short" | "long";
export type PermLevel = "none" | "read" | "write";

export type Profile = {
  id: string;
  email: string;
  name: string;
  site_id: string | null;
  department_id: string | null;
  position: string | null;
  user_type: "employee" | "contractor";
  company_name: string | null;
  is_admin: boolean;
  must_change_password: boolean;
  is_active: boolean;
  favorites?: string[];
};

export type Site = { id: string; code: string; name: string; sort_order: number; is_active: boolean };

export type Department = {
  id: string;
  site_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  assigner_id: string | null;
  approver_id: string | null;
};

export type Module = {
  code: string;
  slug: string;
  name: string;
  category: string;
  form: string | null;
  sort_order: number;
  is_enabled: boolean;
};

export type Location = { id: string; site_id: string; name: string; sort_order: number; is_active: boolean };
export type SubLocation = { id: string; location_id: string; name: string; sort_order: number; is_active: boolean };
export type FindingType = { id: string; name: string; sort_order: number; is_active: boolean };

export type Inspection = {
  id: string;
  site_id: string;
  module_code: string;
  inspection_date: string;
  title: string;
  inspectors: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type FindingOverview = {
  id: string;
  inspection_id: string;
  site_id: string;
  module_code: string;
  seq: number;
  location_id: string | null;
  sub_location_id: string | null;
  sub_location_text: string | null;
  finding_type_id: string | null;
  problem: string;
  request_department_id: string;
  status: FindingStatus;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  inspection_date: string;
  inspection_title: string;
  module_name: string;
  module_slug: string;
  site_name: string;
  location_name: string | null;
  sub_location_name: string | null;
  type_name: string | null;
  department_name: string;
  assignee_names: string | null;
  next_due: string | null;
  is_overdue: boolean;
  reschedule_total: number;
};

export type Measure = {
  id: string;
  finding_id: string;
  kind: MeasureKind;
  content: string;
  target_date: string;
  original_target_date: string;
  reschedule_count: number;
  is_done: boolean;
  done_at: string | null;
};

export type Photo = { id: string; finding_id: string; kind: "before" | "after"; path: string; created_at: string };

export type ActionState = { error?: string; ok?: boolean; message?: string } | undefined;
