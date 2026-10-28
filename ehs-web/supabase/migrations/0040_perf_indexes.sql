-- =====================================================================
-- 속도 개선 (동시 접속 50명에서 느려짐)
--   1) 지적사항에 딸린 표를 지적사항으로 찾는 색인 (없어서 매번 전체를 훑음)
--   2) 현황표 장소 조건 목록 : 지적사항 최대 1만 건을 화면으로 가져오던 것을 DB 에서 중복 없이 (부서, 장소) 쌍만
-- =====================================================================

create index if not exists finding_photos_finding     on public.finding_photos (finding_id);
create index if not exists finding_progress_finding   on public.finding_progress (finding_id);
create index if not exists finding_comments_finding   on public.finding_comments (finding_id);
create index if not exists measure_date_history_measure on public.measure_date_history (measure_id);
create index if not exists findings_created_by        on public.findings (created_by);
create index if not exists findings_location          on public.findings (location_id);
create index if not exists findings_module_date       on public.findings (module_code, created_at desc);
create index if not exists notifications_user         on public.notifications (user_id);

-- 장소 조건에 보일 (조치 요청 부서, 장소) 쌍 : 지적사항이 나온 것만 (부서·장소 id 만 돌려줌)
create or replace function public.finding_location_pairs(p_modules text[])
returns table (request_department_id uuid, location_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct f.request_department_id, f.location_id
    from findings f
   where f.module_code = any(p_modules) and f.location_id is not null and is_member()
$$;
