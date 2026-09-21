-- Vansh v0.15.1 executable family-editing diagnostic.
-- Run only against a disposable test database after the full migration chain.
-- Missing Auth identities are created as transaction-local fixtures. Everything rolls back.

begin;

create or replace function pg_temp.assert_true(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'v0.15.1 diagnostic: %',p_message; end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_actor_email text;
  v_reviewer uuid;
  v_reviewer_email text;
  v_self uuid;
  v_anchor uuid:=gen_random_uuid();
  v_parent uuid:=gen_random_uuid();
  v_sibling uuid:=gen_random_uuid();
  v_atomic uuid:=gen_random_uuid();
  v_foreign uuid:=gen_random_uuid();
  v_claimed uuid:=gen_random_uuid();
  v_invited uuid:=gen_random_uuid();
  v_key uuid:=gen_random_uuid();
  v_create_key uuid:=gen_random_uuid();
  v_duplicate_key uuid:=gen_random_uuid();
  v_invitation uuid;
  v_result jsonb;
  v_retry jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_request uuid;
  v_revision bigint;
  v_added integer;
  v_missing_state text;
  v_missing_message text;
  v_inaccessible_state text;
  v_inaccessible_message text;
begin
  select u.id,lower(u.email) into v_actor,v_actor_email from auth.users u
  where nullif(u.email,'') is not null order by u.created_at,u.id limit 1;
  if v_actor is null then
    v_actor:=gen_random_uuid();
    v_actor_email:='vansh-diagnostic-actor-'||v_actor::text||'@example.invalid';
    insert into auth.users(
      id,aud,role,email,raw_app_meta_data,raw_user_meta_data,
      created_at,updated_at,is_sso_user,is_anonymous
    ) values (
      v_actor,'authenticated','authenticated',v_actor_email,
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('first_name','Diagnostic','family_surname','Actor','display_name','Diagnostic Actor','discovery_enabled',false),
      now(),now(),false,false
    );
  end if;
  -- Always use a transaction-local reviewer rather than mutating an unrelated
  -- existing account. The final rollback removes this user and trigger profile.
  v_reviewer:=gen_random_uuid();
  v_reviewer_email:='vansh-diagnostic-reviewer-'||v_reviewer::text||'@example.invalid';
  insert into auth.users(
    id,aud,role,email,raw_app_meta_data,raw_user_meta_data,
    created_at,updated_at,is_sso_user,is_anonymous
  ) values (
    v_reviewer,'authenticated','authenticated',v_reviewer_email,
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('first_name','Diagnostic','family_surname','Reviewer','display_name','Diagnostic Reviewer','discovery_enabled',false),
    now(),now(),false,false
  );
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_actor,'email',v_actor_email,'role','authenticated')::text,true);
  perform pg_temp.assert_true(auth.uid()=v_actor,'transaction-local Auth claims were not recognized');

  perform set_config('vansh.system_write','on',true);
  select fm.id into v_self from public.family_members fm
  where fm.owner_id=v_actor and fm.is_self order by fm.created_at,fm.id limit 1;
  if v_self is null then
    insert into public.family_members(owner_id,created_by,linked_user_id,first_name,surname,is_self,family_side)
    values(v_actor,v_actor,v_actor,'Canonical','Diagnostic',true,'You') returning id into v_self;
  else
    update public.family_members set first_name='Canonical',surname='Diagnostic',linked_user_id=v_actor where id=v_self;
  end if;
  insert into public.family_members(id,owner_id,created_by,first_name,surname,family_side) values
    (v_anchor,v_actor,v_actor,'Anchor','Diagnostic','Other'),
    (v_parent,v_actor,v_actor,'Parent','Diagnostic','Other'),
    (v_sibling,v_actor,v_actor,'Sibling','Diagnostic','Other'),
    (v_atomic,v_actor,v_actor,'Atomic','Diagnostic','Other');
  insert into public.family_members(id,owner_id,created_by,first_name,surname,family_side)
  values(v_foreign,v_reviewer,v_reviewer,'Foreign','Diagnostic','Other');
  insert into public.family_members(id,owner_id,created_by,linked_user_id,first_name,surname,family_side)
  values(v_claimed,v_actor,v_actor,v_reviewer,'Claimed','Diagnostic','Other');
  insert into public.family_members(id,owner_id,created_by,first_name,surname,family_side)
  values(v_invited,v_actor,v_actor,'Invited','Record','Other');
  perform set_config('vansh.system_write','off',true);

  v_result:=public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
    'person_a_id',v_parent,'person_b_id',v_anchor,'relationship_type','parent','variant','unspecified',
    'status','unspecified','confidence','documented','provenance_note','v0.15.1 diagnostic')),v_key);
  v_retry:=public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
    'person_a_id',v_parent,'person_b_id',v_anchor,'relationship_type','parent','variant','unspecified',
    'status','unspecified','confidence','documented','provenance_note','v0.15.1 diagnostic')),v_key);
  perform pg_temp.assert_true(v_result=v_retry,'identical batch retry did not return the stored result');
  perform pg_temp.assert_true(exists(select 1 from public.relationships r where r.owner_id=v_actor
    and r.person_a_id=v_parent and r.person_b_id=v_anchor and r.relationship_type='parent'
    and r.relationship_variant is null and r.confidence='documented'
    and r.provenance_note='v0.15.1 diagnostic'),'parent normalization or evidence persistence failed');
  begin
    perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
      'person_a_id',v_sibling,'person_b_id',v_anchor,'relationship_type','sibling','variant','reported','status','unspecified')),v_key);
    raise exception 'idempotency mismatch was accepted';
  exception when unique_violation then null; end;

  begin
    perform public.link_family_members_batch(jsonb_build_array(
      jsonb_build_object('person_a_id',v_atomic,'person_b_id',v_anchor,'relationship_type','sibling','variant','reported','status','unspecified'),
      jsonb_build_object('person_a_id',v_anchor,'person_b_id',v_foreign,'relationship_type','sibling','variant','reported','status','unspecified')
    ),gen_random_uuid());
    raise exception 'cross-graph endpoint was accepted';
  exception when no_data_found then null; end;
  perform pg_temp.assert_true(not exists(select 1 from public.relationships r
    where v_atomic in(r.person_a_id,r.person_b_id) and v_anchor in(r.person_a_id,r.person_b_id)),
    'failed batch left a partial relationship behind');

  begin
    perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
      'person_a_id',gen_random_uuid(),'person_b_id',v_anchor,'relationship_type','sibling','variant','reported','status','unspecified')),
      gen_random_uuid());
    raise exception 'missing first endpoint was accepted';
  exception when others then
    get stacked diagnostics v_missing_state=returned_sqlstate,v_missing_message=message_text;
  end;
  begin
    perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
      'person_a_id',v_foreign,'person_b_id',v_anchor,'relationship_type','sibling','variant','reported','status','unspecified')),
      gen_random_uuid());
    raise exception 'inaccessible first endpoint was accepted';
  exception when others then
    get stacked diagnostics v_inaccessible_state=returned_sqlstate,v_inaccessible_message=message_text;
  end;
  perform pg_temp.assert_true(v_missing_state='P0002' and v_missing_state=v_inaccessible_state
    and v_missing_message=v_inaccessible_message,'missing and inaccessible first endpoints expose different errors');
  begin
    perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
      'person_a_id',v_anchor,'person_b_id',gen_random_uuid(),'relationship_type','sibling','variant','reported','status','unspecified')),
      gen_random_uuid());
    raise exception 'missing secondary endpoint was accepted';
  exception when others then
    get stacked diagnostics v_missing_state=returned_sqlstate,v_missing_message=message_text;
  end;
  perform pg_temp.assert_true(v_missing_state=v_inaccessible_state and v_missing_message=v_inaccessible_message,
    'missing secondary and inaccessible endpoints expose different errors');

  begin
    perform public.link_family_members_bundle(v_anchor,v_atomic,jsonb_build_object(
      'primary',jsonb_build_object('type','sibling','direction','to-anchor','confidence','reported'),
      'parents','[]'::jsonb,'partners','[]'::jsonb),gen_random_uuid());
    raise exception 'malformed primary relationship direction was accepted';
  exception when invalid_parameter_value then null; end;

  begin
    perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
      'person_a_id',v_anchor,'person_b_id',v_parent,'relationship_type','parent','variant',null,'status','unspecified')),
      gen_random_uuid());
    raise exception 'ancestry cycle was accepted';
  exception when invalid_parameter_value then null; end;

  perform public.link_family_members_batch(jsonb_build_array(jsonb_build_object(
    'person_a_id',v_parent,'person_b_id',v_sibling,'relationship_type','parent','variant','biological','status','unspecified')),
    gen_random_uuid());
  v_added:=public.add_placeholder_siblings(v_anchor,2,array[v_sibling]);
  perform pg_temp.assert_true(v_added=1,'semantic sibling counting created the wrong placeholder total');

  v_snapshot:=private.managed_connection_snapshot(v_claimed,v_actor);
  v_hash:=md5(v_snapshot::text);
  select revision into v_revision from public.family_members where id=v_claimed;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('linked_user_id',v_actor),v_snapshot,null);
    raise exception 'protected correction field was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('birth_place',repeat('b',151)),v_snapshot,null);
    raise exception '151-character birth place was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('lived_in',repeat('l',151)),v_snapshot,null);
    raise exception '151-character lived-in value was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('family_side','Invalid side'),v_snapshot,null);
    raise exception 'invalid family side was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('nickname',repeat('n',101)),v_snapshot,null);
    raise exception '101-character nickname was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('death_year',2201),v_snapshot,null);
    raise exception 'death year above the deployed constraint was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object('gender','invalid'),v_snapshot,null);
    raise exception 'invalid gender was accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.assert_true(public.propose_family_correction(v_claimed,v_revision,v_hash,'{}'::jsonb,v_snapshot,null) is null,
    'a semantic correction no-op created a request');
  begin
    perform public.propose_family_correction(v_claimed,v_revision,v_hash,'{}'::jsonb,
      jsonb_build_object('parents','[]'::jsonb,'partners','[]'::jsonb,'siblings',jsonb_build_array(
        jsonb_build_object('person_id',v_foreign,'variant','reported','confidence','reported'))),null);
    raise exception 'unauthorized correction endpoint was accepted';
  exception when insufficient_privilege then null; end;
  v_request:=public.propose_family_correction(v_claimed,v_revision,v_hash,jsonb_build_object(
    'nickname','Reviewed','birth_location',null,'death_location',null,
    'birth_place',repeat('b',150),'lived_in',repeat('l',150),'family_side','Mother''s side'),v_snapshot,'Diagnostic');
  perform pg_temp.assert_true(v_request is not null and exists(select 1 from public.profile_change_requests r where r.id=v_request),
    'valid correction proposal was not stored');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reviewer,'role','authenticated')::text,true);
  perform public.respond_profile_correction(v_request,true);
  perform pg_temp.assert_true(exists(select 1 from public.family_members fm where fm.id=v_claimed
    and fm.nickname='Reviewed' and char_length(fm.birth_place)=150 and char_length(fm.lived_in)=150
    and fm.family_side='Mother''s side' and fm.birth_location is null and fm.death_location is null),
    'accepted correction did not preserve boundaries or SQL NULL locations');
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_actor,'email',v_actor_email,'role','authenticated')::text,true);

  insert into public.family_invitations(graph_owner_id,inviter_id,person_id,email,scope)
  values(v_actor,v_reviewer,v_invited,v_actor_email,'connection') returning id into v_invitation;
  perform public.respond_family_invitation(v_invitation,false);
  perform pg_temp.assert_true((select status='rejected' from public.family_invitations where id=v_invitation),
    'invitation rejection is not permitted by the final status constraint');

  insert into public.family_invitations(graph_owner_id,inviter_id,person_id,email,scope)
  values(v_actor,v_reviewer,v_invited,v_actor_email,'connection') returning id into v_invitation;
  perform public.respond_family_invitation(v_invitation,true);
  perform pg_temp.assert_true(exists(select 1 from public.family_members target join public.family_members self_record on self_record.id=v_self
    where target.id=v_invited and target.linked_user_id=v_actor
      and target.person_identity_id=self_record.person_identity_id
      and target.first_name=self_record.first_name and target.surname=self_record.surname),
    'invitation acceptance did not apply claimant-self canonical identity data');
  perform pg_temp.assert_true(coalesce(current_setting('vansh.identity_locks',true),'[]')::jsonb ?
    (select person_identity_id::text from public.family_members where id=v_invited),
    'identity advisory lock context was not established');

  v_result:=public.create_family_relative(v_anchor,jsonb_build_object('first_name','Created','surname','Diagnostic'),
    jsonb_build_object('primary',jsonb_build_object('type','parent','direction','from-anchor','variant','unspecified','confidence','reported'),
      'parents','[]'::jsonb,'partners','[]'::jsonb),v_create_key);
  v_retry:=public.create_family_relative(v_anchor,jsonb_build_object('first_name','Created','surname','Diagnostic'),
    jsonb_build_object('primary',jsonb_build_object('type','parent','direction','from-anchor','variant','unspecified','confidence','reported'),
      'parents','[]'::jsonb,'partners','[]'::jsonb),v_create_key);
  perform pg_temp.assert_true(v_result=v_retry,'relative creation retry was not idempotent');
  perform pg_temp.assert_true((select count(*)=1 from public.family_members where owner_id=v_actor and first_name='Created' and surname='Diagnostic'),
    'relative creation retry created a duplicate member');
  perform pg_temp.assert_true(exists(select 1 from public.relationships where person_a_id=v_anchor
    and person_b_id=(v_result->>'member_id')::uuid and relationship_variant is null),
    'relative creation did not normalize an unspecified parent variant');
  begin
    perform public.create_family_relative(v_anchor,jsonb_build_object('first_name','Different','surname','Diagnostic'),
      jsonb_build_object('primary',jsonb_build_object('type','sibling','direction','symmetric','confidence','reported'),
        'parents','[]'::jsonb,'partners','[]'::jsonb),v_create_key);
    raise exception 'relative creation idempotency mismatch was accepted';
  exception when unique_violation then null; end;

  v_result:=public.create_family_relative(v_anchor,jsonb_build_object('first_name','DuplicateShape','surname','Diagnostic'),
    jsonb_build_object('primary',jsonb_build_object('type','parent','direction','from-anchor','variant','biological','confidence','reported'),
      'parents',jsonb_build_array(jsonb_build_object('person_id',v_anchor,'variant','biological','confidence','reported')),
      'partners','[]'::jsonb),v_duplicate_key);
  perform pg_temp.assert_true((select count(*)=1 from public.relationships r
    where r.relationship_type='parent' and r.person_a_id=v_anchor and r.person_b_id=(v_result->>'member_id')::uuid),
    'duplicate-shaped child bundle did not collapse to one parent edge');

  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.family_members','INSERT')
    and not has_table_privilege('authenticated','public.family_members','UPDATE')
    and not has_table_privilege('authenticated','public.family_members','DELETE'),
    'authenticated still has direct family_members DML');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.relationships','INSERT')
    and not has_table_privilege('authenticated','public.relationships','UPDATE')
    and not has_table_privilege('authenticated','public.relationships','DELETE'),
    'authenticated still has direct relationships DML');
  perform pg_temp.assert_true(has_function_privilege('authenticated','public.link_family_members_batch(jsonb,uuid)','EXECUTE'),
    'authenticated cannot execute the batch relationship RPC');
  perform pg_temp.assert_true(exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='vansh_before_auth_user_delete' and tgenabled<>'D'),
    'the Auth deletion lifecycle trigger is missing or disabled');
end;
$$;

rollback;
