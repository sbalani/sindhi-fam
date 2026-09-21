-- Existing-person family editing foundation. Existing write paths remain valid;
-- trigger-backed revisions make those writes auditable as well.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.family_members
add column if not exists revision bigint not null default 1;

alter table public.relationships
add column if not exists revision bigint not null default 1,
add column if not exists end_year integer,
add column if not exists relationship_status text not null default 'unspecified';

-- Reconcile rows written by historical clients before installing the stricter
-- constraints below. Partnership state used to live in relationship_variant.
update public.relationships
set relationship_status = relationship_variant,
    relationship_variant = null
where relationship_type in ('spouse', 'partner')
  and relationship_variant in ('current', 'former', 'unspecified');

alter table public.relationships
drop constraint if exists relationships_end_year_check,
drop constraint if exists relationships_relationship_status_check,
drop constraint if exists relationships_relationship_variant_check;

alter table public.relationships
add constraint relationships_end_year_check
check (end_year is null or end_year between 1800 and 2100),
add constraint relationships_relationship_status_check
check (
  relationship_status in ('current', 'former', 'unspecified')
  and (relationship_type in ('spouse', 'partner') or relationship_status = 'unspecified')
  and not (relationship_status = 'current' and end_year is not null)
  and (start_year is null or end_year is null or start_year <= end_year)
),
add constraint relationships_relationship_variant_check check (
  relationship_variant is null
  or (relationship_type = 'sibling' and relationship_variant = 'half')
  or (
    relationship_type = 'parent'
    and relationship_variant in ('biological', 'adoptive', 'step', 'guardian')
  )
);

-- Symmetric rows use one canonical orientation without changing identity,
-- creator, or revision. Existing semantic duplicates remain visible and must
-- be resolved explicitly rather than being silently discarded.
update public.relationships
set
  person_a_id = least(person_a_id, person_b_id),
  person_b_id = greatest(person_a_id, person_b_id)
where relationship_type in ('spouse', 'partner', 'sibling')
  and person_a_id > person_b_id;

create table public.member_revision_history (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  owner_id uuid not null,
  revision bigint not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index member_revision_history_member_revision_idx
on public.member_revision_history (member_id, revision desc, changed_at desc);

create table public.relationship_revision_history (
  id bigint generated always as identity primary key,
  relationship_id uuid not null,
  owner_id uuid not null,
  person_a_id uuid not null,
  person_b_id uuid not null,
  revision bigint not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index relationship_revision_history_relationship_revision_idx
on public.relationship_revision_history
(relationship_id, revision desc, changed_at desc);

create table public.family_correction_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  owner_id uuid not null,
  proposer_id uuid not null,
  expected_revision bigint not null,
  expected_relationship_hash text not null,
  base_details jsonb not null,
  base_connections jsonb not null,
  details jsonb not null,
  connections jsonb not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewer_id is null and reviewed_at is null)
    or (status in ('accepted', 'rejected') and reviewer_id is not null and reviewed_at is not null)
    or (status = 'withdrawn' and reviewed_at is not null)
  )
);

create table public.family_mutation_requests (
  id uuid primary key,
  actor_id uuid not null,
  owner_id uuid not null,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index family_correction_requests_member_status_idx
on public.family_correction_requests (member_id, status, created_at desc);

-- Establish revision 1 as the immutable baseline for records that predate this feature.
insert into public.member_revision_history (
  member_id, owner_id, revision, operation, snapshot, changed_by, changed_at
)
select id, owner_id, revision, 'insert', to_jsonb(member), created_by, created_at
from public.family_members as member;

insert into public.relationship_revision_history (
  relationship_id, owner_id, person_a_id, person_b_id,
  revision, operation, snapshot, changed_by, changed_at
)
select
  id, owner_id, person_a_id, person_b_id,
  revision, 'insert', to_jsonb(relationship), created_by, created_at
from public.relationships as relationship;

alter table public.member_revision_history enable row level security;
alter table public.relationship_revision_history enable row level security;
alter table public.family_correction_requests enable row level security;
alter table public.family_mutation_requests enable row level security;

create policy "Read accessible member history"
on public.member_revision_history
for select
to authenticated
using (
  member_revision_history.owner_id = (select auth.uid())
  or exists (
    select 1
    from public.family_members as member
    where member.id = member_revision_history.member_id
      and member.owner_id = member_revision_history.owner_id
      and (
        member.owner_id = (select auth.uid())
        or member.created_by = (select auth.uid())
        or member.linked_user_id = (select auth.uid())
        or member.filled_by = (select auth.uid())
        or public.can_access_family_member((select auth.uid()), member.id)
      )
  )
);

create policy "Read accessible relationship history"
on public.relationship_revision_history
for select
to authenticated
using (
  relationship_revision_history.owner_id = (select auth.uid())
  or exists (
    select 1
    from public.family_members as member
    where member.id in (
        relationship_revision_history.person_a_id,
        relationship_revision_history.person_b_id
      )
      and member.owner_id = relationship_revision_history.owner_id
      and (
        member.owner_id = (select auth.uid())
        or member.created_by = (select auth.uid())
        or member.linked_user_id = (select auth.uid())
        or member.filled_by = (select auth.uid())
        or public.can_access_family_member((select auth.uid()), member.id)
      )
  )
);

create policy "Read own or reviewable correction requests"
on public.family_correction_requests
for select
to authenticated
using (
  proposer_id = (select auth.uid())
  or owner_id = (select auth.uid())
  or exists (
    select 1
    from public.family_members as member
    where member.id = family_correction_requests.member_id
      and member.owner_id = family_correction_requests.owner_id
      and (
        member.owner_id = (select auth.uid())
        or member.linked_user_id = (select auth.uid())
        or member.created_by = (select auth.uid())
        or member.filled_by = (select auth.uid())
      )
  )
);

create or replace function private.bump_family_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create or replace function private.record_member_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.family_members;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  insert into public.member_revision_history (
    member_id, owner_id, revision, operation, snapshot, changed_by
  ) values (
    v_row.id,
    v_row.owner_id,
    case when tg_op = 'DELETE' then v_row.revision + 1 else v_row.revision end,
    lower(tg_op),
    case when tg_op = 'DELETE'
      then to_jsonb(v_row) || jsonb_build_object('revision', v_row.revision + 1)
      else to_jsonb(v_row)
    end,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.record_relationship_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.relationships;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  insert into public.relationship_revision_history (
    relationship_id, owner_id, person_a_id, person_b_id,
    revision, operation, snapshot, changed_by
  ) values (
    v_row.id,
    v_row.owner_id,
    v_row.person_a_id,
    v_row.person_b_id,
    case when tg_op = 'DELETE' then v_row.revision + 1 else v_row.revision end,
    lower(tg_op),
    case when tg_op = 'DELETE'
      then to_jsonb(v_row) || jsonb_build_object('revision', v_row.revision + 1)
      else to_jsonb(v_row)
    end,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.withdraw_member_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.family_correction_requests
  set
    status = 'withdrawn',
    reviewer_id = auth.uid(),
    reviewed_at = now()
  where member_id = old.id
    and owner_id = old.owner_id
    and status = 'pending';
  return old;
end;
$$;

create or replace function private.lock_family_graph(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null then
    raise exception 'A family graph owner is required.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text, 8617349127)
  );
end;
$$;

create or replace function private.prepare_relationship_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_swap uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.person_a_id = new.person_b_id then
    raise exception 'A relationship cannot connect a person to themselves.' using errcode = '22023';
  end if;
  if new.relationship_type in ('spouse', 'partner', 'sibling')
    and new.person_a_id > new.person_b_id then
    v_swap := new.person_a_id;
    new.person_a_id := new.person_b_id;
    new.person_b_id := v_swap;
  end if;
  if (
    select count(*)
    from public.family_members as member
    where member.owner_id = new.owner_id
      and member.id in (new.person_a_id, new.person_b_id)
  ) <> 2 then
    raise exception 'Relationship endpoints must exist in the same family graph.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.relationships as relationship
    where relationship.owner_id = new.owner_id
      and relationship.id is distinct from new.id
      and (
        (
          new.relationship_type = 'parent'
          and relationship.relationship_type = 'parent'
          and relationship.person_a_id = new.person_a_id
          and relationship.person_b_id = new.person_b_id
        )
        or (
          new.relationship_type in ('spouse', 'partner')
          and relationship.relationship_type in ('spouse', 'partner')
          and relationship.person_a_id = new.person_a_id
          and relationship.person_b_id = new.person_b_id
        )
        or (
          new.relationship_type = 'sibling'
          and relationship.relationship_type = 'sibling'
          and relationship.person_a_id = new.person_a_id
          and relationship.person_b_id = new.person_b_id
        )
      )
  ) then
    raise exception 'That direct relationship is already recorded.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists bump_family_member_revision on public.family_members;
create trigger bump_family_member_revision
before update on public.family_members
for each row execute function private.bump_family_revision();

drop trigger if exists withdraw_member_corrections on public.family_members;
create trigger withdraw_member_corrections
before delete on public.family_members
for each row execute function private.withdraw_member_corrections();

drop trigger if exists record_family_member_revision on public.family_members;
create trigger record_family_member_revision
after insert or update or delete on public.family_members
for each row execute function private.record_member_revision();

drop trigger if exists a_prepare_relationship_write on public.relationships;
create trigger a_prepare_relationship_write
before insert or update or delete on public.relationships
for each row execute function private.prepare_relationship_write();

drop trigger if exists b_bump_relationship_revision on public.relationships;
create trigger b_bump_relationship_revision
before update on public.relationships
for each row execute function private.bump_family_revision();

drop trigger if exists record_relationship_revision on public.relationships;
create trigger record_relationship_revision
after insert or update or delete on public.relationships
for each row execute function private.record_relationship_revision();

create or replace function private.can_manage_member(
  p_user_id uuid,
  p_member public.family_members
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    p_member.owner_id = p_user_id
    or p_member.created_by = p_user_id
    or p_member.linked_user_id = p_user_id
    or p_member.filled_by = p_user_id
  );
$$;

create or replace function private.can_view_member(
  p_user_id uuid,
  p_member public.family_members
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    private.can_manage_member(p_user_id, p_member)
    or public.can_access_family_member(p_user_id, p_member.id)
  );
$$;

create or replace function private.managed_connection_snapshot(
  p_member_id uuid,
  p_owner_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', relationship.person_a_id,
        'variant', coalesce(relationship.relationship_variant, 'unspecified')
      ) order by relationship.person_a_id, relationship.id)
      from public.relationships as relationship
      where relationship.owner_id = p_owner_id
        and relationship.relationship_type = 'parent'
        and relationship.person_b_id = p_member_id
    ), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', case when relationship.person_a_id = p_member_id
          then relationship.person_b_id else relationship.person_a_id end,
        'type', relationship.relationship_type,
        'start_year', relationship.start_year,
        'end_year', relationship.end_year,
        'status', relationship.relationship_status
      ) order by relationship.person_a_id, relationship.person_b_id, relationship.id)
      from public.relationships as relationship
      where relationship.owner_id = p_owner_id
        and relationship.relationship_type in ('spouse', 'partner')
        and p_member_id in (relationship.person_a_id, relationship.person_b_id)
    ), '[]'::jsonb),
    'siblings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', case when relationship.person_a_id = p_member_id
          then relationship.person_b_id else relationship.person_a_id end,
        'variant', coalesce(relationship.relationship_variant, 'reported')
      ) order by relationship.person_a_id, relationship.person_b_id, relationship.id)
      from public.relationships as relationship
      where relationship.owner_id = p_owner_id
        and relationship.relationship_type = 'sibling'
        and p_member_id in (relationship.person_a_id, relationship.person_b_id)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_managed_relationship_snapshots(p_member_ids uuid[])
