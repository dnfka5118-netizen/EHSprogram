-- =====================================================================
-- 이미 처리한 건의 알림은 메일로 보내지 않음
--   아침 메일로 묶기 직전 · 바로 보내기 직전에 그 건의 지금 상태를 다시 보고,
--   할 일이 끝난 알림은 status 'expired' · last_error '이미 처리됨' 으로 돌림
--     request    (조치담당자 지정 요청)      : 지정 대기가 아님
--     assigned   (조치담당자로 지정됨)        : 계획 수립 대기가 아니거나, 받는 사람이 더 이상 담당자가 아님
--     approval   (종결 승인 요청)             : 승인 대기가 아님
--     rejected   (반려)                       : 조치 중이 아님 (다시 완료 보고 · 종결)
--     suggestion '새 개선 의견'               : 접수 대기가 아님 (EHS팀이 답변함) · 의견이 지워짐
--   closed · directive · 개선 의견 답변 · 처리가 늦어진 건(reminder) · 아침 메일(digest) 은 그대로
-- =====================================================================

create or replace function public._notification_done(n notifications) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when n.kind = 'request' then
      coalesce((select status <> 'assign_wait' from findings where id = n.finding_id), false)
    when n.kind = 'assigned' then
      coalesce((select f.status <> 'plan_wait'
                    or not exists (select 1 from finding_assignees a where a.finding_id = f.id and a.user_id = n.user_id)
                  from findings f where f.id = n.finding_id), false)
    when n.kind = 'approval' then
      coalesce((select status <> 'approval_wait' from findings where id = n.finding_id), false)
    when n.kind = 'rejected' then
      coalesce((select status <> 'in_progress' from findings where id = n.finding_id), false)
    when n.kind = 'suggestion' and n.subject like '[EHS] 새 개선 의견 #%' and n.link like '/suggestions/%' then
      coalesce((select status <> 'submitted' from suggestions where id::text = substr(n.link, 14)), true)  -- 지워진 의견도 뺌
    else false
  end
$$;
revoke execute on function public._notification_done(notifications) from public, anon, authenticated;

create or replace function public.expire_resolved_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update notifications n set status = 'expired', last_error = '이미 처리됨'
   where n.status in ('pending', 'failed') and n.kind in ('request', 'assigned', 'approval', 'rejected', 'suggestion')
     and _notification_done(n);
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.expire_resolved_notifications() from public, anon, authenticated;

-- 아침 메일 : 묶기 전에 처리된 알림 빼기
alter function public.queue_event_digest(date) rename to _queue_event_digest_all;
create or replace function public.queue_event_digest(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform expire_resolved_notifications();
  return _queue_event_digest_all(p_today);
end $$;
revoke execute on function public.queue_event_digest(date) from public, anon, authenticated;
revoke execute on function public._queue_event_digest_all(date) from public, anon, authenticated;

-- 바로 보내기 : 꺼내기 전에 처리된 알림 빼기
alter function public.claim_notifications(int) rename to _claim_notifications_all;
create or replace function public.claim_notifications(p_limit int default 30)
returns table (id uuid, finding_id uuid, link text, subject text, body text, email text, name text)
language plpgsql security definer set search_path = public as $$
begin
  perform expire_resolved_notifications();
  return query select * from _claim_notifications_all(p_limit);
end $$;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public._claim_notifications_all(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
