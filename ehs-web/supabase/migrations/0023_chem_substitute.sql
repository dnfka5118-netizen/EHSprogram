-- =====================================================================
-- 유해화학물질 자체점검 : 대체 점검
--   · 점검자가 휴가·외근 등으로 없을 때 '대체 점검자' (기본 : EHS부서장 · EHS 유해화학물질 점검원) 가 대신 점검
--   · 대체 점검자 명단은 환경설정 → 유해화학물질 점검 에서 관리 (chem_substitutes)
--   · 대체 점검은 사유 필수, 점검대장 성명 칸에 '대체' 표시, 원래 점검자도 점검 지표 '실시'
-- =====================================================================

create table if not exists public.chem_substitutes (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.chem_substitutes enable row level security;
create policy read_all on public.chem_substitutes for select to authenticated using (is_member());
create policy admin_all on public.chem_substitutes for all to authenticated using (is_admin()) with check (is_admin());

alter table public.chem_checks add column if not exists sub_reason text;  -- 대체 점검 사유 (null = 점검자 본인)

create or replace function public.can_write_chem(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from chem_group_members where group_id = p_group and user_id = auth.uid())
      or exists (select 1 from chem_substitutes where user_id = auth.uid())
$$;

create or replace function public.set_chem_substitutes(p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 지정할 수 있습니다.'; end if;
  delete from chem_substitutes where user_id <> all (coalesce(p_users, '{}'));
  insert into chem_substitutes (user_id) select u from unnest(coalesce(p_users, '{}')) u on conflict do nothing;
end $$;

-- 대체 점검자도 점검대장을 보고 쓸 수 있게
create or replace function public.can_view_chem(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select perm_level('insp_chem') >= 1 or can_write_chem(p_group)
$$;

create or replace function public._chem_editable(p_check uuid) returns chem_checks
language plpgsql security definer set search_path = public as $$
declare v chem_checks%rowtype; v_st text;
begin
  select * into v from chem_checks where id = p_check;
  if not found then raise exception '점검 기록을 찾을 수 없습니다.'; end if;
  if not can_write_chem(v.group_id) then raise exception '이 점검의 점검자 또는 대체 점검자만 작성할 수 있습니다.'; end if;
  select status into v_st from approvals where module_code = 'insp_chem' and doc_id = v.id;
  if v_st in ('in_review', 'approved') then raise exception '결재 중이거나 결재가 끝난 점검대장은 고칠 수 없습니다.'; end if;
  return v;
end $$;
revoke execute on function public._chem_editable(uuid) from public, anon, authenticated;

create or replace function public.open_chem_check(p_group uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_day date := coalesce(p_date, kst_today()); v_id uuid;
begin
  if not can_write_chem(p_group) then raise exception '이 점검의 점검자 또는 대체 점검자만 작성할 수 있습니다.'; end if;
  if v_day > kst_today() then raise exception '앞으로의 날짜는 고를 수 없습니다.'; end if;
  insert into chem_checks (group_id, check_date, week_start, user_id)
  values (p_group, v_day, date_trunc('week', v_day)::date, auth.uid())
  on conflict (group_id, week_start) do nothing;
  select id into v_id from chem_checks where group_id = p_group and week_start = date_trunc('week', v_day)::date;
  return v_id;
end $$;

drop function if exists public.save_chem_check(uuid, date, text, jsonb, jsonb);
create or replace function public.save_chem_check(p_id uuid, p_date date, p_time text, p_results jsonb, p_notes jsonb, p_sub_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v chem_checks%rowtype;
  g chem_groups%rowtype;
  v_missing int;
  it record;
  v_note text;
  v_fid uuid;
  v_insp uuid;
  v_seq int;
  v_places text;
  v_new int := 0;
  v_sub boolean;
begin
  v := _chem_editable(p_id);
  select * into g from chem_groups where id = v.group_id;
  -- 점검자가 아니면 대체 점검 : 사유 필수
  v_sub := not exists (select 1 from chem_group_members where group_id = v.group_id and user_id = auth.uid());
  if v_sub and not is_admin() and coalesce(trim(p_sub_reason), '') = '' then raise exception '대체 점검 사유를 적어 주세요. (휴가, 외근 등)'; end if;
  if p_date is null or p_date > kst_today() then raise exception '점검일을 확인해 주세요.'; end if;
  if date_trunc('week', p_date)::date <> v.week_start then raise exception '점검일은 이 점검대장의 주(%) 안이어야 합니다.', to_char(v.week_start, 'MM.DD') || ' 주'; end if;

  select count(*) into v_missing
    from chem_items i cross join chem_places pl
   where i.is_active and pl.group_id = v.group_id and pl.is_active
     and not exists (select 1 from jsonb_array_elements(coalesce(p_results, '[]')) x
                      where (x->>'item_id')::uuid = i.id and (x->>'place_id')::uuid = pl.id and x->>'result' in ('ok', 'fixed', 'recheck'));
  if v_missing > 0 then raise exception '표시하지 않은 칸이 %개 있습니다.', v_missing; end if;

  delete from chem_results where check_id = p_id;
  insert into chem_results (check_id, item_id, place_id, result)
  select p_id, (x->>'item_id')::uuid, (x->>'place_id')::uuid, x->>'result'
    from jsonb_array_elements(p_results) x
    join chem_places pl on pl.id = (x->>'place_id')::uuid and pl.group_id = v.group_id
    join chem_items i on i.id = (x->>'item_id')::uuid;

  for it in select i.* from chem_items i where i.is_active order by i.sort_order loop
    select nullif(trim(x->>'note'), '') into v_note from jsonb_array_elements(coalesce(p_notes, '[]')) x where (x->>'item_id')::uuid = it.id limit 1;
    if exists (select 1 from chem_results where check_id = p_id and item_id = it.id and result <> 'ok') and v_note is null then
      raise exception '%번 항목의 비고(조치 내용 또는 재점검 필요 사항)를 적어 주세요.', it.code;
    end if;
    select finding_id into v_fid from chem_notes where check_id = p_id and item_id = it.id;
    -- 정밀 재점검 필요 → 지적사항 (처음 한 번)
    if v_fid is null and exists (select 1 from chem_results where check_id = p_id and item_id = it.id and result = 'recheck') then
      if g.department_id is null then raise exception '점검 단위(%)의 부서가 지정되지 않았습니다. 환경설정에서 지정해 주세요.', g.name; end if;
      select string_agg(pl.name, ', ' order by pl.sort_order) into v_places
        from chem_results r join chem_places pl on pl.id = r.place_id where r.check_id = p_id and r.item_id = it.id and r.result = 'recheck';
      v_insp := _module_inspection('insp_chem', g.site_id, p_date);
      select coalesce(max(seq), 0) + 1 into v_seq from findings where inspection_id = v_insp;
      insert into findings (inspection_id, site_id, module_code, seq, sub_location_text, problem, request_department_id, created_by)
      values (v_insp, g.site_id, 'insp_chem', v_seq, v_places,
              format('[%s %s] %s', it.code, left(regexp_replace(it.content, '\s+', ' ', 'g'), 40), v_note), g.department_id, auth.uid())
      returning id into v_fid;
      perform log_event(v_fid, '등록', g.name || ' 유해화학물질 자체점검 · 정밀 재점검 필요');
      v_new := v_new + 1;
    end if;
    insert into chem_notes (check_id, item_id, note, finding_id) values (p_id, it.id, v_note, v_fid)
    on conflict (check_id, item_id) do update set note = excluded.note, finding_id = excluded.finding_id;
  end loop;

  update chem_checks set check_date = p_date, time_text = nullif(trim(p_time), ''), user_id = auth.uid(), saved_at = now(),
         sub_reason = case when v_sub then nullif(trim(p_sub_reason), '') end
   where id = p_id;

  -- 점검 지표 : 이번 주 실시 (대체 점검이면 그 점검 단위 점검자도 실시)
  insert into inspection_checks (module_code, user_id, done_on, note)
  select 'insp_chem', u, p_date, g.name || case when v_sub then ' · 대체 점검(' || (select name from profiles where id = auth.uid()) || ')' else '' end
    from (select auth.uid() u union select user_id from chem_group_members where group_id = v.group_id and v_sub) x
   where not exists (select 1 from inspection_checks where module_code = 'insp_chem' and user_id = x.u and done_on = p_date);
  return jsonb_build_object('findings', v_new);
end $$;


-- 기본 대체 점검자 : EHS부서장(종결 승인자 · 결재선 부서장) + EHS 부서 점검 단위의 점검원
insert into public.chem_substitutes (user_id)
select distinct u from (
  select d.approver_id u from public.departments d where d.name in ('EHS팀', 'EHS부서') and d.parent_id is null and d.approver_id is not null
  union
  select r.user_id from public.department_roles r join public.departments d on d.id = r.department_id where d.name in ('EHS팀', 'EHS부서') and d.parent_id is null and r.role = 'approver'
  union
  select m.user_id from public.chem_group_members m join public.chem_groups g on g.id = m.group_id join public.departments d on d.id = g.department_id where d.name in ('EHS팀', 'EHS부서')
) x
where u is not null
on conflict do nothing;