returns table (member_id uuid, connections jsonb, content_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select member.id, snapshot.connections, md5(snapshot.connections::text)
  from unnest(p_member_ids) as requested(member_id)
  join public.family_members as member on member.id = requested.member_id
  cross join lateral (
    select private.managed_connection_snapshot(member.id, member.owner_id) as connections
  ) as snapshot
  where private.can_view_member(auth.uid(), member);
$$;

create or replace function private.apply_family_member_edit(
  p_user_id uuid,
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.family_members;
  v_connection jsonb;
  v_referenced_id uuid;
  v_start_year integer;
  v_end_year integer;
  v_variant text;
  v_type text;
  v_status text;
  v_relationship_snapshot jsonb;
  v_relationship_hash text;
  v_owner_id uuid;
begin
  select * into v_member
  from public.family_members
  where id = p_member_id;

  if not found then raise exception 'Family member not found.' using errcode = 'P0002'; end if;
  if not private.can_manage_member(p_user_id, v_member) then
    raise exception 'You are not authorized to edit this family member.' using errcode = '42501';
  end if;
  v_owner_id := v_member.owner_id;
  perform private.lock_family_graph(v_owner_id);
  select * into v_member
  from public.family_members
  where id = p_member_id
    and owner_id = v_owner_id
  for update;
  if not found or not private.can_manage_member(p_user_id, v_member) then
    raise exception 'You are not authorized to edit this family member.' using errcode = '42501';
  end if;
  if v_member.is_placeholder then
    raise exception 'Placeholder records must be filled through the existing fill flow.' using errcode = '22023';
  end if;
  if v_member.revision <> p_expected_revision then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode = '40001';
  end if;
  if p_details is null or p_connections is null then
    raise exception 'Details and connections are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details) <> 'object' or jsonb_typeof(p_connections) <> 'object' then
    raise exception 'Details and connections must be objects.' using errcode = '22023';
  end if;
  if p_details ?| array[
    'owner_id', 'created_by', 'linked_user_id', 'filled_by', 'is_self',
    'is_placeholder', 'placeholder_label', 'revision', 'id'
  ] then
    raise exception 'Protected member fields cannot be edited.' using errcode = '22023';
  end if;
  if nullif(btrim(p_details->>'first_name'), '') is null
    or nullif(btrim(p_details->>'surname'), '') is null then
    raise exception 'First name and surname are required.' using errcode = '22023';
  end if;
  if char_length(p_details->>'first_name') > 100
    or char_length(p_details->>'surname') > 100
    or char_length(p_details->>'nickname') > 100
    or char_length(p_details->>'maiden_name') > 100 then
    raise exception 'A name is too long.' using errcode = '22023';
  end if;
  if coalesce(p_details->>'gender', 'unspecified') not in (
    'female', 'male', 'nonbinary', 'unspecified'
  ) then
    raise exception 'Invalid gender value.' using errcode = '22023';
  end if;
  if nullif(p_details->>'birth_year', '')::integer is not null
    and nullif(p_details->>'birth_year', '')::integer not between 1800 and extract(year from current_date)::integer then
    raise exception 'Invalid birth year.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_details->'lived_locations', '[]'::jsonb)) <> 'array' then
    raise exception 'Lived locations must be an array.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_connections->'parents', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'partners', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'siblings', '[]'::jsonb)) <> 'array' then
    raise exception 'Connection sets must be arrays.' using errcode = '22023';
  end if;

  create temporary table edit_connections (
    category text not null,
    person_id uuid not null,
    relationship_type text not null,
    variant text,
    start_year integer,
    end_year integer,
    relationship_status text not null
  ) on commit drop;

  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'parents', '[]'::jsonb)) loop
    v_referenced_id := (v_connection->>'person_id')::uuid;
    v_variant := coalesce(v_connection->>'variant', 'unspecified');
    if v_variant not in ('unspecified', 'biological', 'adoptive', 'guardian') then
      raise exception 'Invalid parent variant.' using errcode = '22023';
    end if;
    insert into edit_connections values (
      'parent', v_referenced_id, 'parent', nullif(v_variant, 'unspecified'),
      null, null, 'unspecified'
    );
  end loop;

  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'partners', '[]'::jsonb)) loop
    v_referenced_id := (v_connection->>'person_id')::uuid;
    v_type := v_connection->>'type';
    v_status := coalesce(v_connection->>'status', 'unspecified');
    v_start_year := nullif(v_connection->>'start_year', '')::integer;
    v_end_year := nullif(v_connection->>'end_year', '')::integer;
    if coalesce(v_type, '') not in ('spouse', 'partner')
      or v_status not in ('current', 'former', 'unspecified')
      or (v_status = 'current' and v_end_year is not null)
      or (v_start_year is not null and v_start_year not between 1800 and 2100)
      or (v_end_year is not null and v_end_year not between 1800 and 2100)
      or (v_start_year is not null and v_end_year is not null and v_start_year > v_end_year) then
      raise exception 'Invalid partnership details.' using errcode = '22023';
    end if;
    insert into edit_connections values (
      'partner', v_referenced_id, v_type, null,
      v_start_year, v_end_year, v_status
    );
  end loop;

  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'siblings', '[]'::jsonb)) loop
    v_referenced_id := (v_connection->>'person_id')::uuid;
    v_variant := coalesce(v_connection->>'variant', 'reported');
    if v_variant not in ('reported', 'half') then
      raise exception 'Invalid sibling variant.' using errcode = '22023';
    end if;
    insert into edit_connections values (
      'sibling', v_referenced_id, 'sibling', nullif(v_variant, 'reported'),
      null, null, 'unspecified'
    );
  end loop;

  if exists (select 1 from edit_connections where person_id = p_member_id) then
    raise exception 'A person cannot be connected to themselves.' using errcode = '22023';
  end if;
  if exists (
    select 1 from edit_connections
    group by category, person_id having count(*) > 1
  ) then
    raise exception 'Duplicate connections are not allowed.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from edit_connections as connection
    left join public.family_members as referenced on referenced.id = connection.person_id
    where referenced.id is null
      or referenced.owner_id <> v_member.owner_id
      or not private.can_view_member(p_user_id, referenced)
  ) then
    raise exception 'Every connected person must be accessible and in the same family graph.' using errcode = '42501';
  end if;

  -- Include the target, every desired endpoint, and every currently managed
  -- endpoint. Sorting before FOR UPDATE prevents A->B and B->A editor deadlocks.
  perform member.id
  from public.family_members as member
  where member.owner_id = v_member.owner_id
    and member.id in (
      select p_member_id
      union
      select connection.person_id from edit_connections as connection
      union
      select case
        when relationship.person_a_id = p_member_id then relationship.person_b_id
        else relationship.person_a_id
      end
      from public.relationships as relationship
      where relationship.owner_id = v_member.owner_id
        and (
          (relationship.relationship_type = 'parent' and relationship.person_b_id = p_member_id)
          or (
            relationship.relationship_type in ('spouse', 'partner', 'sibling')
            and p_member_id in (relationship.person_a_id, relationship.person_b_id)
          )
        )
    )
  order by member.id
  for update;

  select * into v_member
  from public.family_members
  where id = p_member_id;
  if v_member.revision <> p_expected_revision then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode = '40001';
  end if;
  if not private.can_manage_member(p_user_id, v_member) then
    raise exception 'You are not authorized to edit this family member.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from edit_connections as connection
    left join public.family_members as referenced on referenced.id = connection.person_id
    where referenced.id is null
      or referenced.owner_id <> v_member.owner_id
      or not private.can_view_member(p_user_id, referenced)
  ) then
    raise exception 'Every connected person must remain accessible and in the same family graph.' using errcode = '42501';
  end if;

  perform relationship.id
  from public.relationships as relationship
  where relationship.owner_id = v_member.owner_id
    and (
      (relationship.relationship_type = 'parent' and relationship.person_b_id = p_member_id)
      or (
        relationship.relationship_type in ('spouse', 'partner', 'sibling')
        and p_member_id in (relationship.person_a_id, relationship.person_b_id)
      )
    )
  order by relationship.id
  for update;

  v_relationship_snapshot := private.managed_connection_snapshot(
    p_member_id,
    v_member.owner_id
  );
  v_relationship_hash := md5(v_relationship_snapshot::text);
  if v_relationship_hash is distinct from p_expected_relationship_hash then
    raise exception 'This family member''s connections changed since you opened them. Refresh and try again.' using errcode = '40001';
  end if;

  if exists (
    with recursive descendants(id) as (
      select p_member_id
      union
      select relationship.person_b_id
      from public.relationships as relationship
      join descendants on descendants.id = relationship.person_a_id
      where relationship.owner_id = v_member.owner_id
        and relationship.relationship_type = 'parent'
    )
    select 1
    from edit_connections
    where category = 'parent' and person_id in (select id from descendants)
  ) then
    raise exception 'That parent connection would create an ancestry cycle.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        case
          when relationship.relationship_type = 'parent' then 'parent'
          when relationship.relationship_type in ('spouse', 'partner') then 'partner'
          else 'sibling'
        end as category,
        case
          when relationship.relationship_type = 'parent' then relationship.person_a_id
          when relationship.person_a_id = p_member_id then relationship.person_b_id
          else relationship.person_a_id
        end as person_id
      from public.relationships as relationship
      where relationship.owner_id = v_member.owner_id
        and (
          (relationship.relationship_type = 'parent' and relationship.person_b_id = p_member_id)
          or (
            relationship.relationship_type in ('spouse', 'partner', 'sibling')
            and p_member_id in (relationship.person_a_id, relationship.person_b_id)
          )
        )
    ) as managed
    group by managed.category, managed.person_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate managed relationships must be resolved before editing.' using errcode = '23505';
  end if;

  update public.family_members set
    first_name = btrim(p_details->>'first_name'),
    surname = btrim(p_details->>'surname'),
    nickname = nullif(btrim(p_details->>'nickname'), ''),
    maiden_name = nullif(btrim(p_details->>'maiden_name'), ''),
    gender = coalesce(p_details->>'gender', 'unspecified'),
    birth_year = nullif(p_details->>'birth_year', '')::integer,
    birth_location = case when p_details ? 'birth_location' then p_details->'birth_location' else null end,
    lived_locations = coalesce(p_details->'lived_locations', '[]'::jsonb),
    birth_place = nullif(btrim(p_details->>'birth_place'), ''),
    lived_in = nullif(btrim(p_details->>'lived_in'), ''),
    family_side = coalesce(nullif(btrim(p_details->>'family_side'), ''), 'Other')
  where id = p_member_id
    and (
      first_name, surname, nickname, maiden_name, gender, birth_year,
      birth_location, lived_locations, birth_place, lived_in, family_side
    ) is distinct from (
      btrim(p_details->>'first_name'),
      btrim(p_details->>'surname'),
      nullif(btrim(p_details->>'nickname'), ''),
      nullif(btrim(p_details->>'maiden_name'), ''),
      coalesce(p_details->>'gender', 'unspecified'),
      nullif(p_details->>'birth_year', '')::integer,
      case when p_details ? 'birth_location' then p_details->'birth_location' else null end,
      coalesce(p_details->'lived_locations', '[]'::jsonb),
      nullif(btrim(p_details->>'birth_place'), ''),
      nullif(btrim(p_details->>'lived_in'), ''),
      coalesce(nullif(btrim(p_details->>'family_side'), ''), 'Other')
    );

  update public.relationships as relationship set
    relationship_variant = desired.variant,
    start_year = null,
    end_year = null,
    relationship_status = 'unspecified'
  from edit_connections as desired
  where desired.category = 'parent'
    and relationship.owner_id = v_member.owner_id
    and relationship.relationship_type = 'parent'
    and relationship.person_a_id = desired.person_id
    and relationship.person_b_id = p_member_id
    and (
      relationship.relationship_variant,
      relationship.start_year,
      relationship.end_year,
      relationship.relationship_status
    ) is distinct from (desired.variant, null, null, 'unspecified');

  update public.relationships as relationship set
    person_a_id = least(p_member_id, desired.person_id),
    person_b_id = greatest(p_member_id, desired.person_id),
    relationship_type = desired.relationship_type,
    relationship_variant = null,
    start_year = desired.start_year,
    end_year = desired.end_year,
    relationship_status = desired.relationship_status
  from edit_connections as desired
  where desired.category = 'partner'
    and relationship.owner_id = v_member.owner_id
    and relationship.relationship_type in ('spouse', 'partner')
    and (
      case when relationship.person_a_id = p_member_id
        then relationship.person_b_id else relationship.person_a_id end
    ) = desired.person_id
    and (
      relationship.person_a_id,
      relationship.person_b_id,
      relationship.relationship_type,
      relationship.relationship_variant,
      relationship.start_year,
      relationship.end_year,
      relationship.relationship_status
    ) is distinct from (
      least(p_member_id, desired.person_id),
      greatest(p_member_id, desired.person_id),
      desired.relationship_type,
      null,
      desired.start_year,
      desired.end_year,
      desired.relationship_status
    );

  update public.relationships as relationship set
    person_a_id = least(p_member_id, desired.person_id),
    person_b_id = greatest(p_member_id, desired.person_id),
    relationship_variant = desired.variant,
    start_year = null,
    end_year = null,
    relationship_status = 'unspecified'
  from edit_connections as desired
  where desired.category = 'sibling'
    and relationship.owner_id = v_member.owner_id
    and relationship.relationship_type = 'sibling'
    and (
      case when relationship.person_a_id = p_member_id
        then relationship.person_b_id else relationship.person_a_id end
    ) = desired.person_id
    and (
      relationship.person_a_id,
      relationship.person_b_id,
      relationship.relationship_variant,
      relationship.start_year,
      relationship.end_year,
      relationship.relationship_status
    ) is distinct from (
      least(p_member_id, desired.person_id),
      greatest(p_member_id, desired.person_id),
      desired.variant,
      null,
      null,
      'unspecified'
    );

  delete from public.relationships as relationship
  where relationship.owner_id = v_member.owner_id
    and relationship.relationship_type = 'parent'
    and relationship.person_b_id = p_member_id
    and not exists (
      select 1 from edit_connections as desired
      where desired.category = 'parent'
        and desired.person_id = relationship.person_a_id
    );

  delete from public.relationships as relationship
  where relationship.owner_id = v_member.owner_id
    and relationship.relationship_type in ('spouse', 'partner')
    and p_member_id in (relationship.person_a_id, relationship.person_b_id)
    and not exists (
      select 1 from edit_connections as desired
      where desired.category = 'partner'
        and desired.person_id = case
          when relationship.person_a_id = p_member_id
            then relationship.person_b_id else relationship.person_a_id end
    );

  delete from public.relationships as relationship
  where relationship.owner_id = v_member.owner_id
    and relationship.relationship_type = 'sibling'
    and p_member_id in (relationship.person_a_id, relationship.person_b_id)
    and not exists (
      select 1 from edit_connections as desired
      where desired.category = 'sibling'
        and desired.person_id = case
          when relationship.person_a_id = p_member_id
            then relationship.person_b_id else relationship.person_a_id end
    );

  insert into public.relationships (
    owner_id, created_by, person_a_id, person_b_id, relationship_type,
    relationship_variant, start_year, end_year, relationship_status
  )
  select
    v_member.owner_id,
    p_user_id,
    case when category = 'parent' then person_id else p_member_id end,
    case when category = 'parent' then p_member_id else person_id end,
    relationship_type,
    variant,
    start_year,
    end_year,
    relationship_status
  from edit_connections
  where not exists (
    select 1
    from public.relationships as relationship
    where relationship.owner_id = v_member.owner_id
      and (
        (
          edit_connections.category = 'parent'
          and relationship.relationship_type = 'parent'
          and relationship.person_a_id = edit_connections.person_id
          and relationship.person_b_id = p_member_id
        )
        or (
          edit_connections.category = 'partner'
          and relationship.relationship_type in ('spouse', 'partner')
          and p_member_id in (relationship.person_a_id, relationship.person_b_id)
          and edit_connections.person_id in (relationship.person_a_id, relationship.person_b_id)
        )
        or (
          edit_connections.category = 'sibling'
          and relationship.relationship_type = 'sibling'
          and p_member_id in (relationship.person_a_id, relationship.person_b_id)
          and edit_connections.person_id in (relationship.person_a_id, relationship.person_b_id)
        )
      )
  );

  select revision into p_expected_revision
  from public.family_members
  where id = p_member_id;
  return p_expected_revision;
