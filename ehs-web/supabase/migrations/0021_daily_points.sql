-- =====================================================================
-- 관리감독자 일일점검 : 사람별 일지 + 장소별 QR
--   · daily_areas = 관리감독자 한 사람의 담당 Area (양식 A~D · 부서 · 담당 장소 여러 곳) → 하루 1번 점검, 월 일지 1장
--   · daily_points = 현장에 붙이는 QR 지점 (장소 · 세부장소). 내 담당 Area 에 묶인 QR 중 아무거나 찍으면 내 점검표가 열림
--     (분석실처럼 여러 명이 같이 맡은 곳은 같은 QR 을 각자 찍고 각자 일지에 기록)
--   · QR 없는 양식 (C형 사무실 · D형 부서장) : 일일점검 화면의 [점검하기] 로 바로 점검 (daily_forms.use_qr = false)
--   · 담당 아닌 사람이 QR 을 찍으면 그 장소 담당자 중 누구 대신인지 골라 대체 점검
-- =====================================================================

alter table public.daily_forms add column if not exists use_qr boolean not null default true;
update public.daily_forms set use_qr = false where code in ('C', 'D');

alter table public.daily_areas add column if not exists area_text text;  -- 담당 Area (일지 머리글, 비우면 묶인 장소 이름)

create table if not exists public.daily_points (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id),
  name            text not null,
  location_id     uuid references public.locations(id) on delete set null,
  sub_location_id uuid references public.sub_locations(id) on delete set null,
  qr_token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create table if not exists public.daily_area_points (
  area_id  uuid not null references public.daily_areas(id) on delete cascade,
  point_id uuid not null references public.daily_points(id) on delete cascade,
  primary key (area_id, point_id)
);
create index if not exists daily_area_points_point on public.daily_area_points (point_id);
alter table public.daily_points      enable row level security;
alter table public.daily_area_points enable row level security;
create policy read_all on public.daily_points       for select to authenticated using (is_member());
create policy admin_all on public.daily_points      for all to authenticated using (is_admin()) with check (is_admin());
create policy read_all on public.daily_area_points  for select to authenticated using (is_member());
create policy admin_all on public.daily_area_points for all to authenticated using (is_admin()) with check (is_admin());

alter table public.daily_checks add column if not exists point_id uuid references public.daily_points(id) on delete set null; -- 찍은 QR

