-- Some early development projects installed invitation-access helpers before
-- the access-table column was standardized from person_id to member_id. Keep
-- those projects compatible without introducing legacy helpers on clean installs.

do $migration$
begin
  if to_regprocedure('public.populate_family_invitation_access(uuid)') is not null then
    execute $function$
      create or replace function public.populate_family_invitation_access(p_invitation_id uuid)
      returns integer
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        affected integer;
        invitation public.family_invitations%rowtype;
      begin
        select * into invitation
        from public.family_invitations
        where id = p_invitation_id;

        if not found then
          raise exception 'Invitation not found';
        end if;

        delete from public.family_invitation_access
        where invitation_id = p_invitation_id;

        if invitation.scope = 'connection' then
          insert into public.family_invitation_access (invitation_id, member_id)
          select p_invitation_id, member.person_id
          from public.family_connection_member_ids(
            invitation.inviter_person_id,
            invitation.person_id,
            invitation.graph_owner_id
          ) member;
        else
          insert into public.family_invitation_access (invitation_id, member_id)
          select p_invitation_id, member.person_id
          from public.family_invitation_member_ids(
            invitation.person_id,
            invitation.scope,
            invitation.graph_owner_id
          ) member;
        end if;

        get diagnostics affected = row_count;
        return affected;
      end;
      $body$
    $function$;

    revoke all on function public.populate_family_invitation_access(uuid)
    from public, anon, authenticated;
  end if;
end;
$migration$;
