-- 0030 : 관리감독자 일지 승인자 = 부서장 1명 (departments.approver_id, 결재선의 '해당부서장')
--   0029 는 부서 역할 '승인자'(지적사항 종결 승인자 여러 명)까지 모두 부서장으로 봐서 관리감독자 본인이 승인할 수 있었음
--   부서장이 비어 있을 때만 부서 역할 '승인자' 로 대신함

create or replace function public.daily_team_heads(p_team uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array[approver_id] from departments where id = p_team and approver_id is not null), _dept_heads(p_team))
$$;

create or replace function public.is_daily_team_head(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or auth.uid() = any(daily_team_heads(p_team))
$$;

create or replace function public.submit_daily_log_to_head(p_log uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v daily_logs%rowtype; a daily_areas%rowtype; v_team uuid; v_u uuid; v_n int;
begin
  select * into v from daily_logs where id = p_log for update;
  if not found then raise exception '일지를 찾을 수 없습니다.'; end if;
  select * into a from daily_areas where id = v.area_id;
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = a.id and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 제출할 수 있습니다.';
  end if;
  if exists (select 1 from approvals where module_code = 'insp_daily' and doc_id = p_log and status in ('in_review', 'approved')) then
    raise exception '이 일지는 이전 방식(전자결재)으로 이미 상신되었습니다.';
  end if;
  if v.status not in ('draft', 'rejected') then raise exception '이미 제출된 일지입니다.'; end if;
  if (v.ym + interval '1 month' - interval '1 day')::date > kst_today() then
    raise exception '%월 점검이 끝난 뒤(말일부터) 제출할 수 있습니다.', extract(month from v.ym)::int;
  end if;
  v_team := daily_area_team(a.id);
  if v_team is null or coalesce(array_length(daily_team_heads(v_team), 1), 0) = 0 then
    raise exception '구역의 부서장이 지정되지 않았습니다. 관리자에게 환경설정 → 부서·결재자에서 부서장 지정을 요청해 주세요.';
  end if;
  update daily_logs set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), reject_reason = null where id = p_log;
  select count(*) into v_n from daily_logs l join daily_areas x on x.id = l.area_id
   where l.ym = v.ym and l.status = 'submitted' and daily_area_team(x.id) = v_team;
  foreach v_u in array daily_team_heads(v_team) loop
    perform _daily_log_notify(v_u,
      format('[EHS] 관리감독자 일지 제출 : %s (%s월) — 승인 대기 %s건', a.name, extract(month from v.ym)::int, v_n),
      format('%s 님이 %s월 관리감독자 일일업무일지를 제출했습니다. 부서 레포트에서 한 번에 승인할 수 있습니다.',
             (select name from profiles where id = auth.uid()), extract(month from v.ym)::int),
      format('/insp/daily/reports/%s?ym=%s', v_team, to_char(v.ym, 'YYYY-MM')));
  end loop;
end $$;

grant execute on function public.daily_team_heads(uuid) to authenticated;