create or replace function public.reissue_daily_point_qr(p_point uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_admin() then raise exception '관리자만 재발급할 수 있습니다.'; end if;
  update daily_points set qr_token = replace(gen_random_uuid()::text, '-', '') where id = p_point returning qr_token into v;
  if v is null then raise exception 'QR 지점을 찾을 수 없습니다.'; end if;
  return v;
end $$;

create or replace function public.set_daily_area_points(p_area uuid, p_points uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 지정할 수 있습니다.'; end if;
  delete from daily_area_points where area_id = p_area and point_id <> all (coalesce(p_points, '{}'));
  insert into daily_area_points (area_id, point_id) select p_area, u from unnest(coalesce(p_points, '{}')) u on conflict do nothing;
end $$;

-- 담당 Area 표시 : 직접 적은 설명 → 없으면 묶인 QR 지점 이름
create or replace function public.daily_area_label(p_area uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(a.area_text), ''),
                  (select string_agg(p.name, ', ' order by p.sort_order, p.name) from daily_area_points ap join daily_points p on p.id = ap.point_id where ap.area_id = a.id),
                  a.name)
    from daily_areas a where a.id = p_area
$$;

-- ---------------------------------------------------------------------
-- 토큰 → 점검할 담당 Area
--   QR 지점 토큰 : 그 지점에 묶인 Area 중 p_area (대체 점검 시 고른 사람) 또는 내가 담당인 Area
--   Area 토큰    : QR 없는 양식(C·D형)만 (일일점검 화면의 [점검하기])
-- ---------------------------------------------------------------------
create or replace function public._daily_resolve(p_token text, p_area uuid, out area_id uuid, out point_id uuid, out point_name text)
language plpgsql stable security definer set search_path = public as $$
declare v_qr boolean;
begin
  select p.id, p.name into point_id, point_name from daily_points p where p.qr_token = p_token and p.is_active;
  if point_id is not null then
    if p_area is not null then
      if not exists (select 1 from daily_area_points ap join daily_areas a on a.id = ap.area_id
                      where ap.point_id = _daily_resolve.point_id and ap.area_id = p_area and a.is_active) then
        raise exception '이 장소(%)의 담당 관리감독자가 아닙니다.', point_name;
      end if;
      area_id := p_area;
    else
      select ap.area_id into area_id
        from daily_area_points ap join daily_areas a on a.id = ap.area_id join daily_area_members m on m.area_id = a.id
       where ap.point_id = _daily_resolve.point_id and a.is_active and m.user_id = auth.uid()
       order by a.name limit 1;
    end if;
    return;
  end if;
  select a.id, f.use_qr into area_id, v_qr from daily_areas a join daily_forms f on f.code = a.form_code where a.qr_token = p_token and a.is_active;
  if area_id is null then raise exception '등록되지 않았거나 재발급되어 사용할 수 없는 QR 코드입니다. EHS부서에 문의해 주세요.'; end if;
  if v_qr then raise exception '이 점검은 현장에 붙은 QR 을 찍어서 해야 합니다.'; end if;
end $$;
revoke execute on function public._daily_resolve(text, uuid) from public, anon, authenticated;

-- 화면 내용 : 담당 Area 표시 · QR 사용 여부 추가
create or replace function public._daily_payload(p_area uuid, p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', p_day,
    'biz_day', is_biz_day(p_day),
    'area', jsonb_build_object(
      'id', a.id, 'name', a.name, 'label', daily_area_label(a.id), 'form_code', a.form_code, 'department_id', a.department_id,
      'location_id', a.location_id, 'sub_location_id', a.sub_location_id,
      'department', (select name from departments where id = a.department_id),
      'location', (select name from locations where id = a.location_id),
      'sub_location', (select name from sub_locations where id = a.sub_location_id),
      'site', (select name from sites where id = a.site_id)),
    'form', (select to_jsonb(f) from daily_forms f where f.code = a.form_code),
    'is_member', exists (select 1 from daily_area_members where area_id = a.id and user_id = auth.uid()) or is_admin(),
    'can_substitute', perm_level('insp_daily') >= 2,
    'members', coalesce((select jsonb_agg(p.name || coalesce(' ' || p.position, '') order by p.name)
                           from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = a.id), '[]'),
    'member_list', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'position', p.position) order by p.name)
                           from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = a.id and p.id <> auth.uid()), '[]'),
    'checked_by', (select name from profiles where id = c.user_id),
    'checked_at', c.submitted_at,
    'is_backfill', coalesce(c.is_backfill, false),
    'substitute_for', (select name from profiles where id = c.substitute_for),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'category', i.category, 'code', i.code, 'content', i.content, 'cycle', i.cycle, 'cycle_note', i.cycle_note,
               'done_on', d.done_on, 'result', r.result, 'note', r.note, 'action', r.action, 'finding_id', r.finding_id)
             order by i.sort_order)
        from daily_due_items(a.id, p_day) d
        join daily_form_items i on i.id = d.item_id
        left join daily_results r on r.check_id = c.id and r.item_id = i.id), '[]')
  )
  from daily_areas a
  left join daily_checks c on c.area_id = a.id and c.check_date = p_day
  where a.id = p_area
$$;

-- QR · [점검하기] 열기 : 담당이 정해지지 않으면(담당 아닌 사람이 QR) 이 장소 담당자 목록을 돌려줌 → 대체 점검할 사람 선택
drop function if exists public.daily_open(text);
create or replace function public.daily_open(p_token text, p_area uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not is_member() then raise exception '로그인이 필요합니다.'; end if;
  select * into r from _daily_resolve(p_token, p_area);
  if r.area_id is null then
    return jsonb_build_object(
      'choose', true,
      'point', r.point_name,
      'areas', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'form_code', a.form_code,
                 'members', (select string_agg(p.name || coalesce(' ' || p.position, ''), ', ') from daily_area_members m join profiles p on p.id = m.user_id where m.area_id = a.id))
               order by a.name)
          from daily_area_points ap join daily_areas a on a.id = ap.area_id
         where ap.point_id = r.point_id and a.is_active), '[]'));
  end if;
  return _daily_payload(r.area_id, kst_today()) || jsonb_build_object('point', r.point_name);
end $$;

