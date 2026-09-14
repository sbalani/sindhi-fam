import { useEffect, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { supabase } from "./supabase.js";
import { canonicalPlaceSearchQuery } from "./utils/sindhiSearch.js";

const normalizePhoton = (payload) => {
  const seen = new Set();
  const results = [];
  for (const feature of payload?.features || []) {
    const properties = feature.properties || {};
    const country = properties.country;
    const city = properties.city || properties.name;
    if (!city || !country || ["country", "state", "county"].includes(properties.type)) continue;
    const region = properties.state || properties.county || null;
    const key = `${city}|${region || ""}|${country}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      providerId: `${properties.osm_type || "osm"}:${properties.osm_id || key}`,
      city,
      region,
      country,
      countryCode: properties.countrycode?.toUpperCase() || null,
      display: [city, region, country].filter(Boolean).join(", "),
      longitude: feature.geometry?.coordinates?.[0] ?? null,
      latitude: feature.geometry?.coordinates?.[1] ?? null,
    });
    if (results.length === 7) break;
  }
  return results;
};

const directPlaceSearch = async (query, signal) => {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("lang", "en");
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Place search returned ${response.status}`);
  return normalizePhoton(await response.json());
};

export default function LocationPicker({
  value,
  onChange,
  multiple = false,
  legacyValue = "",
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [searchSource, setSearchSource] = useState("");
  const [replacingLegacy, setReplacingLegacy] = useState(!legacyValue);
  const selected = multiple ? value || [] : value ? [value] : [];

  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const term = query.trim();
      const providerQuery = canonicalPlaceSearchQuery(term);
      setSearching(true);
      setError("");
      let nextResults = [];
      try {
        const { data, error: functionError } = await supabase.functions.invoke(
          "search-places",
          { body: { query: providerQuery } },
        );
        if (!functionError && Array.isArray(data?.results)) {
          nextResults = data.results;
          setSearchSource("server");
        } else {
          nextResults = await directPlaceSearch(providerQuery, controller.signal);
          setSearchSource("direct");
        }
      } catch {
        try {
          nextResults = await directPlaceSearch(providerQuery, controller.signal);
          setSearchSource("direct");
        } catch (fallbackError) {
          if (fallbackError?.name === "AbortError") return;
          setError("City search is unavailable right now. Check your internet connection and try again.");
          setSearchSource("");
        }
      }
      if (!active) return;
      setResults(nextResults);
      setSearching(false);
    }, 280);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const search = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setError("");
    setResults([]);
    setSearching(nextQuery.trim().length >= 2);
  };
  const choose = (location) => {
    if (multiple) {
      const duplicate = selected.some(
        (item) =>
          (item.providerId && item.providerId === location.providerId) ||
          item.display?.toLowerCase() === location.display?.toLowerCase(),
      );
      if (duplicate) {
        setError(`${location.display} is already in this residence list.`);
        return;
      }
      onChange([
        ...selected,
        {
          ...location,
          residenceId: crypto.randomUUID(),
          startYear: null,
          endYear: null,
        },
      ]);
    } else onChange(location);
    setQuery("");
    setResults([]);
    setSearching(false);
  };
  const remove = (index) =>
    onChange(
      multiple ? selected.filter((_, itemIndex) => itemIndex !== index) : null,
    );
  const updateYear = (index, field, year) =>
    onChange(
      selected.map((location, itemIndex) =>
        itemIndex === index
          ? {
              ...location,
              residenceId: location.residenceId || crypto.randomUUID(),
              [field]: year,
            }
          : location,
      ),
    );

  const showSearch = !legacyValue || replacingLegacy || selected.length > 0;

  return (
    <div className="location-picker">
      {selected.length > 0 && (
        <div className="selected-locations">
          {selected.map((location, index) => (
            <div
              className={`selected-location ${multiple ? "dated-location" : ""}`}
              key={
                location.residenceId ||
                `${location.providerId || location.display}-${index}`
              }
            >
              <div className="selected-location-name">
                <MapPin size={12} />
                <span>{location.display}</span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${location.display}`}
                >
                  <X size={12} />
                </button>
              </div>
              {multiple && (
                <div className="residence-years">
                  <label>
                    From
                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={location.startYear || ""}
                      onChange={(event) =>
                        updateYear(index, "startYear", event.target.value)
                      }
                      placeholder="e.g. 1947"
                      aria-label={`Year ${location.display} residence began`}
                    />
                  </label>
                  <span>to</span>
                  <label>
                    To
                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={location.endYear || ""}
                      onChange={(event) =>
                        updateYear(index, "endYear", event.target.value)
                      }
                      placeholder="Present"
                      aria-label={`Year ${location.display} residence ended`}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {legacyValue && (
        <button
          type="button"
          className={`legacy-location ${selected.length ? "will-replace" : ""}`}
          onClick={() => setReplacingLegacy(true)}
        >
          <span>
            {selected.length
              ? "These selections will replace:"
              : "Currently saved as free text:"}
          </span>
          <strong>{legacyValue}</strong>
          <small>
            {replacingLegacy
              ? selected.length
                ? "Save your changes to complete the replacement."
                : "Now select the correct city or cities below."
              : "Tap here to replace this entry."}
          </small>
        </button>
      )}
      {showSearch && (
        <>
          <div className="location-search">
            <Search size={15} />
            <input
              value={query}
              onChange={search}
              placeholder={
                multiple && selected.length
                  ? "Add another city"
                  : "Search for a city — Roman Sindhi or سنڌي"
              }
              autoComplete="off"
            />
            {searching && <LoaderCircle className="spin" size={15} />}
          </div>
          {query.length > 0 && query.trim().length < 2 && (
            <small className="location-hint">Type at least 2 characters.</small>
          )}
          {error && <small className="location-error">{error}</small>}
          {results.length > 0 && (
            <div className="location-results">
              {results.map((location) => (
                <button
                  type="button"
                  key={location.providerId}
                  onClick={() => choose(location)}
                >
                  <MapPin size={15} />
                  <span>
                    <strong>{location.city}</strong>
                    <small>
                      {[location.region, location.country]
                        .filter(Boolean)
                        .join(", ")}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 &&
            !searching &&
            !results.length &&
            !error && (
              <small className="location-hint">
                No matching city found. Try a nearby town or alternate spelling.
              </small>
            )}
          {searchSource === "direct" && results.length > 0 && (
            <small className="location-hint">Using direct OpenStreetMap place search while the Vansh search service is unavailable.</small>
          )}
          <small className="selection-rule">
            {multiple
              ? "Add optional years after selecting a city. Leave To blank if they still live there."
              : "Only a selected city and country will be saved."}
          </small>
        </>
      )}
    </div>
  );
}
