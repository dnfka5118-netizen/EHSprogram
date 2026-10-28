-- =====================================================================
-- 완료 처리 : 개선 후 사진을 필수에서 선택으로 (사진이 필요 없는 조치도 있음)
--   0033 report_progress 와 같고, 전부 완료일 때 개선 후 사진 검사만 뺌
-- =====================================================================

create or replace function public.report_progress(
  p_finding uuid, p_items jsonb, p_reason text, p_progress text, p_after_photos text[]
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_item jsonb;
  v_m finding_measures%rowtype;
  v_done boolean; v_new date;
  v_path text;
  v_all_done boolean;
begin
  select * into v_f from findings where id = p_finding for update;
  if not found then raise exception '지적사항을 찾을 수 없습니다.'; end if;
  if not (is_assignee(p_finding) or is_admin() or is_request_dept_member(p_finding)) then
    raise exception '조치담당자 또는 조치 요청 부서원만 결과를 보고할 수 있습니다.';
  end if;
  if v_f.status <> 'in_progress' then raise exception '조치 중 단계에서만 결과를 보고할 수 있습니다.'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_m from finding_measures
     where id = (v_item->>'measure_id')::uuid and finding_id = p_finding for update;
    if not found then raise exception '조치 항목이 올바르지 않습니다.'; end if;
    v_done := coalesce((v_item->>'done')::boolean, false);
    v_new  := nullif(v_item->>'new_target_date', '')::date;

    if v_done then
      if not v_m.is_done then
        update finding_measures set is_done = true, done_at = kst_today() where id = v_m.id;
      end if;
    else
      if v_m.is_done then
        update finding_measures set is_done = false, done_at = null where id = v_m.id;
      end if;
      if v_new is not null and v_new < kst_today() then
        raise exception '새 목표일은 오늘 이후 날짜여야 합니다.';
      end if;
      if v_new is not null and v_new <> v_m.target_date then
        insert into measure_date_history (measure_id, old_date, new_date, reason, changed_by)
        values (v_m.id, v_m.target_date, v_new, nullif(trim(p_reason), ''), auth.uid());
        update finding_measures set target_date = v_new, reschedule_count = reschedule_count + 1 where id = v_m.id;
      elsif v_m.target_date < kst_today() then
        raise exception '목표일이 지난 미완료 조치는 목표일을 다시 정해야 합니다.';
      end if;
    end if;
  end loop;

  foreach v_path in array coalesce(p_after_photos, '{}') loop
    if v_path not like p_finding::text || '/%' then raise exception '사진 경로가 올바르지 않습니다.'; end if;
    insert into finding_photos (finding_id, kind, path, created_by) values (p_finding, 'after', v_path, auth.uid());
  end loop;

  select not exists (select 1 from finding_measures where finding_id = p_finding and not is_done) into v_all_done;

  if v_all_done then
    update findings set status = 'approval_wait', completed_at = now() where id = p_finding;
    perform log_event(p_finding, '완료 보고', nullif(trim(p_progress), ''));
    return 'approval_wait';
  else
    if coalesce(trim(p_reason), '') = '' or coalesce(trim(p_progress), '') = '' then
      raise exception '미완료 이유와 진행현황을 입력해 주세요.';
    end if;
    insert into finding_progress (finding_id, reason, progress, created_by)
    values (p_finding, trim(p_reason), trim(p_progress), auth.uid());
    perform log_event(p_finding, '미완료 보고', trim(p_reason));
    return 'in_progress';
  end if;
end $$;
