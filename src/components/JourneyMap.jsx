import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MapPin, Route, UsersRound } from "lucide-react";
import { deriveGenerationLevels } from "../utils/kinship.js";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const ROUTE_COLORS = ["#1f6b5b", "#b56f3e", "#6c5b8f", "#39718a", "#9a5360", "#84702f", "#4e6d44"];

const colorFor = (value) => {
  const hash = [...String(value || "family")].reduce((total, character) => ((total * 31) + character.codePointAt(0)) >>> 0, 0);
  return ROUTE_COLORS[hash % ROUTE_COLORS.length];
};

const coordinatesFor = (location) => {
  const lat = Number(location?.lat ?? location?.latitude);
  const lng = Number(location?.lng ?? location?.lon ?? location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
};

const pointForFallback = (location) => {
  const coordinates = coordinatesFor(location);
  if (!coordinates) return null;
  const [lat, lng] = coordinates;
  return {
    x: ((lng + 180) / 360) * 100,
    y: ((90 - lat) / 180) * 100,
  };
};

let leafletPromise = null;
const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.crossOrigin = "";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Could not load the interactive map library."));
    document.head.appendChild(script);
  });
  return leafletPromise;
};

export default function JourneyMap({ people, relationships = [], branchFor, openPerson, addPlace }) {
  const [surname, setSurname] = useState("all");
  const [branch, setBranch] = useState("all");
  const [generation, setGeneration] = useState("all");
  const [period, setPeriod] = useState("all");
  const [mapStatus, setMapStatus] = useState("loading");
  const mapNodeRef = useRef(null);
  const leafletMapRef = useRef(null);

  const surnames = useMemo(
    () => [...new Set(people.map((person) => person.surname).filter(Boolean))].sort(),
    [people],
  );
  const branches = useMemo(
    () => [...new Set(people.map((person) => branchFor(person)).filter(Boolean))].sort(),
    [people, branchFor],
  );
  const self = people.find((person) => person.isSelf) || people[0];
  const [placePersonId, setPlacePersonId] = useState(self?.id || people[0]?.id || "");
  const levels = deriveGenerationLevels(self?.id, people, relationships);
  const generationOptions = [...new Set(people.map((person) => levels[person.id] ?? 0))].sort((a, b) => b - a);

  const inPeriod = (person) => {
    if (period === "all") return true;
    const years = [
      person.birthYear ? Number(person.birthYear) : null,
      ...(person.livedLocations || []).flatMap((location) => [location.startYear, location.endYear].map(Number)),
    ].filter(Number.isFinite);
    if (!years.length) return false;
    return period === "pre1947" ? years.some((year) => year <= 1947) : years.some((year) => year >= 1947);
  };

  const filtered = people.filter(
    (person) =>
      (surname === "all" || person.surname === surname) &&
      (branch === "all" || branchFor(person) === branch) &&
      (generation === "all" || String(levels[person.id] ?? 0) === generation) &&
      inPeriod(person),
  );

  const journeys = filtered
    .map((person) => {
      const locations = [
        person.birthLocation && { ...person.birthLocation, kind: "Birthplace" },
        ...(person.livedLocations || [])
          .slice()
          .sort((a, b) => Number(a.startYear || 9999) - Number(b.startYear || 9999))
          .map((location) => ({ ...location, kind: "Residence" })),
      ].filter(Boolean);
      const points = locations
        .map((location) => ({ location, coordinates: coordinatesFor(location) }))
        .filter((item) => item.coordinates);
      return { person, points, color: colorFor(`${branchFor(person)}:${person.surname}`) };
    })
    .filter((journey) => journey.points.length);

  const placeCount = new Set(
    journeys.flatMap((journey) => journey.points.map(({ location }) => location.providerId || location.display)),
  ).size;
  const chronology = journeys
    .flatMap(({ person, points, color }) => points.map(({ location }) => {
      const rawYear = location.kind === "Birthplace" ? person.birthYear : location.startYear;
      if (rawYear === "" || rawYear === null || rawYear === undefined) return null;
      const year = Number(rawYear);
      if (!Number.isInteger(year)) return null;
      return { person, location, year, color };
    }))
    .filter(Boolean)
    .sort((left, right) => left.year - right.year || left.person.name.localeCompare(right.person.name));
  const chronologySpan = chronology.length > 1 ? `${chronology[0].year}–${chronology.at(-1).year}` : chronology[0]?.year;
  const journeySignature = JSON.stringify(
    journeys.map(({ person, points, color }) => [
      person.id,
      color,
      points.map(({ location, coordinates }) => [location.providerId || location.display, coordinates, location.startYear, location.endYear]),
    ]),
  );

  useEffect(() => {
    let active = true;
    const renderMap = async () => {
      if (!mapNodeRef.current) return;
      setMapStatus("loading");
      try {
        const L = await loadLeaflet();
        if (!active || !L || !mapNodeRef.current) return;
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
        const map = L.map(mapNodeRef.current, {
          zoomControl: true,
          scrollWheelZoom: false,
          worldCopyJump: true,
        });
        leafletMapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const bounds = [];
        journeys.forEach(({ person, points, color }) => {
          const line = points.map(({ coordinates }) => coordinates);
          if (line.length > 1) {
            L.polyline(line, {
              weight: 3,
              opacity: 0.78,
              dashArray: "7 7",
              color,
            }).addTo(map);
          }
          points.forEach(({ location, coordinates }) => {
            bounds.push(coordinates);
            const marker = L.circleMarker(coordinates, {
              radius: location.kind === "Birthplace" ? 7 : 6,
              weight: 2,
              fillOpacity: 0.92,
              color: "#ffffff",
              fillColor: color,
            }).addTo(map);
            const tooltip = document.createElement("span");
            tooltip.textContent = `${person.name} — ${location.kind}: ${location.display}`;
            marker.bindTooltip(tooltip, { direction: "top" });
            marker.on("click", () => openPerson(person));
          });
        });
        if (bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 7 });
        else map.setView([22, 20], 2);
        window.setTimeout(() => map.invalidateSize(), 0);
        setMapStatus("ready");
      } catch (error) {
        if (!active) return;
        console.warn("Interactive journey map unavailable", error);
        setMapStatus("fallback");
      }
    };
    renderMap();
    return () => {
      active = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // journeySignature deliberately captures all rendered route data. Rebuilding the map
    // on every new array identity would loop because setMapStatus causes a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeySignature]);

  const generationLabel = (level) => {
    if (level === 0) return "Your generation";
    if (level === -1) return "Parents";
    if (level === -2) return "Grandparents";
    if (level === 1) return "Children";
    if (level === 2) return "Grandchildren";
    return level < 0 ? `${Math.abs(level)} generations above` : `${level} generations below`;
  };

  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FAMILY JOURNEY</span>
          <h1>Where your family story moved</h1>
          <p>Birthplaces and residence history are plotted on a real OpenStreetMap base map. Tap a marker to open that person.</p>
        </div>
        {addPlace && (
          <button type="button" className="primary" onClick={() => addPlace(self)}>
            <MapPin size={17} /> Add a family place
          </button>
        )}
      </div>

      <div className="journey-filters panel">
        <label>Surname
          <select value={surname} onChange={(event) => setSurname(event.target.value)}>
            <option value="all">All surnames</option>
            {surnames.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>Branch
          <select value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option value="all">All branches</option>
            {branches.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>Generation
          <select value={generation} onChange={(event) => setGeneration(event.target.value)}>
            <option value="all">All generations</option>
            {generationOptions.map((item) => <option value={String(item)} key={item}>{generationLabel(item)}</option>)}
          </select>
        </label>
        <label>Period
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="all">All recorded years</option>
            <option value="pre1947">Includes 1947 or earlier</option>
            <option value="post1947">Includes 1947 or later</option>
          </select>
        </label>
        <div className="journey-stat"><MapPin size={17} /><strong>{placeCount}</strong><span>mapped places</span></div>
        <div className="journey-stat"><UsersRound size={17} /><strong>{journeys.length}</strong><span>people with coordinates</span></div>
      </div>

      {addPlace && (
        <section className="panel journey-place-editor">
          <div>
            <span className="mini-title">ADD OR UPDATE A PLACE</span>
            <strong>Choose whose journey you want to edit</strong>
            <p className="muted">Add a birthplace or one or more residence cities. The selected city coordinates are what appear on this map.</p>
          </div>
          <label>
            Family member
            <select value={placePersonId} onChange={(event) => setPlacePersonId(event.target.value)}>
              {people.filter((person) => !person.isPlaceholder).map((person) => (
                <option value={person.id} key={person.id}>{person.name}{person.isSelf ? " (you)" : ""}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!placePersonId}
            onClick={() => addPlace(people.find((person) => person.id === placePersonId) || self)}
          >
            <MapPin size={16} /> Add / edit places
          </button>
        </section>
      )}

      <section className="journey-panel real-map-panel">
        <div className="journey-map real-journey-map">
          <div ref={mapNodeRef} className={`leaflet-map-host ${mapStatus === "fallback" ? "hidden" : ""}`} aria-label="Interactive family migration map" />
          {mapStatus === "loading" && <div className="journey-map-loading"><Route size={24} /><span>Loading interactive map…</span></div>}
          {mapStatus === "fallback" && (
            <div className="journey-fallback-map">
              <img className="journey-world" src="/world-outline.svg" alt="World map outline" />
              <div className="journey-grid" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {journeys.flatMap(({ person, points, color }) =>
                  points.slice(1).map((item, index) => {
                    const previous = points[index];
                    const a = pointForFallback(previous.location);
                    const b = pointForFallback(item.location);
                    if (!a || !b) return null;
                    return <line key={`${person.id}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="journey-route" style={{ stroke: color }} />;
                  }),
                )}
              </svg>
              {journeys.flatMap(({ person, points, color }) =>
                points.map(({ location }, index) => {
                  const point = pointForFallback(location);
                  if (!point) return null;
                  return (
                    <button
                      key={`${person.id}-${location.providerId || location.display}-${index}`}
                      className={`journey-pin ${location.kind === "Birthplace" ? "birth" : "residence"}`}
                      style={{ left: `${point.x}%`, top: `${point.y}%`, "--journey-color": color }}
                      onClick={() => openPerson(person)}
                      title={`${person.name}: ${location.kind} — ${location.display}`}
                    >
                      <MapPin size={15} />
                    </button>
                  );
                }),
              )}
              <div className="journey-fallback-note">Interactive map tiles could not load. Showing the built-in geographic fallback.</div>
            </div>
          )}
          {!journeys.length && mapStatus !== "loading" && (
            <div className="journey-empty">
              <Route size={28} />
              <strong>No coordinates in this filter yet</strong>
              <span>Edit people and select their cities using the structured location picker.</span>
            </div>
          )}
          {!!journeys.length && (
            <div className="journey-route-legend" aria-label="Visible family routes">
              {journeys.slice(0, 7).map(({ person, color }) => (
                <button type="button" key={person.id} onClick={() => openPerson(person)}>
                  <i style={{ background: color }} />{person.name}
                </button>
              ))}
              {journeys.length > 7 && <span>+{journeys.length - 7} more</span>}
            </div>
          )}
        </div>
      </section>

      <section className="panel family-chronology">
        <div className="panel-title">
          <div><span className="mini-title">FAMILY CHRONOLOGY</span><h2>Lives across time</h2><p>Dated births and moves from the current map filter.</p></div>
          {chronologySpan && <span className="chronology-span"><CalendarDays size={15} />{chronologySpan}</span>}
        </div>
        <div className="chronology-track">
          {chronology.slice(0, 60).map(({ person, location, year, color }, index) => (
            <button type="button" key={`${person.id}-${location.kind}-${year}-${index}`} onClick={() => openPerson(person)}>
              <span className="chronology-year">{year}</span>
              <i style={{ background: color }} />
              <span className="chronology-event"><strong>{person.name}</strong><small>{location.kind === "Birthplace" ? "Born" : "Moved"} · {location.display}</small></span>
            </button>
          ))}
          {!chronology.length && <p className="muted">Add birth years or residence start years to build a shared family chronology.</p>}
        </div>
      </section>

      <section className="panel journey-timeline-list">
        <div className="panel-title"><div><span className="mini-title">MIGRATION TIMELINES</span><h2>Recorded routes</h2></div></div>
        {journeys.slice(0, 12).map(({ person, points, color }) => (
          <button key={person.id} onClick={() => openPerson(person)} style={{ "--journey-color": color }}>
            <strong>{person.name}</strong>
            <span>{points.map(({ location }) => `${location.display}${location.startYear ? ` (${location.startYear}${location.endYear ? `–${location.endYear}` : ""})` : ""}`).join(" → ")}</span>
          </button>
        ))}
        {!journeys.length && <p className="muted">No migration route in the current filter.</p>}
      </section>
      <div className="map-explainer">
        <Route size={20} />
        <div>
          <strong>Migration timeline</strong>
          <p>Each route starts at a recorded birthplace and follows residence entries in chronological order. Add residence years to make the route more precise.</p>
        </div>
      </div>
    </div>
  );
}
