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
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  const from = Deno.env.get('VANSH_FROM_EMAIL') || ''
  const appUrl = Deno.env.get('VANSH_APP_URL') || 'http://localhost:5173'
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const kind = ['identity', 'family', 'correction'].includes(body.kind) ? body.kind : ''
    const requestId = typeof body.requestId === 'string' ? body.requestId : ''
    if (!kind || !requestId) return json({ error: 'Invalid request notification.' }, 400)

    let targetUserId = ''
    let subject = 'You have a new Vansh request'
    let line = 'A family request is waiting for your review.'
    if (kind === 'identity') {
      const { data } = await admin.from('identity_claim_requests').select('candidate_owner_id, claimant_user_id').eq('id', requestId).single()
      if (!data || data.claimant_user_id !== userData.user.id) return json({ error: 'Request not found.' }, 404)
      targetUserId = data.candidate_owner_id
      subject = 'Identity claim waiting in Vansh'
      line = 'Someone believes an existing family record may represent them. Your approval is required before anything is linked.'
    } else if (kind === 'family') {
      const { data } = await admin.from('family_connection_requests').select('from_user_id, to_user_id').eq('id', requestId).single()
      if (!data || data.from_user_id !== userData.user.id) return json({ error: 'Request not found.' }, 404)
      targetUserId = data.to_user_id
      subject = 'Family connection request in Vansh'
      line = 'Another Vansh user sent a family connection request. Nothing is shared until you accept.'
    } else {
      const { data } = await admin.from('profile_change_requests').select('proposer_user_id, member_id, reviewer_user_id').eq('id', requestId).single()
      if (!data || data.proposer_user_id !== userData.user.id) return json({ error: 'Request not found.' }, 404)
      const { data: member } = await admin.from('family_members').select('linked_user_id, created_by, owner_id').eq('id', data.member_id).single()
      targetUserId = data.reviewer_user_id || member?.linked_user_id || member?.created_by || member?.owner_id || ''
      subject = 'Family correction suggestion in Vansh'
      line = 'A relative suggested a correction to a family record you review. The record is unchanged until you accept.'
    }
    if (!targetUserId) return json({ delivered: false, reason: 'No target account' })
    const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetUserId)
    if (targetError || !target.user?.email) return json({ delivered: false, reason: 'No target email' })
    if (!resendKey || !from) return json({ delivered: false, reason: 'Email provider not configured' })

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [target.user.email],
        subject,
        html: `<p>${line}</p><p><a href="${appUrl.replace(/\/$/, '')}/matches">Open your Vansh verification inbox</a></p><p>If you do not recognize this request, you can reject it in Vansh.</p>`,
      }),
    })
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
    return json({ delivered: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not send notification email.' }, 500)
  }
})
