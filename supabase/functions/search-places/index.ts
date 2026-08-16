const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { query } = await req.json();
    const q = String(query || "").trim();
    if (q.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "VanshFamilyMap/0.13 (Supabase Edge Function)",
        "Accept-Language": "en",
      },
    });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const data = await response.json();
    const results = data.map((item: any) => {
      const address = item.address || {};
      const city = address.city || address.town || address.village || address.municipality || address.county || "";
      return {
        providerId: String(item.place_id || ""),
        display: item.display_name || [city, address.country].filter(Boolean).join(", "),
        city,
        region: address.state || address.region || "",
        country: address.country || "",
        countryCode: String(address.country_code || "").toUpperCase(),
        lat: item.lat ? Number(item.lat) : null,
        lon: item.lon ? Number(item.lon) : null,
      };
    }).filter((item: any) => item.country);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error), results: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
