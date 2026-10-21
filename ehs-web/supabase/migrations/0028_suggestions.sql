-- 0028 : 개선 의견 게시판 — 사용자가 시스템 개선 의견을 올리고 EHS팀이 접수·검토·답변(수용/미수용 사유)·반영 완료
--   상태 : submitted(접수 대기) → reviewing(검토 중) → accepted(수용) / rejected(미수용, 사유 필수) → done(반영 완료, 수용 건만)
--   작성자 : 실명 기본, 익명 선택 가능. 익명 글의 작성자는 본인과 관리자만 볼 수 있음
--            → 표는 본인 글·관리자만 직접 조회, 목록·상세는 이름을 가린 함수(list_suggestions, get_suggestion)로
--   공개 : 모든 사용자가 모든 의견과 답변을 봄
--   첨부 사진 : docs 버킷 suggestions/{의견ID}/…
--   알림 : 새 의견 → EHS팀(EHS팀·EHS부서와 그 하위 부서 사용자), 답변·상태 변경 → 작성자, 댓글 → 작성자 또는 답변한 EHS 담당자

create table public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  no          bigserial unique,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  anonymous   boolean not null default false,
  category    text not null default '기타',
  title       text not null check (length(trim(title)) > 0),
  body        text not null check (length(trim(body)) > 0),
  photos      text[] not null default '{}',
  status      text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected', 'done')),
  answer      text,
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.suggestions (status, created_at desc);
create index on public.suggestions (author_id);

create table public.suggestion_comments (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (length(trim(body)) > 0),
  created_at    timestamptz not null default now()
);
create index on public.suggestion_comments (suggestion_id, created_at);

create table public.suggestion_events (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index on public.suggestion_events (suggestion_id, created_at);

alter table public.suggestions         enable row level security;
alter table public.suggestion_comments enable row level security;
alter table public.suggestion_events   enable row level security;
-- 직접 조회는 본인 글·관리자만 (익명 작성자 보호). 화면은 아래 함수로 조회
create policy read_own on public.suggestions for select to authenticated using (author_id = auth.uid() or is_admin());
create policy read_admin on public.suggestion_comments for select to authenticated using (is_admin());
create policy read_admin on public.suggestion_events   for select to authenticated using (is_admin());

-- EHS 담당 : 관리자 또는 EHS팀·EHS부서(하위 부서 포함) 소속 사용자
create or replace function public._ehs_staff_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  join departments d on d.id = p.department_id
  left join departments pd on pd.id = d.parent_id
  where p.is_active and (d.name in ('EHS팀', 'EHS부서') or pd.name in ('EHS팀', 'EHS부서'))
$$;

create or replace function public.is_ehs_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or auth.uid() in (select _ehs_staff_ids())
$$;

create or replace function public._suggestion_status_label(p text) returns text
language sql immutable as $$
  select case p when 'submitted' then '접수 대기' when 'reviewing' then '검토 중' when 'accepted' then '수용'
                when 'rejected' then '미수용' when 'done' then '반영 완료' else p end
$$;

-- 화면에 보일 작성자 이름 (익명 글은 본인·관리자에게만 실명)
create or replace function public._suggestion_author_name(s suggestions) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not s.anonymous then (select name from profiles where id = s.author_id)
    when is_admin() then (select name from profiles where id = s.author_id) || ' (익명)'
    when s.author_id = auth.uid() then '익명 (나)'
    else '익명' end
$$;

create or replace function public._suggestion_notify(p_user uuid, p_s suggestions, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  insert into notifications (user_id, kind, subject, body, link)
  values (p_user, 'suggestion', p_subject, p_body, '/suggestions/' || p_s.id);
end $$;

create or replace function public._check_suggestion_photos(p_id uuid, p_photos text[]) returns void
language plpgsql immutable as $$
begin
  if coalesce(array_length(p_photos, 1), 0) > 6 then raise exception '사진은 6장까지 첨부할 수 있습니다.'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) x where x not like 'suggestions/' || p_id || '/%') then
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;
end $$;

