-- 0034 : 알림 종류마다 보내는 방식 설정 (환경설정 → 알림)
--   app_settings('notify') = { "kinds": { 종류: "digest" | "immediate" | "off" }, "stages": { 단계: true|false }, "daily_deadline": true|false }
--     kinds   : 단계별 알림 — digest = 다음 영업일 아침 8시 한 통에 모아서 · immediate = 바로 · off = 보내지 않음
--               정하지 않은 종류는 0032 의 기본값(app_settings('mail').immediate)을 따름
--               결재 결과(approval_approved · approval_rejected …)는 'approval_result' 하나로 설정
--     stages  : 아침 '처리가 늦어진 건' 단계(assign · plan · due_soon · overdue · approve) 켜기/끄기
--     daily_deadline : 관리감독자 월간 일지 제출 마감 알림 켜기/끄기
--   프로그램 '내 할 일' 은 설정과 상관없이 그대로 보임 (메일만 조절)

insert into public.app_settings (key, value) values ('notify', '{"kinds": {}, "stages": {}, "daily_deadline": true}')
on conflict (key) do nothing;

create or replace function public.notify_kind_key(p_kind text) returns text
language sql immutable as $$
  select case when p_kind like 'approval\_%' and p_kind not in ('approval_request', 'approval_cc') then 'approval_result' else p_kind end
$$;

create or replace function public.mail_mode(p_kind text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value->'kinds'->>notify_kind_key(p_kind) from app_settings where key = 'notify'),
    case when mail_immediate() then 'immediate' else 'digest' end)
$$;

-- 바로 꺼내 보낼 수 있는 알림 : 아침 메일(reminder · digest) 또는 '바로' 로 정한 종류
create or replace function public._mailable(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_kind in ('reminder', 'digest') or mail_mode(p_kind) = 'immediate'
$$;

-- 아침 메일 : '아침에 모아서' 종류만 모음, '보내지 않음' 종류는 만료
create or replace function public.queue_event_digest(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, kst_today());
  v_user uuid; v_n int; v_list text; v_ids uuid[]; v_rem uuid; v_count int := 0;
begin
  update notifications set status = 'expired', last_error = '환경설정에서 보내지 않음'
   where status = 'pending' and kind not in ('reminder', 'digest') and mail_mode(kind) = 'off';
  if not is_biz_day(v_today) then return 0; end if;
  update notifications set status = 'expired'
   where status = 'pending' and kind not in ('reminder', 'digest') and created_at < now() - interval '14 days';
  for v_user, v_n, v_list, v_ids in
    select n.user_id, count(*)::int,
           string_agg('- ' || regexp_replace(n.subject, '^\[EHS\]\s*', '') || ' (' || to_char(n.created_at at time zone 'Asia/Seoul', 'MM.DD HH24:MI') || ')', E'\n' order by n.created_at),
           array_agg(n.id)
      from notifications n join profiles p on p.id = n.user_id and p.is_active
     where n.status = 'pending' and n.kind not in ('reminder', 'digest') and mail_mode(n.kind) = 'digest'
     group by n.user_id
  loop
    select id into v_rem from notifications
     where user_id = v_user and kind = 'reminder' and status = 'pending' and (created_at at time zone 'Asia/Seoul')::date = v_today
     order by created_at desc limit 1;
    if v_rem is not null then
      update notifications
         set subject = format('[EHS] 오늘의 알림 : 새 알림 %s건 · %s', v_n, regexp_replace(subject, '^\[EHS\]\s*', '')),
             body = format(E'■ 새로 온 알림 (%s건)\n%s\n\n', v_n, v_list) || body
       where id = v_rem;
    else
      insert into notifications (user_id, kind, subject, body, link)
      values (v_user, 'digest', format('[EHS] 오늘의 알림 : 새 알림 %s건', v_n),
              format(E'■ 새로 온 알림 (%s건)\n%s\n\n프로그램에 로그인해 "내 할 일" 에서 확인해 주세요.', v_n, v_list), '/');
    end if;
    update notifications set status = 'digested' where id = any(v_ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.queue_event_digest(date) from public, anon, authenticated;

-- 아침 '처리가 늦어진 건' : 끈 단계는 빼고 (queue_reminders · preview_reminders 가 이 이름으로 부름)
alter function public._reminder_targets(date) rename to _reminder_targets_all;
create or replace function public._reminder_targets(p_today date)
returns table (stage text, user_id uuid, finding_id uuid, measure_id uuid, target_date date)
language sql stable security definer set search_path = public as $$
  select t.stage, t.user_id, t.finding_id, t.measure_id, t.target_date
    from _reminder_targets_all(p_today) t
   where coalesce((select (value->'stages'->>t.stage)::boolean from app_settings where key = 'notify'), true)
$$;
revoke execute on function public._reminder_targets(date) from public, anon, authenticated;
revoke execute on function public._reminder_targets_all(date) from public, anon, authenticated;

-- 관리감독자 일지 마감 알림 켜기/끄기
alter function public.queue_daily_log_reminders(date) rename to _queue_daily_log_reminders_all;
create or replace function public.queue_daily_log_reminders(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select (value->>'daily_deadline')::boolean from app_settings where key = 'notify'), true) then return 0; end if;
  return _queue_daily_log_reminders_all(p_today);
end $$;
revoke execute on function public.queue_daily_log_reminders(date) from public, anon, authenticated;
revoke execute on function public._queue_daily_log_reminders_all(date) from public, anon, authenticated;