exception
  when invalid_text_representation then
    raise exception 'A connection person ID or year is malformed.' using errcode = '22023';
end;
$$;

create or replace function public.edit_family_member(
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  return private.apply_family_member_edit(
    v_user_id,
    p_member_id,
    p_expected_revision,
    p_expected_relationship_hash,
    p_details,
    p_connections
  );
end;
$$;

create or replace function public.propose_family_correction(
  p_member_id uuid,
  p_expected_revision bigint,
  p_expected_relationship_hash text,
  p_details jsonb,
  p_connections jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.family_members;
  v_request_id uuid;
  v_connection jsonb;
  v_start_year integer;
  v_end_year integer;
  v_base_details jsonb;
  v_base_connections jsonb;
  v_owner_id uuid;
  v_relationship_hash text;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member
  from public.family_members
  where id = p_member_id;
  if not found or not private.can_view_member(v_user_id, v_member) then
    raise exception 'Family member not found.' using errcode = 'P0002';
  end if;
  if private.can_manage_member(v_user_id, v_member) then
    raise exception 'Editors should save this record directly.' using errcode = '22023';
  end if;
  v_owner_id := v_member.owner_id;
  perform private.lock_family_graph(v_owner_id);
  select * into v_member
  from public.family_members
  where id = p_member_id
    and owner_id = v_owner_id
  for update;
  if not found or not private.can_view_member(v_user_id, v_member) then
    raise exception 'Family member not found.' using errcode = 'P0002';
  end if;
  if private.can_manage_member(v_user_id, v_member) then
    raise exception 'Editors should save this record directly.' using errcode = '22023';
  end if;
  perform relationship.id
  from public.relationships as relationship
  where relationship.owner_id = v_owner_id
    and (
      (relationship.relationship_type = 'parent' and relationship.person_b_id = p_member_id)
      or (
        relationship.relationship_type in ('spouse', 'partner', 'sibling')
        and p_member_id in (relationship.person_a_id, relationship.person_b_id)
      )
    )
  order by relationship.id
  for share;
  v_base_connections := private.managed_connection_snapshot(
    p_member_id,
    v_owner_id
  );
  v_relationship_hash := md5(v_base_connections::text);
  if v_member.revision <> p_expected_revision then
    raise exception 'This family member changed since you opened it. Refresh and try again.' using errcode = '40001';
  end if;
  if v_relationship_hash is distinct from p_expected_relationship_hash then
    raise exception 'This family member''s connections changed since you opened them. Refresh and try again.' using errcode = '40001';
  end if;
  if p_details is null or p_connections is null then
    raise exception 'Details and connections are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details) <> 'object' or jsonb_typeof(p_connections) <> 'object' then
    raise exception 'Details and connections must be objects.' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'The correction reason is too long.' using errcode = '22023';
  end if;
  if p_details ?| array[
    'owner_id', 'created_by', 'linked_user_id', 'filled_by', 'is_self',
    'is_placeholder', 'placeholder_label', 'revision', 'id'
  ] then
    raise exception 'Protected member fields cannot be proposed.' using errcode = '22023';
  end if;
  if nullif(btrim(p_details->>'first_name'), '') is null
    or nullif(btrim(p_details->>'surname'), '') is null then
    raise exception 'First name and surname are required.' using errcode = '22023';
  end if;
  if char_length(p_details->>'first_name') > 100
    or char_length(p_details->>'surname') > 100
    or char_length(p_details->>'nickname') > 100
    or char_length(p_details->>'maiden_name') > 100 then
    raise exception 'A name is too long.' using errcode = '22023';
  end if;
  if coalesce(p_details->>'gender', 'unspecified') not in ('female', 'male', 'nonbinary', 'unspecified') then
    raise exception 'Invalid gender value.' using errcode = '22023';
  end if;
  if p_details->>'birth_year' is not null
    and (p_details->>'birth_year')::integer not between 1800 and extract(year from current_date)::integer then
    raise exception 'Invalid birth year.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_details->'lived_locations', '[]'::jsonb)) <> 'array' then
    raise exception 'Lived locations must be an array.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_connections->'parents', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'partners', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_connections->'siblings', '[]'::jsonb)) <> 'array' then
    raise exception 'Connection sets must be arrays.' using errcode = '22023';
  end if;
  if exists (
    with proposed(category, person_id) as (
      select 'parent', (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'parents', '[]'::jsonb))
      union all
      select 'partner', (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'partners', '[]'::jsonb))
      union all
      select 'sibling', (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'siblings', '[]'::jsonb))
    )
    select 1 from proposed
    group by category, person_id
    having person_id = p_member_id or count(*) > 1
  ) then
    raise exception 'Self-links and duplicate connections are not allowed.' using errcode = '22023';
  end if;
  if exists (
    with proposed(person_id) as (
      select (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'parents', '[]'::jsonb))
      union
      select (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'partners', '[]'::jsonb))
      union
      select (value->>'person_id')::uuid
      from jsonb_array_elements(coalesce(p_connections->'siblings', '[]'::jsonb))
    )
    select 1
    from proposed
    left join public.family_members as referenced on referenced.id = proposed.person_id
    where referenced.id is null
      or referenced.owner_id <> v_member.owner_id
      or not private.can_view_member(v_user_id, referenced)
  ) then
    raise exception 'Every connected person must be accessible and in the same family graph.' using errcode = '42501';
  end if;
  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'parents', '[]'::jsonb)) loop
    if coalesce(v_connection->>'variant', 'unspecified') not in (
      'unspecified', 'biological', 'adoptive', 'guardian'
    ) then
      raise exception 'Invalid parent variant.' using errcode = '22023';
    end if;
  end loop;
  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'siblings', '[]'::jsonb)) loop
    if coalesce(v_connection->>'variant', 'reported') not in ('reported', 'half') then
      raise exception 'Invalid sibling variant.' using errcode = '22023';
    end if;
  end loop;
  for v_connection in select value from jsonb_array_elements(coalesce(p_connections->'partners', '[]'::jsonb)) loop
    v_start_year := nullif(v_connection->>'start_year', '')::integer;
    v_end_year := nullif(v_connection->>'end_year', '')::integer;
    if coalesce(v_connection->>'type', '') not in ('spouse', 'partner')
      or coalesce(v_connection->>'status', 'unspecified') not in ('current', 'former', 'unspecified')
      or (coalesce(v_connection->>'status', 'unspecified') = 'current' and v_end_year is not null)
      or (v_start_year is not null and v_start_year not between 1800 and 2100)
      or (v_end_year is not null and v_end_year not between 1800 and 2100)
      or (v_start_year is not null and v_end_year is not null and v_start_year > v_end_year) then
      raise exception 'Invalid partnership details.' using errcode = '22023';
    end if;
  end loop;
  if exists (
    with recursive descendants(id) as (
      select p_member_id
      union
      select relationship.person_b_id
      from public.relationships as relationship
      join descendants on descendants.id = relationship.person_a_id
      where relationship.owner_id = v_member.owner_id
        and relationship.relationship_type = 'parent'
    )
    select 1
    from jsonb_array_elements(coalesce(p_connections->'parents', '[]'::jsonb)) as parent
    where (parent.value->>'person_id')::uuid in (select id from descendants)
  ) then
    raise exception 'That parent connection would create an ancestry cycle.' using errcode = '22023';
  end if;
  v_base_details := jsonb_build_object(
    'first_name', v_member.first_name,
    'surname', v_member.surname,
    'nickname', v_member.nickname,
    'maiden_name', v_member.maiden_name,
    'gender', v_member.gender,
    'birth_year', v_member.birth_year,
    'birth_location', v_member.birth_location,
    'lived_locations', v_member.lived_locations,
    'birth_place', v_member.birth_place,
    'lived_in', v_member.lived_in,
    'family_side', v_member.family_side
  );
  insert into public.family_correction_requests (
    member_id, owner_id, proposer_id, expected_revision,
    expected_relationship_hash,
    base_details, base_connections,
    details, connections, reason
  ) values (
    p_member_id, v_member.owner_id, v_user_id, p_expected_revision,
    p_expected_relationship_hash,
    v_base_details, v_base_connections,
    p_details, p_connections, nullif(btrim(p_reason), '')
  ) returning id into v_request_id;
  return v_request_id;
