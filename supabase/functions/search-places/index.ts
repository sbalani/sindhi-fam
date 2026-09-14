import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...corsHeaders, ...extraHeaders } })

// Best-effort per-instance throttling. Authentication is the actual access
// control; this simply dampens accidental/automated bursts without adding a
// database write for every keystroke.
const recentRequests = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 30

const withinRateLimit = (userId: string) => {
  const now = Date.now()
  const recent = (recentRequests.get(userId) || []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    recentRequests.set(userId, recent)
    return false
  }
  recent.push(now)
  recentRequests.set(userId, recent)
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!authHeader.startsWith('Bearer ') || !url || !anonKey) {
    return json({ error: 'Authentication required' }, 401)
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401)
  if (!withinRateLimit(userData.user.id)) {
    return json({ error: 'Too many place searches. Try again shortly.' }, 429, { 'Retry-After': '60' })
  }

  try {
    const { query } = await req.json()
    const search = typeof query === 'string' ? query.trim() : ''
    if (search.length < 2 || search.length > 80) return json({ results: [] })

    const photonUrl = new URL('https://photon.komoot.io/api/')
    photonUrl.searchParams.set('q', search)
    photonUrl.searchParams.set('limit', '10')
    photonUrl.searchParams.set('lang', 'en')
    const response = await fetch(photonUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Vansh family mapper/1.0' },
    })
    if (!response.ok) throw new Error(`Place provider returned ${response.status}`)
    const payload = await response.json()
    const seen = new Set<string>()
    const results = []

    for (const feature of payload.features ?? []) {
      const properties = feature.properties ?? {}
      const country = properties.country
      const city = properties.city || properties.name
      if (!city || !country || ['country', 'state', 'county'].includes(properties.type)) continue
      const region = properties.state || properties.county || null
      const key = `${city}|${region || ''}|${country}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        providerId: `${properties.osm_type || 'osm'}:${properties.osm_id || key}`,
        city,
        region,
        country,
        countryCode: properties.countrycode?.toUpperCase() || null,
        display: [city, region, country].filter(Boolean).join(', '),
        longitude: feature.geometry?.coordinates?.[0] ?? null,
        latitude: feature.geometry?.coordinates?.[1] ?? null,
      })
      if (results.length === 7) break
    }
    return json({ results }, 200, { 'Cache-Control': 'private, max-age=300' })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Place search failed' },
      502,
    )
  }
})
