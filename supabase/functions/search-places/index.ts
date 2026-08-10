const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const { query } = await req.json()
    const search = typeof query === 'string' ? query.trim() : ''
    if (search.length < 2 || search.length > 80) return Response.json({ results: [] }, { headers: corsHeaders })

    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', search)
    url.searchParams.set('limit', '10')
    url.searchParams.set('lang', 'en')
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Vansh family mapper/1.0' } })
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
    return Response.json({ results }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Place search failed' }, { status: 502, headers: corsHeaders })
  }
})
