import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Please sign in again before sending an invitation.' }, 401)

  try {
    const body = await req.json()
    const personId = typeof body.personId === 'string' ? body.personId : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const scope = ['connection', 'immediate', 'extended'].includes(body.scope) ? body.scope : 'connection'
    if (!personId || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
    if (email === userData.user.email?.toLowerCase()) return json({ error: 'You cannot invite your own email address.' }, 400)

    const { data: person, error: personError } = await userClient.from('family_members').select('id, owner_id, linked_user_id, first_name, surname').eq('id', personId).single()
    if (personError || !person) return json({ error: 'You do not have access to invite this family member.' }, 403)
    if (person.linked_user_id) return json({ error: `${person.first_name} already has a linked Vansh account.` }, 409)

    const { count: recentInvites } = await admin
      .from('family_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', userData.user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    if ((recentInvites || 0) >= 20) return json({ error: 'Invitation limit reached. Please try again later.' }, 429)

    const { data: inviterPerson } = await userClient.from('family_members').select('id').eq('owner_id', person.owner_id).eq('linked_user_id', userData.user.id).limit(1).maybeSingle()
    const { data: invitation, error: inviteError } = await admin.from('family_invitations').insert({
      graph_owner_id: person.owner_id,
      inviter_id: userData.user.id,
      inviter_person_id: inviterPerson?.id || null,
      person_id: person.id,
      email,
      scope,
      status: 'pending',
    }).select('id').single()
    if (inviteError) {
      if (inviteError.code === '23505') return json({ error: 'A pending invitation already exists for this person and email.' }, 409)
      throw inviteError
    }

    const redirectTo = Deno.env.get('VANSH_APP_URL') || 'https://sindhi-fam.vercel.app'
    const metadata = { display_name: `${person.first_name} ${person.surname}`, family_surname: person.surname, vansh_invitation_id: invitation.id }
    const { error: newUserError } = await admin.auth.admin.inviteUserByEmail(email, { data: metadata, redirectTo })
    let delivery = 'invitation'
    if (newUserError) {
      const publicClient = createClient(url, anonKey)
      const { error: existingUserError } = await publicClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
      if (existingUserError) {
        await admin.from('family_invitations').delete().eq('id', invitation.id)
        throw new Error(`Could not send the invitation email: ${existingUserError.message}`)
      }
      delivery = 'sign-in link'
    }

    const { count } = await admin.from('family_invitation_access').select('*', { count: 'exact', head: true }).eq('invitation_id', invitation.id)
    return json({ invitationId: invitation.id, sharedPeople: count || 0, delivery })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not send invitation.' }, 500)
  }
})
