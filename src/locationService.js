import { supabase } from "./supabase.js";

const LOCAL_BACKEND = "http://127.0.0.1:8001";

const normalize = (place) => {
  if (!place) return null;
  const lat = Number(place.lat ?? place.latitude);
  const lon = Number(place.lon ?? place.lng ?? place.longitude);
  const city = place.city || place.town || place.village || place.municipality || "";
  const country = place.country || "";
  const display = place.display || place.display_name || [city, country].filter(Boolean).join(", ");
  if (!display) return null;
  return {
    providerId: String(place.providerId || place.place_id || `${lat}:${lon}:${display}`),
    display,
    city,
    region: place.region || place.state || place.county || "",
    country,
    countryCode: String(place.countryCode || place.country_code || "").toUpperCase(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
};

const viaSupabase = async (query) => {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke("search-places", {
    body: { query },
  });
  if (error) throw error;
  return (data?.results || []).map(normalize).filter(Boolean);
};

const viaLocalBackend = async (query) => {
  const response = await fetch(`${LOCAL_BACKEND}/places/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("Local place search unavailable");
  const data = await response.json();
  return (data?.results || []).map(normalize).filter(Boolean);
};

export async function searchPlaces(query) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 2) return [];
  try {
    return await viaSupabase(trimmed);
  } catch {
    try {
      return await viaLocalBackend(trimmed);
    } catch {
      return [];
    }
  }
}

export async function geocodeOne(query) {
  const results = await searchPlaces(query);
  return results[0] || null;
}
