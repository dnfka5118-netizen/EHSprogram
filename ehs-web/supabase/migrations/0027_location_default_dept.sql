-- 0027 : 장소·세부장소별 기본 조치 요청 부서 → 점검 등록 때 자동 선택
--   우선순위 : 세부장소 기본 부서 → 장소 기본 부서 → 과거 기록 최다 부서 (세부장소 → 장소)
--   location_dept_stats() : 과거 지적사항의 장소·세부장소별 조치 요청 부서 건수 (지적사항 열람 권한과 무관하게 건수만)

alter table public.locations     add column if not exists default_department_id uuid references public.departments(id) on delete set null;
alter table public.sub_locations add column if not exists default_department_id uuid references public.departments(id) on delete set null;

create or replace function public.location_dept_stats(p_site uuid)
returns table (location_id uuid, sub_location_id uuid, department_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select f.location_id, f.sub_location_id, f.request_department_id, count(*)::int
  from findings f
  join locations l on l.id = f.location_id
  where is_member() and l.site_id = p_site and f.request_department_id is not null
  group by 1, 2, 3
$$;

revoke all on function public.location_dept_stats(uuid) from public;
grant execute on function public.location_dept_stats(uuid) to authenticated;