exception
  when invalid_text_representation then
    raise exception 'A connection person ID or year is malformed.' using errcode = '22023';
end;
$$;

create or replace function public.create_family_relative(
  p_anchor_id uuid,
  p_details jsonb,
  p_bundle jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_anchor public.family_members;
  v_owner uuid;
  v_member_id uuid;
  v_spouse_id uuid;
  v_parent_id uuid;
  v_primary jsonb := p_bundle->'primary';
  v_type text := v_primary->>'type';
  v_direction text := v_primary->>'direction';
  v_variant text := nullif(v_primary->>'variant', '');
  v_start_year integer := nullif(v_primary->>'start_year', '')::integer;
  v_spouse jsonb := p_bundle->'spouse';
  v_result jsonb;
  v_name text;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_details is null or p_bundle is null or p_idempotency_key is null then
    raise exception 'Details, relationship bundle, and idempotency key are required.' using errcode = '22023';
  end if;
  select * into v_anchor from public.family_members where id = p_anchor_id;
  if not found or not private.can_manage_member(v_actor, v_anchor) then
    raise exception 'You are not authorized to add family near this member.' using errcode = '42501';
  end if;
  v_owner := v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor
  from public.family_members
  where id = p_anchor_id and owner_id = v_owner
  for update;
  if not found or not private.can_manage_member(v_actor, v_anchor) then
    raise exception 'You are not authorized to add family near this member.' using errcode = '42501';
  end if;
  select request.result into v_result
  from public.family_mutation_requests as request
  where request.id = p_idempotency_key
    and request.actor_id = v_actor
    and request.owner_id = v_owner
    and request.operation = 'create_family_relative';
  if found then return v_result; end if;
  if nullif(btrim(p_details->>'first_name'), '') is null
    or nullif(btrim(p_details->>'surname'), '') is null then
    raise exception 'First name and surname are required.' using errcode = '22023';
  end if;
  if char_length(p_details->>'first_name') > 100
    or char_length(p_details->>'surname') > 100
    or char_length(p_details->>'nickname') > 100
    or char_length(p_details->>'maiden_name') > 100 then
    raise exception 'A name is too long.' using errcode = '22023';
  end if;
  if coalesce(p_details->>'gender', 'unspecified') not in (
    'female', 'male', 'nonbinary', 'unspecified'
  ) then
    raise exception 'Invalid gender value.' using errcode = '22023';
  end if;
  if nullif(p_details->>'birth_year', '')::integer is not null
    and nullif(p_details->>'birth_year', '')::integer not between 1800 and extract(year from current_date)::integer then
    raise exception 'Invalid birth year.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_details->'lived_locations', '[]'::jsonb)) <> 'array' then
    raise exception 'Lived locations must be an array.' using errcode = '22023';
  end if;
  if v_type not in ('parent', 'sibling', 'spouse', 'partner')
    or v_direction not in ('to-anchor', 'from-anchor', 'symmetric') then
    raise exception 'Invalid primary relationship.' using errcode = '22023';
  end if;
  if (v_type = 'parent' and v_direction not in ('to-anchor', 'from-anchor'))
    or (v_type in ('sibling', 'spouse', 'partner') and v_direction <> 'symmetric') then
    raise exception 'Relationship direction does not match its type.' using errcode = '22023';
  end if;
  if (v_type = 'parent' and v_variant not in ('biological', 'adoptive', 'guardian') and v_variant is not null)
    or (v_type = 'sibling' and v_variant <> 'half')
    or (v_type in ('spouse', 'partner') and v_variant is not null) then
    raise exception 'Invalid relationship variant.' using errcode = '22023';
  end if;
  if v_start_year is not null and (
    v_type not in ('spouse', 'partner') or v_start_year not between 1800 and 2100
  ) then
    raise exception 'Invalid relationship start year.' using errcode = '22023';
  end if;

  create temporary table pending_relative_relationships (
    person_a_id uuid not null,
    person_b_id uuid not null,
    relationship_type text not null,
    relationship_variant text,
    start_year integer,
    end_year integer,
    relationship_status text not null
  ) on commit drop;

  insert into public.family_members (
    owner_id, created_by, first_name, surname, nickname, maiden_name, gender,
    birth_year, birth_location, lived_locations, birth_place, lived_in, family_side
  ) values (
    v_owner, v_actor, btrim(p_details->>'first_name'), btrim(p_details->>'surname'),
    nullif(btrim(p_details->>'nickname'), ''), nullif(btrim(p_details->>'maiden_name'), ''),
    coalesce(p_details->>'gender', 'unspecified'), nullif(p_details->>'birth_year', '')::integer,
    p_details->'birth_location', coalesce(p_details->'lived_locations', '[]'::jsonb),
    nullif(btrim(p_details->>'birth_place'), ''), nullif(btrim(p_details->>'lived_in'), ''),
    coalesce(nullif(btrim(p_details->>'family_side'), ''), 'Other')
  ) returning id into v_member_id;

  insert into pending_relative_relationships values (
    case
      when v_direction = 'from-anchor' then p_anchor_id
      when v_type in ('sibling', 'spouse', 'partner') then least(v_member_id, p_anchor_id)
      else v_member_id
    end,
    case
      when v_direction = 'from-anchor' then v_member_id
      when v_type in ('sibling', 'spouse', 'partner') then greatest(v_member_id, p_anchor_id)
      else p_anchor_id
    end,
    v_type,
    v_variant,
    v_start_year,
    null,
    'unspecified'
  );

  for v_parent_id in
    select value::text::uuid
    from jsonb_array_elements_text(coalesce(p_bundle->'parent_ids', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.family_members as parent
      where parent.id = v_parent_id and parent.owner_id = v_owner
        and private.can_view_member(v_actor, parent)
    ) then
      raise exception 'Suggested parents must be accessible in the same graph.' using errcode = '42501';
    end if;
    insert into pending_relative_relationships select
      v_parent_id, v_member_id, 'parent', null, null, null, 'unspecified'
    where not exists (
      select 1 from pending_relative_relationships as pending
      where pending.relationship_type = 'parent'
        and pending.person_a_id = v_parent_id
        and pending.person_b_id = v_member_id
    );
  end loop;

  if coalesce(v_spouse->>'mode', 'none') = 'existing' then
    v_spouse_id := (v_spouse->>'person_id')::uuid;
    if not exists (
      select 1 from public.family_members as spouse
      where spouse.id = v_spouse_id and spouse.owner_id = v_owner
        and private.can_view_member(v_actor, spouse)
    ) then
      raise exception 'Spouse must be accessible in the same graph.' using errcode = '42501';
    end if;
  elsif coalesce(v_spouse->>'mode', 'none') = 'new' then
    v_name := btrim(v_spouse->>'name');
    if nullif(v_name, '') is null then
      raise exception 'Enter the spouse name.' using errcode = '22023';
    end if;
    insert into public.family_members (
      owner_id, created_by, first_name, surname, gender, family_side
    ) values (
      v_owner,
      v_actor,
      case when v_name ~ '\s' then regexp_replace(v_name, '\s+\S+$', '') else v_name end,
      case when v_name ~ '\s' then substring(v_name from '\S+$') else btrim(p_details->>'surname') end,
      'unspecified',
      coalesce(nullif(btrim(p_details->>'family_side'), ''), 'Other')
    ) returning id into v_spouse_id;
  elsif coalesce(v_spouse->>'mode', 'none') <> 'none' then
    raise exception 'Invalid spouse mode.' using errcode = '22023';
  end if;

  if v_spouse_id is not null then
    if nullif(v_spouse->>'start_year', '')::integer is not null
      and nullif(v_spouse->>'start_year', '')::integer not between 1800 and 2100 then
      raise exception 'Invalid spouse start year.' using errcode = '22023';
    end if;
    insert into pending_relative_relationships select
      least(v_member_id, v_spouse_id), greatest(v_member_id, v_spouse_id),
      'spouse', null, nullif(v_spouse->>'start_year', '')::integer,
      null, 'unspecified'
    where not exists (
      select 1 from pending_relative_relationships as pending
      where pending.relationship_type in ('spouse', 'partner')
        and pending.person_a_id = least(v_member_id, v_spouse_id)
        and pending.person_b_id = greatest(v_member_id, v_spouse_id)
    );
    if coalesce((v_spouse->>'is_parent')::boolean, false)
      and v_type = 'parent' and v_direction = 'to-anchor' then
      insert into pending_relative_relationships select
        v_spouse_id, p_anchor_id, 'parent', null, null, null, 'unspecified'
      where not exists (
        select 1 from pending_relative_relationships as pending
        where pending.relationship_type = 'parent'
          and pending.person_a_id = v_spouse_id
          and pending.person_b_id = p_anchor_id
      );
    end if;
  end if;

  insert into public.relationships (
    owner_id, created_by, person_a_id, person_b_id, relationship_type,
    relationship_variant, start_year, end_year, relationship_status
  )
  select
    v_owner, v_actor, pending.person_a_id, pending.person_b_id,
    pending.relationship_type, pending.relationship_variant,
    pending.start_year, pending.end_year, pending.relationship_status
  from pending_relative_relationships as pending
  where not exists (
    select 1
    from public.relationships as existing
    where existing.owner_id = v_owner
      and (
        (pending.relationship_type = 'parent'
          and existing.relationship_type = 'parent'
          and existing.person_a_id = pending.person_a_id
          and existing.person_b_id = pending.person_b_id)
        or (pending.relationship_type in ('spouse', 'partner')
          and existing.relationship_type in ('spouse', 'partner')
          and least(existing.person_a_id, existing.person_b_id) = pending.person_a_id
          and greatest(existing.person_a_id, existing.person_b_id) = pending.person_b_id)
        or (pending.relationship_type = 'sibling'
          and existing.relationship_type = 'sibling'
          and least(existing.person_a_id, existing.person_b_id) = pending.person_a_id
          and greatest(existing.person_a_id, existing.person_b_id) = pending.person_b_id)
      )
  );

  v_result := jsonb_build_object(
    'member_id', v_member_id,
    'spouse_id', v_spouse_id
  );
  insert into public.family_mutation_requests (
    id, actor_id, owner_id, operation, result
  ) values (
    p_idempotency_key, v_actor, v_owner, 'create_family_relative', v_result
  );
  return v_result;
exception
  when invalid_text_representation then
    raise exception 'A person ID, year, or boolean is malformed.' using errcode = '22023';
end;
$$;

create or replace function public.add_placeholder_siblings(
  p_anchor_id uuid,
  p_desired_total integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_anchor public.family_members;
  v_owner uuid;
  v_existing integer;
  v_missing integer;
  v_index integer;
  v_member_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_desired_total < 0 or p_desired_total > 100 then
    raise exception 'Sibling total must be between 0 and 100.' using errcode = '22023';
  end if;
  select * into v_anchor from public.family_members where id = p_anchor_id;
  if not found or not private.can_manage_member(v_actor, v_anchor) then
    raise exception 'You are not authorized to edit siblings for this member.' using errcode = '42501';
  end if;
  v_owner := v_anchor.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_anchor
  from public.family_members
  where id = p_anchor_id and owner_id = v_owner
  for update;
  if not found or not private.can_manage_member(v_actor, v_anchor) then
    raise exception 'You are not authorized to edit siblings for this member.' using errcode = '42501';
  end if;
  select count(*)::integer into v_existing
  from public.relationships as relationship
  where relationship.owner_id = v_owner
    and relationship.relationship_type = 'sibling'
    and p_anchor_id in (relationship.person_a_id, relationship.person_b_id);
  v_missing := greatest(0, p_desired_total - v_existing);
  for v_index in 1..v_missing loop
    insert into public.family_members (
      owner_id, created_by, first_name, surname, family_side, gender,
      is_placeholder, placeholder_label
    ) values (
      v_owner, v_actor, 'Unknown', coalesce(v_anchor.surname, 'Unknown'),
      v_anchor.family_side, 'unspecified', true,
      'Unknown sibling ' || (v_existing + v_index)::text
    ) returning id into v_member_id;
    insert into public.relationships (
      owner_id, created_by, person_a_id, person_b_id, relationship_type,
      relationship_status
    ) values (v_owner, v_actor, v_member_id, p_anchor_id, 'sibling', 'unspecified');
  end loop;
  return v_missing;
end;
$$;

create or replace function public.link_family_members(
  p_person_a_id uuid,
  p_person_b_id uuid,
  p_relationship_type text,
  p_variant text default null,
  p_start_year integer default null,
  p_end_year integer default null,
  p_status text default 'unspecified'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_person_a public.family_members;
  v_person_b public.family_members;
  v_owner uuid;
  v_existing public.relationships;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_person_a_id = p_person_b_id then
    raise exception 'Choose two different people.' using errcode = '22023';
  end if;
  select * into v_person_a from public.family_members where id = p_person_a_id;
  if not found then raise exception 'Family member not found.' using errcode = 'P0002'; end if;
  v_owner := v_person_a.owner_id;
  perform private.lock_family_graph(v_owner);
  perform member.id
  from public.family_members as member
  where member.id in (p_person_a_id, p_person_b_id)
  order by member.id
  for update;
  select * into v_person_a
  from public.family_members where id = p_person_a_id and owner_id = v_owner;
  select * into v_person_b
  from public.family_members where id = p_person_b_id and owner_id = v_owner;
  if v_person_a.id is null or v_person_b.id is null then
    raise exception 'Both people must be in the same family graph.' using errcode = '22023';
  end if;
  if not (
    private.can_manage_member(v_actor, v_person_a)
    or private.can_manage_member(v_actor, v_person_b)
  ) then
    raise exception 'You are not authorized to link these people.' using errcode = '42501';
  end if;
  if p_relationship_type not in ('parent', 'sibling', 'spouse', 'partner')
    or (p_relationship_type = 'parent' and p_variant not in ('biological', 'adoptive', 'guardian') and p_variant is not null)
    or (p_relationship_type = 'sibling' and p_variant <> 'half')
    or (p_relationship_type in ('spouse', 'partner') and p_variant is not null)
    or (p_relationship_type not in ('spouse', 'partner') and (
      p_start_year is not null or p_end_year is not null or p_status <> 'unspecified'
    ))
    or p_status not in ('current', 'former', 'unspecified')
    or (p_status = 'current' and p_end_year is not null)
    or (p_start_year is not null and p_start_year not between 1800 and 2100)
    or (p_end_year is not null and p_end_year not between 1800 and 2100)
    or (p_start_year is not null and p_end_year is not null and p_start_year > p_end_year) then
    raise exception 'Invalid relationship details.' using errcode = '22023';
  end if;
  if p_relationship_type = 'parent' and exists (
    with recursive descendants(id) as (
      select p_person_b_id
      union
      select relationship.person_b_id
      from public.relationships as relationship
      join descendants on descendants.id = relationship.person_a_id
      where relationship.owner_id = v_owner
        and relationship.relationship_type = 'parent'
    )
    select 1 from descendants where id = p_person_a_id
  ) then
    raise exception 'That parent relationship would create an ancestry cycle.' using errcode = '22023';
  end if;
  select * into v_existing
  from public.relationships as relationship
  where relationship.owner_id = v_owner
    and (
      (p_relationship_type = 'parent'
        and relationship.relationship_type = 'parent'
        and relationship.person_a_id = p_person_a_id
        and relationship.person_b_id = p_person_b_id)
      or (p_relationship_type in ('spouse', 'partner')
        and relationship.relationship_type in ('spouse', 'partner')
        and p_person_a_id in (relationship.person_a_id, relationship.person_b_id)
        and p_person_b_id in (relationship.person_a_id, relationship.person_b_id))
      or (p_relationship_type = 'sibling'
        and relationship.relationship_type = 'sibling'
        and p_person_a_id in (relationship.person_a_id, relationship.person_b_id)
        and p_person_b_id in (relationship.person_a_id, relationship.person_b_id))
    )
  order by relationship.id
  limit 1;
  if found then
    if v_existing.relationship_type = p_relationship_type
      and v_existing.relationship_variant is not distinct from p_variant
      and v_existing.start_year is not distinct from p_start_year
      and v_existing.end_year is not distinct from p_end_year
      and v_existing.relationship_status = p_status then
      return v_existing.id;
    end if;
    raise exception 'A relationship in this category is already recorded.' using errcode = '23505';
  end if;
  insert into public.relationships (
    owner_id, created_by, person_a_id, person_b_id, relationship_type,
    relationship_variant, start_year, end_year, relationship_status
  ) values (
    v_owner, v_actor, p_person_a_id, p_person_b_id, p_relationship_type,
    p_variant, p_start_year, p_end_year, p_status
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_family_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_member public.family_members;
  v_owner uuid;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.family_members where id = p_member_id;
  if not found then return false; end if;
  v_owner := v_member.owner_id;
  perform private.lock_family_graph(v_owner);
  select * into v_member
  from public.family_members
  where id = p_member_id and owner_id = v_owner
  for update;
  if not found then return false; end if;
  if v_member.is_self or v_member.created_by is distinct from v_actor then
    raise exception 'You are not authorized to delete this family member.' using errcode = '42501';
  end if;
  perform relationship.id
  from public.relationships as relationship
  where relationship.owner_id = v_owner
    and p_member_id in (relationship.person_a_id, relationship.person_b_id)
  order by relationship.id
  for update;
  delete from public.relationships as relationship
  where relationship.owner_id = v_owner
    and p_member_id in (relationship.person_a_id, relationship.person_b_id);
  delete from public.family_members where id = p_member_id;
  return true;
end;
$$;

create or replace function public.report_relationship_duplicates(p_member_id uuid)
returns table (
  category text,
  person_a_id uuid,
  person_b_id uuid,
  duplicate_count bigint,
  relationship_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_member public.family_members;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_member from public.family_members where id = p_member_id;
  if not found or v_member.owner_id <> v_actor then
    raise exception 'Only the graph owner can review duplicate relationships.' using errcode = '42501';
  end if;
  return query
  select
    grouped.category,
    grouped.person_a_id,
    grouped.person_b_id,
    count(*)::bigint,
    array_agg(grouped.id order by grouped.id)
  from (
    select
      relationship.id,
      case when relationship.relationship_type = 'parent'
        then 'parent' when relationship.relationship_type in ('spouse', 'partner')
        then 'partner' else 'sibling' end as category,
      case when relationship.relationship_type = 'parent' then relationship.person_a_id
        else least(relationship.person_a_id, relationship.person_b_id) end as person_a_id,
      case when relationship.relationship_type = 'parent' then relationship.person_b_id
        else greatest(relationship.person_a_id, relationship.person_b_id) end as person_b_id
    from public.relationships as relationship
    where relationship.owner_id = v_member.owner_id
      and relationship.relationship_type in ('parent', 'spouse', 'partner', 'sibling')
  ) as grouped
  group by grouped.category, grouped.person_a_id, grouped.person_b_id
  having count(*) > 1
  order by grouped.category, grouped.person_a_id, grouped.person_b_id;
end;
$$;

create or replace function public.respond_family_correction(
  p_request_id uuid,
  p_response text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.family_correction_requests;
  v_member public.family_members;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_response not in ('accepted', 'rejected') then
    raise exception 'Response must be accepted or rejected.' using errcode = '22023';
  end if;
  select * into v_request
  from public.family_correction_requests
  where id = p_request_id;
  if not found then raise exception 'Correction request not found.' using errcode = 'P0002'; end if;
  select * into v_member
  from public.family_members
  where id = v_request.member_id
    and owner_id = v_request.owner_id;
  if not found or not private.can_manage_member(v_user_id, v_member) then
    raise exception 'You are not authorized to review this correction.' using errcode = '42501';
  end if;
  perform private.lock_family_graph(v_member.owner_id);
  select * into v_request
  from public.family_correction_requests
  where id = p_request_id
    and owner_id = v_request.owner_id
  for update;
  if not found then raise exception 'Correction request not found.' using errcode = 'P0002'; end if;
  if v_request.status <> 'pending' then
    raise exception 'This correction request has already been reviewed.' using errcode = '22023';
  end if;
  select * into v_member
  from public.family_members
  where id = v_request.member_id
    and owner_id = v_request.owner_id
  for update;
  if not found or not private.can_manage_member(v_user_id, v_member) then
    raise exception 'You are not authorized to review this correction.' using errcode = '42501';
  end if;
  if p_response = 'accepted' then
    perform private.apply_family_member_edit(
      v_user_id,
      v_request.member_id,
      v_request.expected_revision,
      v_request.expected_relationship_hash,
      v_request.details,
      v_request.connections
    );
  end if;
  update public.family_correction_requests set
    status = p_response,
    reviewer_id = v_user_id,
    reviewed_at = now()
  where id = p_request_id;
  return p_response;
end;
$$;

revoke all on public.member_revision_history from public, anon, authenticated;
revoke all on public.relationship_revision_history from public, anon, authenticated;
revoke all on public.family_correction_requests from public, anon, authenticated;
revoke all on public.family_mutation_requests from public, anon, authenticated;
revoke insert, update, delete on public.relationships from public, anon, authenticated;
revoke delete on public.family_members from public, anon, authenticated;
grant select on public.member_revision_history to authenticated;
grant select on public.relationship_revision_history to authenticated;
grant select on public.family_correction_requests to authenticated;
grant select on public.relationships to authenticated;

revoke all on function public.edit_family_member(uuid, bigint, text, jsonb, jsonb) from public, anon;
revoke all on function public.propose_family_correction(uuid, bigint, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.respond_family_correction(uuid, text) from public, anon;
revoke all on function public.get_managed_relationship_snapshots(uuid[]) from public, anon;
revoke all on function public.create_family_relative(uuid, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.add_placeholder_siblings(uuid, integer) from public, anon;
revoke all on function public.link_family_members(uuid, uuid, text, text, integer, integer, text) from public, anon;
revoke all on function public.delete_family_member(uuid) from public, anon;
revoke all on function public.report_relationship_duplicates(uuid) from public, anon;
grant execute on function public.edit_family_member(uuid, bigint, text, jsonb, jsonb) to authenticated;
grant execute on function public.propose_family_correction(uuid, bigint, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.respond_family_correction(uuid, text) to authenticated;
grant execute on function public.get_managed_relationship_snapshots(uuid[]) to authenticated;
grant execute on function public.create_family_relative(uuid, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.add_placeholder_siblings(uuid, integer) to authenticated;
grant execute on function public.link_family_members(uuid, uuid, text, text, integer, integer, text) to authenticated;
grant execute on function public.delete_family_member(uuid) to authenticated;
grant execute on function public.report_relationship_duplicates(uuid) to authenticated;

revoke all on function private.bump_family_revision() from public, anon, authenticated;
revoke all on function private.record_member_revision() from public, anon, authenticated;
revoke all on function private.record_relationship_revision() from public, anon, authenticated;
revoke all on function private.lock_family_graph(uuid) from public, anon, authenticated;
revoke all on function private.prepare_relationship_write() from public, anon, authenticated;
revoke all on function private.withdraw_member_corrections() from public, anon, authenticated;
revoke all on function private.can_manage_member(uuid, public.family_members) from public, anon, authenticated;
revoke all on function private.can_view_member(uuid, public.family_members) from public, anon, authenticated;
revoke all on function private.managed_connection_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.apply_family_member_edit(uuid, uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;

comment on table public.member_revision_history is
'Immutable member snapshots captured for every insert, update, and delete.';
comment on table public.relationship_revision_history is
'Immutable relationship snapshots captured for every insert, update, and delete.';
comment on table public.family_correction_requests is
'Atomic member-detail and connection-bundle corrections visible only to proposers and authorized reviewers.';
comment on table public.family_mutation_requests is
'Private idempotency receipts for atomic family creation bundles.';
