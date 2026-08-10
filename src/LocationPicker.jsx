import { useEffect, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { supabase } from "./supabase.js";

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
  const [replacingLegacy, setReplacingLegacy] = useState(!legacyValue);
  const selected = multiple ? value || [] : value ? [value] : [];

  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase.functions.invoke(
        "search-places",
        { body: { query } },
      );
      if (!active) return;
      setResults(data?.results || []);
      setError(searchError ? "City search is temporarily unavailable." : "");
      setSearching(false);
    }, 300);
    return () => {
      active = false;
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
                  : "Search for a city"
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
