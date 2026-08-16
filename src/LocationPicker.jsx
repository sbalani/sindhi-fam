import { useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { searchPlaces } from "./locationService.js";

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

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    setResults([]);
    const found = await searchPlaces(query);
    setResults(found);
    if (!found.length)
      setError(
        "No matching place found. Start the local voice backend or deploy the included Supabase search-places function, then try a city or country.",
      );
    setSearching(false);
  };

  const search = (event) => {
    setQuery(event.target.value);
    setError("");
    setResults([]);
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
                : "Now select the correct city or country below."
              : "Tap here to replace this entry."}
          </small>
        </button>
      )}
      {showSearch && (
        <>
          <div className="location-search location-search-submit">
            <Search size={15} />
            <input
              value={query}
              onChange={search}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
              placeholder={
                multiple && selected.length
                  ? "Add another city or country"
                  : "Search for a city or country"
              }
              autoComplete="off"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || query.trim().length < 2}
              aria-label="Search places"
            >
              {searching ? <LoaderCircle className="spin" size={15} /> : "Find"}
            </button>
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
                    <strong>{location.city || location.country}</strong>
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
          <small className="selection-rule">
            {multiple
              ? "Choose a result so Vansh can save the city/country and map coordinates. Add optional years after selecting it."
              : "Choose a result so Vansh can save at least the country and, when available, the city and map coordinates."}
          </small>
        </>
      )}
    </div>
  );
}
