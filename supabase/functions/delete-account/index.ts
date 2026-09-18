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
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'The delete-account Edge Function is not configured on this Supabase project.' }, 503)
  }

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Please sign in again before deleting your account.' }, 401)
  const userId = userData.user.id

  try {
    // v0.13.2 deliberately does NOT transfer or delete family rows here.
    // The graph key is independent from auth.users and the DB's BEFORE DELETE
    // trigger marks shared graphs active and sole-user graphs as a 30-day
    // orphaned safety archive. This also makes deletion safe when done from the
    // Supabase Authentication dashboard rather than through the app.
    const { data: deletionImpact, error: previewError } = await userClient.rpc('preview_account_deletion')
    if (previewError) throw new Error(`Could not inspect account deletion impact: ${previewError.message}`)

    // Remove account-level discoverability/profile text before deleting Auth.
    // Genealogical family-member records are separate and remain in the graph;
    // linked_user_id / created_by / filled_by are cleared by SET NULL FKs.
    const { error: anonymizeError } = await admin.from('profiles').update({
      display_name: 'Deleted Vansh account',
      first_name: null,
      surname: null,
      birth_surname: null,
      location: null,
      birth_date: null,
      birth_location_text: null,
      current_location_text: null,
      birth_location: null,
      current_location: null,
      discovery_enabled: false,
    }).eq('id', userId)
    if (anonymizeError) throw anonymizeError

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false)
    if (deleteError) {
      console.error('Auth delete failed', { userId, message: deleteError.message })
      throw new Error(`Supabase Auth could not delete the user: ${deleteError.message}. Apply migration 20260830110000_account_persistence_family_updates.sql and retry.`)
    }

    return json({ deleted: true, impact: deletionImpact })
  } catch (error) {
    console.error('delete-account failed', { userId, error })
    return json({ error: error instanceof Error ? error.message : 'Could not delete the account.' }, 500)
  }
})
