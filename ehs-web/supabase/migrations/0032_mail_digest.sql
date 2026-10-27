-- 0032 : 알림 메일을 바로 보내지 않고 매일 아침 8시(영업일) 사람마다 한 통으로
--   app_settings('mail').immediate = false (기본) : 단계별 알림(지적사항·결재·게시판·일지 등)은 대기열에만 쌓고,
--     아침 cron 이 queue_reminders(처리 늦어진 건) 뒤에 queue_event_digest 로 '새로 온 알림'을 같은 메일에 합침
--     → 원래 알림은 status 'digested' (아침 메일에 들어감)
--   immediate = true 로 바꾸면 예전처럼 일어나면 바로 발송 (환경설정 → 알림)
--   대기열 정리(3일 지난 알림 만료)는 바로 보낼 수 있는 알림에만 — 아침 메일을 기다리는 알림은 연휴에도 만료되지 않음

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'expired', 'digested'));

insert into public.app_settings (key, value) values ('mail', '{"immediate": false}')
on conflict (key) do nothing;

create or replace function public.mail_immediate() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'immediate')::boolean from app_settings where key = 'mail'), false)
$$;

-- 바로 보낼 수 있는 알림 : 바로 보내기 설정이거나, 아침 메일(reminder · digest)
create or replace function public._mailable(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select mail_immediate() or p_kind in ('reminder', 'digest')
$$;

drop function if exists public.claim_notifications(int);
create function public.claim_notifications(p_limit int default 30)
returns table (id uuid, finding_id uuid, link text, subject text, body text, email text, name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update notifications set status = 'expired'
   where status in ('pending', 'failed') and created_at < now() - interval '3 days' and _mailable(kind);
  update notifications set status = 'pending'
   where status = 'sending' and created_at < now() - interval '10 minutes';

  return query
  with picked as (
    select n.id from notifications n
     where (n.status = 'pending' or (n.status = 'failed' and n.attempts < 5)) and _mailable(n.kind)
     order by n.created_at
     limit p_limit
     for update skip locked
  )
  update notifications n set status = 'sending', attempts = n.attempts + 1
    from picked, profiles p
   where n.id = picked.id and p.id = n.user_id
  returning n.id, n.finding_id, n.link, n.subject, n.body, p.email, p.name;
end $$;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;

-- 아침 메일 : 사람마다 아직 안 보낸 알림(최근 14일)을 모아, 오늘 '처리 늦어진 건' 메일이 있으면 그 앞에 붙이고 없으면 새로 한 통
create or replace function public.queue_event_digest(p_today date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, kst_today());
  v_user uuid; v_n int; v_list text; v_ids uuid[]; v_rem uuid; v_count int := 0;
begin
  if mail_immediate() or not is_biz_day(v_today) then return 0; end if;
  update notifications set status = 'expired'
   where status = 'pending' and kind not in ('reminder', 'digest') and created_at < now() - interval '14 days';
  for v_user, v_n, v_list, v_ids in
    select n.user_id, count(*)::int,
           string_agg('- ' || regexp_replace(n.subject, '^\[EHS\]\s*', '') || ' (' || to_char(n.created_at at time zone 'Asia/Seoul', 'MM.DD HH24:MI') || ')', E'\n' order by n.created_at),
           array_agg(n.id)
      from notifications n join profiles p on p.id = n.user_id and p.is_active
     where n.status = 'pending' and n.kind not in ('reminder', 'digest')
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

grant execute on function public.mail_immediate() to authenticated;
