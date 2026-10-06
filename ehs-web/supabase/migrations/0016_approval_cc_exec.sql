-- =====================================================================
-- 전자결재 : 수신및참조 · 시행자
--   결재라인 지정 창에서 [수신참조] [시행] 으로 고른 사람을 문서별로 저장
--   상신할 때 p_steps 안에 step_kind '참조' / '시행' 으로 함께 넘어오면 결재 단계가 아니라 목록으로 저장
--   · 결재 문서를 볼 수 있고, 결재가 완료되면 알림을 받는다
-- =====================================================================

alter table public.approvals add column if not exists cc_ids   uuid[] not null default '{}';
alter table public.approvals add column if not exists exec_ids uuid[] not null default '{}';

create or replace function public.can_view_approval(p_approval uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from approvals a
    where a.id = p_approval and (
      perm_level(a.module_code) >= 1
      or a.drafter_id = auth.uid()
      or auth.uid() = any (a.cc_ids)
      or auth.uid() = any (a.exec_ids)
      or exists (select 1 from approval_steps s where s.approval_id = a.id and s.approver_id = auth.uid())
    )
  )
$$;

create or replace function public._submit_approval(
  p_module text, p_doc uuid, p_title text, p_site uuid, p_department uuid, p_steps jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ap approvals%rowtype;
  v_item jsonb;
  v_order int := 0;
  v_approver uuid;
  v_kind text;
  v_first_pending boolean := true;
  v_status text;
  v_non_drafter int := 0;
  v_cc uuid[] := '{}';
  v_exec uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) = 0 then raise exception '결재선을 지정해 주세요.'; end if;

  -- 수신참조 · 시행자 : 결재 단계가 아닌 목록
  for v_item in select * from jsonb_array_elements(p_steps) loop
    v_kind := v_item->>'step_kind';
    if v_kind in ('참조', '시행') then
      v_approver := nullif(v_item->>'approver_id', '')::uuid;
      if v_approver is null or not exists (select 1 from profiles where id = v_approver and is_active) then
        raise exception '사용할 수 없는 수신참조·시행자가 포함되어 있습니다.';
      end if;
      if v_kind = '참조' and not v_approver = any (v_cc) then v_cc := v_cc || v_approver; end if;
      if v_kind = '시행' and not v_approver = any (v_exec) then v_exec := v_exec || v_approver; end if;
    end if;
  end loop;

  select * into v_ap from approvals where module_code = p_module and doc_id = p_doc for update;
  if found then
    if v_ap.status in ('in_review', 'approved') then raise exception '이미 결재가 진행 중이거나 완료된 문서입니다.'; end if;
    update approvals set status = 'in_review', round = round + 1, title = p_title, site_id = p_site,
           department_id = p_department, submitted_at = now(), completed_at = null, cc_ids = v_cc, exec_ids = v_exec
     where id = v_ap.id returning * into v_ap;
  else
    insert into approvals (module_code, doc_id, title, site_id, department_id, drafter_id, cc_ids, exec_ids)
    values (p_module, p_doc, p_title, p_site, p_department, auth.uid(), v_cc, v_exec)
    returning * into v_ap;
  end if;

  for v_item in select * from jsonb_array_elements(p_steps) loop
    v_kind := coalesce(nullif(v_item->>'step_kind', ''), '검토');
    if v_kind in ('참조', '시행') then continue; end if;
    v_order := v_order + 1;
    v_approver := nullif(v_item->>'approver_id', '')::uuid;
    if v_kind not in ('담당', '검토', '협조', '승인', '확인') then raise exception '결재 구분이 올바르지 않습니다.'; end if;
    if v_approver is null then raise exception '%단계(%)의 결재자를 지정해 주세요.', v_order, coalesce(v_item->>'label', v_kind); end if;
    if not exists (select 1 from profiles where id = v_approver and is_active) then raise exception '사용할 수 없는 결재자가 포함되어 있습니다.'; end if;

    if v_kind = '담당' and v_approver = auth.uid() then
      v_status := 'approved';
    else
      v_non_drafter := v_non_drafter + 1;
      v_status := case when v_first_pending then 'pending' else 'waiting' end;
      v_first_pending := false;
    end if;

    insert into approval_steps (approval_id, round, step_order, step_kind, label, approver_id, status, acted_at)
    values (v_ap.id, v_ap.round, v_order, v_kind, coalesce(nullif(trim(v_item->>'label'), ''), v_kind), v_approver, v_status,
            case when v_status = 'approved' then now() end);
  end loop;

  if v_non_drafter = 0 then raise exception '작성자 외 결재자를 1명 이상 지정해 주세요.'; end if;
  return v_ap.id;
end $$;
revoke execute on function public._submit_approval(text, uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- 결재 완료 · 반려 알림 : 상신자 + (완료 시) 수신참조 · 시행자
create or replace function public.on_approval_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_comment text;
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then return new; end if;
  select comment into v_comment from approval_steps
   where approval_id = new.id and round = new.round and status = 'rejected' limit 1;
  if new.drafter_id is not null and new.drafter_id is distinct from auth.uid() then
    insert into notifications (user_id, kind, subject, body, link)
    select new.drafter_id, 'approval_' || new.status,
           format('[EHS] %s : %s', case new.status when 'approved' then '결재 완료' else '결재 반려' end, new.title),
           case new.status
             when 'approved' then format(E'상신한 %s 결재가 모두 완료되었습니다.\n\n제목: %s', m.name, new.title)
             else format(E'상신한 %s 가(이) 반려되었습니다.\n반려 사유: %s\n\n내용을 수정한 뒤 다시 상신해 주세요.\n제목: %s', m.name, coalesce(v_comment, '-'), new.title)
           end,
           approval_doc_path(new.module_code, new.doc_id)
      from modules m where m.code = new.module_code;
  end if;
  if new.status = 'approved' then
    insert into notifications (user_id, kind, subject, body, link)
    select u, 'approval_cc',
           format('[EHS] %s 결재 완료 (%s) : %s', m.name, case when u = any (new.exec_ids) then '시행' else '수신참조' end, new.title),
           format(E'%s 결재가 완료되었습니다. %s\n\n제목: %s', m.name,
                  case when u = any (new.exec_ids) then '시행자로 지정되었습니다.' else '수신참조로 공유합니다.' end, new.title),
           approval_doc_path(new.module_code, new.doc_id)
      from modules m, unnest(new.exec_ids || new.cc_ids) u
     where m.code = new.module_code and u is distinct from new.drafter_id
       and exists (select 1 from profiles p where p.id = u and p.is_active)
     group by u, m.name;
  end if;
  return new;
end $$;
