drop policy if exists "Read accessible family members" on public.family_members;

create policy "Read accessible family members"
on public.family_members
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or created_by = (select auth.uid())
  or linked_user_id = (select auth.uid())
  or public.can_access_family_member((select auth.uid()), id)
);
