import { useEffect, useMemo, useRef } from "react";
import { MapPin } from "lucide-react";

const DEFAULT_CENTER = [20, 10];

const escapeText = (value) => String(value ?? "");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validPoint = (point) =>
  toNumber(point?.lat) !== null && toNumber(point?.lon) !== null;

export default function WorldMap({
  points = [],
  compact = false,
  aggregate = false,
  emptyText = "Add a city or country to place your family on the map.",
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const readyPoints = useMemo(() => points.filter(validPoint), [points]);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapElementRef.current) return undefined;

    if (!mapRef.current) {
      mapRef.current = L.map(mapElementRef.current, {
        zoomControl: !compact,
        scrollWheelZoom: !compact,
        attributionControl: true,
        worldCopyJump: true,
      }).setView(DEFAULT_CENTER, compact ? 1 : 2);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }

    if (layerRef.current) layerRef.current.remove();
    const layer = L.layerGroup().addTo(mapRef.current);
    layerRef.current = layer;

    const bounds = [];
    readyPoints.forEach((point) => {
      const lat = Number(point.lat);
      const lon = Number(point.lon);
      const count = Math.max(1, Number(point.count || 1));
      bounds.push([lat, lon]);

      const marker = L.circleMarker([lat, lon], {
        radius: aggregate ? Math.min(24, 6 + Math.sqrt(count) * 3.2) : 7,
        weight: 2,
        opacity: 0.92,
        fillOpacity: aggregate ? 0.58 : 0.72,
        color: aggregate ? "#9f5a3a" : "#2f6c5e",
        fillColor: aggregate ? "#d88b61" : "#6ca08f",
      }).addTo(layer);

      const popup = document.createElement("div");
      popup.className = "map-popup";
      const title = document.createElement("strong");
      title.textContent = escapeText(point.label || point.city || point.country || "Recorded place");
      popup.appendChild(title);

      const meta = document.createElement("span");
      meta.textContent = aggregate
        ? `${count} ${count === 1 ? "person" : "people"}`
        : escapeText(point.subLabel || point.detail || "Family location");
      popup.appendChild(meta);

      if (point.detail && aggregate) {
        const detail = document.createElement("small");
        detail.textContent = escapeText(point.detail);
        popup.appendChild(detail);
      }
      marker.bindPopup(popup);
    });

    if (bounds.length === 1) {
      mapRef.current.setView(bounds[0], compact ? 3 : 5);
    } else if (bounds.length > 1) {
      mapRef.current.fitBounds(bounds, {
        padding: compact ? [20, 20] : [42, 42],
        maxZoom: compact ? 4 : 7,
      });
    } else {
      mapRef.current.setView(DEFAULT_CENTER, compact ? 1 : 2);
    }

    window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
    return undefined;
  }, [readyPoints, compact, aggregate]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    },
    [],
  );

  return (
    <div className={`world-map-wrap ${compact ? "compact" : ""}`}>
      <div ref={mapElementRef} className="world-map" />
      {!readyPoints.length && (
        <div className="world-map-empty">
          <MapPin size={22} />
          <strong>No mappable places yet</strong>
          <span>{emptyText}</span>
        </div>
      )}
    </div>
  );
}
