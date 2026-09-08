import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

export default function WorldMap({ points }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return undefined;
    const map = L.map(elementRef.current, { worldCopyJump: true }).setView(
      [22, 70],
      2,
    );
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    const bounds = [];
    points.forEach((point) => {
      bounds.push([point.latitude, point.longitude]);
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = point.label;
      const detail = document.createElement("span");
      detail.textContent = point.detail;
      popup.append(title, detail);
      L.circleMarker([point.latitude, point.longitude], {
        radius: 7,
        weight: 2,
        color: "#285e53",
        fillColor: "#79a99c",
        fillOpacity: 0.78,
      })
        .addTo(map)
        .bindPopup(popup);
    });
    if (bounds.length === 1) map.setView(bounds[0], 5);
    if (bounds.length > 1)
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 7 });
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  return (
    <div className="private-map-wrap">
      <div className="private-map" ref={elementRef} />
      {!points.length && (
        <div className="private-map-empty">
          <MapPin size={24} />
          <strong>No mappable places yet</strong>
          <span>Edit a family member and select a city to place it here.</span>
        </div>
      )}
    </div>
  );
}