-- 등록
create or replace function public.create_suggestion(p_id uuid, p_category text, p_title text, p_body text, p_anonymous boolean, p_photos text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v suggestions; v_u uuid;
begin
  if not is_member() then raise exception '로그인이 필요합니다.'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception '제목을 입력해 주세요.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception '내용을 입력해 주세요.'; end if;
  perform _check_suggestion_photos(p_id, p_photos);
  insert into suggestions (id, author_id, anonymous, category, title, body, photos)
  values (p_id, auth.uid(), coalesce(p_anonymous, false), coalesce(nullif(trim(p_category), ''), '기타'), trim(p_title), trim(p_body), coalesce(p_photos, '{}'))
  returning * into v;
  insert into suggestion_events (suggestion_id, actor_id, action) values (v.id, auth.uid(), 'created');
  for v_u in select distinct x from _ehs_staff_ids() x loop
    perform _suggestion_notify(v_u, v, format('[EHS] 새 개선 의견 #%s : %s', v.no, v.title),
      format('새 개선 의견이 올라왔습니다. 접수·검토해 주세요.%s분류 : %s%s작성자 : %s', chr(10), v.category, chr(10), case when v.anonymous then '익명' else (select name from profiles where id = v.author_id) end));
  end loop;
  return v.id;
end $$;

-- 수정 (작성자 · 접수 대기일 때만)
create or replace function public.update_suggestion(p_id uuid, p_category text, p_title text, p_body text, p_anonymous boolean, p_photos text[])
returns void language plpgsql security definer set search_path = public as $$
declare v suggestions;
begin
  select * into v from suggestions where id = p_id for update;
  if not found then raise exception '의견을 찾을 수 없습니다.'; end if;
  if v.author_id <> auth.uid() then raise exception '작성자만 수정할 수 있습니다.'; end if;
  if v.status <> 'submitted' then raise exception 'EHS팀이 접수한 뒤에는 수정할 수 없습니다. 댓글로 덧붙여 주세요.'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception '제목을 입력해 주세요.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception '내용을 입력해 주세요.'; end if;
  perform _check_suggestion_photos(p_id, p_photos);
  update suggestions set category = coalesce(nullif(trim(p_category), ''), '기타'), title = trim(p_title), body = trim(p_body),
    anonymous = coalesce(p_anonymous, false), photos = coalesce(p_photos, '{}'), updated_at = now() where id = p_id;
  insert into suggestion_events (suggestion_id, actor_id, action) values (p_id, auth.uid(), 'edited');
end $$;

-- 삭제 (작성자 · 접수 대기일 때, 또는 관리자) → 지울 사진 경로를 돌려줌
create or replace function public.delete_suggestion(p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v suggestions;
begin
  select * into v from suggestions where id = p_id;
  if not found then raise exception '의견을 찾을 수 없습니다.'; end if;
  if not (is_admin() or (v.author_id = auth.uid() and v.status = 'submitted')) then
    raise exception '접수 대기 중인 본인 의견만 삭제할 수 있습니다.';
  end if;
  delete from suggestions where id = p_id;
  return v.photos;
end $$;

-- EHS 담당 : 상태 변경 · 답변 (미수용은 사유 필수, 반영 완료는 수용 건만)
create or replace function public.answer_suggestion(p_id uuid, p_status text, p_answer text)
returns void language plpgsql security definer set search_path = public as $$
declare v suggestions; v_answer text := nullif(trim(coalesce(p_answer, '')), '');
begin
  if not is_ehs_staff() then raise exception 'EHS팀만 의견을 처리할 수 있습니다.'; end if;
  select * into v from suggestions where id = p_id for update;
  if not found then raise exception '의견을 찾을 수 없습니다.'; end if;
  if p_status not in ('reviewing', 'accepted', 'rejected', 'done') then raise exception '처리 상태가 올바르지 않습니다.'; end if;
  if p_status = 'rejected' and v_answer is null then raise exception '미수용 사유를 입력해 주세요.'; end if;
  if p_status = 'accepted' and v_answer is null then raise exception '수용 답변(반영 계획)을 입력해 주세요.'; end if;
  if p_status = 'done' and v.status not in ('accepted', 'done') then raise exception '수용한 의견만 반영 완료로 바꿀 수 있습니다.'; end if;

  update suggestions set
    status = p_status,
    answer = coalesce(v_answer, answer),
    answered_by = case when p_status in ('accepted', 'rejected') or v_answer is not null then auth.uid() else answered_by end,
    answered_at = case when p_status in ('accepted', 'rejected') then now() else answered_at end,
    done_at = case when p_status = 'done' then now() else null end,
    updated_at = now()
  where id = p_id returning * into v;
  insert into suggestion_events (suggestion_id, actor_id, action, note) values (p_id, auth.uid(), p_status, v_answer);
  perform _suggestion_notify(v.author_id, v,
    format('[EHS] 개선 의견 #%s %s : %s', v.no, _suggestion_status_label(p_status), v.title),
    format('올려 주신 개선 의견이 "%s" 처리되었습니다.%s', _suggestion_status_label(p_status), coalesce(chr(10) || chr(10) || v_answer, '')));
end $$;

-- 댓글 (모든 사용자)
create or replace function public.add_suggestion_comment(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v suggestions;
begin
  if not is_member() then raise exception '로그인이 필요합니다.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception '댓글을 입력해 주세요.'; end if;
  select * into v from suggestions where id = p_id;
  if not found then raise exception '의견을 찾을 수 없습니다.'; end if;
  insert into suggestion_comments (suggestion_id, author_id, body) values (p_id, auth.uid(), trim(p_body));
  perform _suggestion_notify(case when auth.uid() = v.author_id then v.answered_by else v.author_id end, v,
    format('[EHS] 개선 의견 #%s 에 댓글 : %s', v.no, v.title), trim(p_body));
end $$;

-- 목록 (모두 공개 · 익명 작성자 가림)
create or replace function public.list_suggestions(p_status text default null, p_mine boolean default false)
returns table (id uuid, no bigint, category text, title text, status text, author_name text, is_mine boolean,
               anonymous boolean, comments int, photos int, created_at timestamptz, answered_at timestamptz, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.no, s.category, s.title, s.status, _suggestion_author_name(s), s.author_id = auth.uid(),
         s.anonymous, (select count(*)::int from suggestion_comments c where c.suggestion_id = s.id),
         coalesce(array_length(s.photos, 1), 0), s.created_at, s.answered_at, s.done_at
  from suggestions s
  where is_member()
    and (p_status is null or p_status = '' or s.status = p_status or (p_status = 'open' and s.status in ('submitted', 'reviewing')))
    and (not coalesce(p_mine, false) or s.author_id = auth.uid())
  order by s.no desc
  limit 500
$$;

-- 상세 (본문 · 답변 · 댓글 · 처리 이력, 익명 작성자 가림)
create or replace function public.get_suggestion(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not is_member() then null else (
    select jsonb_build_object(
      'id', s.id, 'no', s.no, 'category', s.category, 'title', s.title, 'body', s.body, 'photos', to_jsonb(s.photos),
      'status', s.status, 'anonymous', s.anonymous, 'author_name', _suggestion_author_name(s), 'is_mine', s.author_id = auth.uid(),
      'answer', s.answer, 'answered_by_name', (select name from profiles where id = s.answered_by),
      'answered_at', s.answered_at, 'done_at', s.done_at, 'created_at', s.created_at, 'updated_at', s.updated_at,
      'can_edit', s.author_id = auth.uid() and s.status = 'submitted',
      'can_delete', is_admin() or (s.author_id = auth.uid() and s.status = 'submitted'),
      'can_answer', is_ehs_staff(),
      'comments', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'is_mine', c.author_id = auth.uid(),
          'author_name', case when c.author_id = s.author_id then _suggestion_author_name(s) || ' · 작성자'
                              else (select name from profiles where id = c.author_id) end,
          'is_ehs', c.author_id in (select _ehs_staff_ids())) order by c.created_at)
        from suggestion_comments c where c.suggestion_id = s.id), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object('action', e.action, 'note', e.note, 'created_at', e.created_at,
          'actor_name', case when e.actor_id = s.author_id then _suggestion_author_name(s) else (select name from profiles where id = e.actor_id) end)
          order by e.created_at)
        from suggestion_events e where e.suggestion_id = s.id), '[]'::jsonb))
    from suggestions s where s.id = p_id) end
$$;

revoke all on function public._ehs_staff_ids() from public;
revoke all on function public._suggestion_author_name(suggestions) from public;
revoke all on function public._suggestion_notify(uuid, suggestions, text, text) from public;
grant execute on function public.is_ehs_staff() to authenticated;
grant execute on function public.create_suggestion(uuid, text, text, text, boolean, text[]) to authenticated;
grant execute on function public.update_suggestion(uuid, text, text, text, boolean, text[]) to authenticated;
grant execute on function public.delete_suggestion(uuid) to authenticated;
grant execute on function public.answer_suggestion(uuid, text, text) to authenticated;
grant execute on function public.add_suggestion_comment(uuid, text) to authenticated;
grant execute on function public.list_suggestions(text, boolean) to authenticated;
grant execute on function public.get_suggestion(uuid) to authenticated;
