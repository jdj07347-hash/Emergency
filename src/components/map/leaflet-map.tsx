"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { MapLine, MapPoint, MapViewProps } from "./types";

const KIND_STYLE: Record<MapPoint["kind"], { color: string; icon: string }> = {
  incident: { color: "#ef4444", icon: "🚨" },
  FIRE: { color: "#ea580c", icon: "🚒" },
  POLICE: { color: "#2563eb", icon: "👮" },
  AMBULANCE: { color: "#16a34a", icon: "🚑" },
  hospital: { color: "#9333ea", icon: "🏥" },
};

function iconFor(p: MapPoint) {
  const style = KIND_STYLE[p.kind];
  const color = p.color ?? style.color;
  const classes = ["pin", p.kind === "incident" ? "incident" : "", p.highlighted ? "highlight" : "", p.dimmed ? "dim" : ""].join(" ");
  const size = p.kind === "incident" ? 40 : 34;
  return L.divIcon({
    className: "sr-marker",
    html: `<div class="${classes}" style="background:${color}">${style.icon}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function FitBounds({ points, focusKey }: { points: MapPoint[]; focusKey?: string }) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    // Re-fit only when the focus changes, so live updates don't fight the user's panning.
    const key = focusKey ?? "default";
    if (lastKey.current === key || points.length === 0) return;
    lastKey.current = key;
    const focus = points.filter((p) => p.focus);
    const target = focus.length ? focus : points;
    if (target.length === 1) {
      map.setView([target[0].latitude, target[0].longitude], 14);
    } else {
      map.fitBounds(L.latLngBounds(target.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [48, 48], maxZoom: 15 });
    }
  }, [map, points, focusKey]);
  return null;
}

export default function LeafletMap({ points, lines = [], dark = false, focusKey, onSelect, className }: MapViewProps) {
  const center = useMemo<[number, number]>(
    () => (points.length ? [points[0].latitude, points[0].longitude] : [20, 0]),
    // Initial center only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className={`${dark ? "sr-map-dark" : ""} ${className ?? ""} relative isolate overflow-hidden`}>
      <MapContainer center={center} zoom={points.length ? 13 : 2} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds points={points} focusKey={focusKey} />
        {lines.map((l: MapLine) => (
          <Polyline
            key={l.id}
            positions={l.path?.length ? l.path : [l.from, l.to]}
            pathOptions={{ color: l.color, weight: l.path?.length ? 5 : 3, opacity: 0.8, dashArray: l.dashed ? "6 8" : undefined }}
          />
        ))}
        {points
          .filter((p) => p.accuracyM)
          .map((p) => (
            <Circle
              key={`acc-${p.id}`}
              center={[p.latitude, p.longitude]}
              radius={p.accuracyM!}
              pathOptions={{ color: "#ef4444", weight: 1, fillColor: "#ef4444", fillOpacity: 0.12 }}
            />
          ))}
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={iconFor(p)}
            zIndexOffset={p.kind === "incident" ? (p.highlighted ? 1000 : 500) : 0}
            eventHandlers={onSelect && p.selectable ? { click: () => onSelect(p.id) } : undefined}
          >
            <Popup>
              <div className="font-semibold text-slate-900">{p.label}</div>
              {p.sublabel && <div className="text-slate-600">{p.sublabel}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