-- 저장 : 찍은 QR 지점 기록 · 부적합 지적사항 장소 = 찍은 장소
drop function if exists public.submit_daily_check(text, jsonb, timestamptz, uuid, text);
create or replace function public.submit_daily_check(p_token text, p_results jsonb, p_scanned_at timestamptz default null,
                                                     p_sub_for uuid default null, p_sub_reason text default null, p_area uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rv record;
  v_area daily_areas%rowtype;
  v_today date := kst_today();
  v_member boolean;
  v_r jsonb;
  v_prev daily_checks%rowtype;
  v_pt daily_points%rowtype;
begin
  if perm_level('insp_daily') < 2 then raise exception '관리감독자 일일점검을 등록할 권한이 없습니다.'; end if;
  select * into rv from _daily_resolve(p_token, p_area);
  if rv.area_id is null then raise exception '누구 대신 점검하는지 골라 주세요.'; end if;
  select * into v_area from daily_areas where id = rv.area_id;
  v_member := is_admin() or exists (select 1 from daily_area_members where area_id = v_area.id and user_id = auth.uid());

  if p_sub_for is not null or not v_member then
    if p_sub_for is null then raise exception '이 구역(%) 담당자가 아닙니다. 대체 점검이면 누구 대신인지 골라 주세요.', v_area.name; end if;
    if not exists (select 1 from daily_area_members where area_id = v_area.id and user_id = p_sub_for) then
      raise exception '대신하는 사람이 이 구역 담당 관리감독자가 아닙니다.';
    end if;
    if p_sub_for = auth.uid() then raise exception '본인을 대신할 수는 없습니다.'; end if;
    if coalesce(trim(p_sub_reason), '') = '' then raise exception '대체 점검 사유를 적어 주세요. (휴가, 외근 등)'; end if;
  end if;
  select * into v_prev from daily_checks where area_id = v_area.id and check_date = v_today;
  if v_prev.is_backfill then raise exception '오늘 기록이 소급 입력으로 되어 있습니다.'; end if;

  v_r := _daily_save(v_area.id, v_today, p_results, 'qr', p_scanned_at, p_sub_for, p_sub_reason, null);

  if rv.point_id is not null then
    update daily_checks set point_id = rv.point_id where id = (v_r->>'check_id')::uuid;
    select * into v_pt from daily_points where id = rv.point_id;
    update findings f set location_id = v_pt.location_id, sub_location_id = v_pt.sub_location_id,
                          sub_location_text = case when v_pt.sub_location_id is null then v_pt.name end
     where f.id in (select r.finding_id from daily_results r where r.check_id = (v_r->>'check_id')::uuid and r.finding_id is not null)
       and f.location_id is null and f.created_at >= now();
  end if;

  insert into inspection_checks (module_code, user_id, done_on, note)
  select 'insp_daily', u, v_today, v_area.name || case when u = p_sub_for then ' · 대체 점검(' || (select name from profiles where id = auth.uid()) || ')' else '' end
    from unnest(array[auth.uid(), p_sub_for]) u
   where u is not null
     and not exists (select 1 from inspection_checks where module_code = 'insp_daily' and user_id = u and done_on = v_today);
  return v_r;
end $$;

-- 소급 안내 문구 (C·D형은 QR 없음)
create or replace function public._daily_backfill_check(p_area uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (is_admin() or exists (select 1 from daily_area_members where area_id = p_area and user_id = auth.uid())) then
    raise exception '이 구역 담당 관리감독자만 소급 입력할 수 있습니다.';
  end if;
  if p_day >= kst_today() then raise exception '소급 입력은 지난 날짜만 가능합니다. 오늘 점검은 QR 또는 [점검하기] 로 해 주세요.'; end if;
  if exists (select 1 from daily_checks where area_id = p_area and check_date = p_day) then
    raise exception '%은(는) 이미 점검 기록이 있는 날입니다.', to_char(p_day, 'YYYY.MM.DD');
  end if;
  select ap.status into v_status
    from daily_logs l join approvals ap on ap.module_code = 'insp_daily' and ap.doc_id = l.id
   where l.area_id = p_area and l.ym = date_trunc('month', p_day)::date;
  if v_status in ('in_review', 'approved') then
    raise exception '%월 일지가 이미 상신(결재 중 또는 완료)되어 소급 입력할 수 없습니다.', extract(month from p_day)::int;
  end if;
end $$;
revoke execute on function public._daily_backfill_check(uuid, date) from public, anon, authenticated;
