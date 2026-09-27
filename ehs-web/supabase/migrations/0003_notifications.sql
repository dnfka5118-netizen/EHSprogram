-- =====================================================================
-- 이메일 알림 (발송 대기열) + 기존 엑셀 데이터 이관용 컬럼
-- =====================================================================

-- 이관 데이터 중복 방지용 (예: 'xlsx:2026_CEO:7')
alter table public.findings add column if not exists legacy_ref text unique;

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  finding_id  uuid references public.findings(id) on delete cascade,
  kind        text not null,
  subject     text not null,
  body        text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'sending', 'sent', 'failed', 'expired')),
  attempts    int  not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index on public.notifications (status, created_at);

alter table public.notifications enable row level security;
create policy read_own on public.notifications for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- 메일 제목·본문용 지적사항 요약
create or replace function public.finding_label(p_finding uuid) returns text
language sql stable security definer set search_path = public as $$
  select format('%s #%s (%s)', m.name, f.seq, to_char(i.inspection_date, 'YY.MM'))
  from findings f join modules m on m.code = f.module_code join inspections i on i.id = f.inspection_id
  where f.id = p_finding
$$;

create or replace function public.finding_summary(p_finding uuid) returns text
language sql stable security definer set search_path = public as $$
  select format(E'점검: %s\n장소: %s%s\n조치 요청 부서: %s\n문제점: %s',
                finding_label(f.id), coalesce(l.name, '-'),
                coalesce(' / ' || coalesce(sl.name, f.sub_location_text), ''),
                d.name, f.problem)
  from findings f
  join departments d on d.id = f.request_department_id
  left join locations l on l.id = f.location_id
  left join sub_locations sl on sl.id = f.sub_location_id
  where f.id = p_finding
$$;

-- 알림 적재 : 본인 행동은 본인에게 알리지 않음, 비활성 사용자 제외
create or replace function public.queue_mail(p_users uuid[], p_finding uuid, p_kind text, p_subject text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, finding_id, kind, subject, body)
  select distinct u.id, p_finding, p_kind, p_subject, p_body
  from unnest(p_users) u(id)
  join profiles p on p.id = u.id and p.is_active
  where u.id is distinct from auth.uid()
$$;

create or replace function public.admin_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from profiles where is_admin and is_active
$$;

-- 처리 이력이 쌓일 때 수신자를 정해 알림 적재
create or replace function public.on_finding_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_f findings%rowtype;
  v_d departments%rowtype;
  v_label text;
  v_summary text;
  v_to uuid[];
  v_assignees uuid[];
begin
  select * into v_f from findings where id = new.finding_id;
  select * into v_d from departments where id = v_f.request_department_id;
  v_label := finding_label(new.finding_id);
  v_summary := finding_summary(new.finding_id);
  select coalesce(array_agg(user_id), '{}') into v_assignees from finding_assignees where finding_id = new.finding_id;

  if new.action = '등록' then
    v_to := array_remove(array[v_d.assigner_id, v_d.approver_id], null);
    if cardinality(v_to) = 0 then v_to := admin_ids(); end if;
    perform queue_mail(v_to, new.finding_id, 'request',
      format('[EHS] 조치 요청 - 조치담당자를 지정해 주세요 : %s', v_label),
      E'귀 부서로 점검 지적사항 조치가 요청되었습니다.\n부서 내 조치담당자를 지정해 주세요.\n\n' || v_summary);

  elsif new.action in ('담당자 지정', '담당자 변경') then
    -- 이번에 새로 지정된 사람에게만
    select coalesce(array_agg(user_id), '{}') into v_to
      from finding_assignees where finding_id = new.finding_id and assigned_at = now();
    perform queue_mail(v_to, new.finding_id, 'assigned',
      format('[EHS] 조치담당자로 지정되었습니다 : %s', v_label),
      E'점검 지적사항의 조치담당자로 지정되었습니다.\n조치계획(즉시조치 / 단기대책 / 장기대책)과 목표일을 등록해 주세요.\n\n' || v_summary);

  elsif new.action = '완료 보고' then
    v_to := array_remove(array[v_d.approver_id], null);
    if cardinality(v_to) = 0 then v_to := admin_ids(); end if;
    perform queue_mail(v_to, new.finding_id, 'approval',
      format('[EHS] 종결 승인 요청 : %s', v_label),
      E'조치담당자가 조치 완료를 보고했습니다.\n개선 후 사진을 확인하고 승인 또는 반려해 주세요.\n\n' || v_summary);

  elsif new.action = '반려' then
    perform queue_mail(v_assignees, new.finding_id, 'rejected',
      format('[EHS] 조치 완료가 반려되었습니다 : %s', v_label),
      format(E'부서장이 조치 완료 보고를 반려했습니다.\n반려 사유: %s\n\n', coalesce(new.detail, '-')) || v_summary);

  elsif new.action = '종결 승인' then
    perform queue_mail(v_assignees || v_f.created_by, new.finding_id, 'closed',
      format('[EHS] 지적사항이 종결되었습니다 : %s', v_label),
      E'부서장 승인으로 지적사항이 종결되었습니다.\n\n' || v_summary);
  end if;
  return new;
end $$;

create trigger finding_event_mail after insert on public.finding_events
  for each row execute function public.on_finding_event();

-- 지시사항 등록 시 조치담당자·부서장에게
create or replace function public.on_finding_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to uuid[];
begin
  if not new.is_directive then return new; end if;
  select coalesce(array_agg(user_id), '{}') into v_to from finding_assignees where finding_id = new.finding_id;
  select v_to || array_remove(array[d.approver_id], null) into v_to
    from findings f join departments d on d.id = f.request_department_id
   where f.id = new.finding_id;
  perform queue_mail(v_to, new.finding_id, 'directive',
    format('[EHS] 지시사항이 등록되었습니다 : %s', finding_label(new.finding_id)),
    format(E'지시사항: %s\n\n', new.body) || finding_summary(new.finding_id));
  return new;
end $$;

create trigger finding_comment_mail after insert on public.finding_comments
  for each row execute function public.on_finding_comment();

-- 발송기(서버)가 보낼 메일을 가져감 : 중복 발송 방지(skip locked), 3일 지난 미발송은 만료
create or replace function public.claim_notifications(p_limit int default 30)
returns table (id uuid, finding_id uuid, subject text, body text, email text, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update notifications set status = 'expired'
   where status in ('pending', 'failed') and created_at < now() - interval '3 days';
  update notifications set status = 'pending'
   where status = 'sending' and created_at < now() - interval '10 minutes';

  return query
  with picked as (
    select n.id from notifications n
     where n.status = 'pending' or (n.status = 'failed' and n.attempts < 5)
     order by n.created_at
     limit p_limit
     for update skip locked
  )
  update notifications n set status = 'sending', attempts = n.attempts + 1
    from picked, profiles p
   where n.id = picked.id and p.id = n.user_id
  returning n.id, n.finding_id, n.subject, n.body, p.email, p.name;
end $$;

create or replace function public.finish_notification(p_id uuid, p_ok boolean, p_error text)
returns void language sql security definer set search_path = public as $$
  update notifications
     set status = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() end,
         last_error = p_error
   where id = p_id
$$;

-- 발송 관련 함수는 서버(service_role)만 실행
revoke execute on function public.queue_mail(uuid[], uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.finish_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.queue_mail(uuid[], uuid, text, text, text) to service_role;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.finish_notification(uuid, boolean, text) to service_role;
