"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type TrackPoint = {
  lat: number;
  lng: number;
  speed: number | null;
  power: number | null;
};

export type TrackColorMode = "track" | "power" | "speed";

// Au-delà de ce nombre de segments, on sous-échantillonne pour garder Leaflet
// fluide (un drive peut compter plusieurs milliers de positions).
const MAX_SEGMENTS = 800;

// --- Couleurs ---------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// Power : vert vif (min) -> rouge vif (max).
function powerColor(t: number): string {
  return lerpColor("#22c55e", "#ef4444", t);
}

// Vitesse : vert -> jaune -> rouge.
function speedColor(t: number): string {
  if (t <= 0.5) return lerpColor("#16a34a", "#eab308", t / 0.5);
  return lerpColor("#eab308", "#dc2626", (t - 0.5) / 0.5);
}

// --- Marqueurs départ / arrivée (divIcon, sans dépendance CDN) --------------

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const startIcon = pinIcon("#16a34a");
const endIcon = pinIcon("#dc2626");

// --- Cadrage automatique sur l'ensemble du tracé ---------------------------

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);
  return null;
}

export function DriveTrackMap({
  track,
  mode,
  startLabel = "Départ",
  endLabel = "Arrivée",
}: {
  track: TrackPoint[];
  mode: TrackColorMode;
  startLabel?: string;
  endLabel?: string;
}) {
  const points = useMemo<[number, number][]>(
    () => track.map((p) => [p.lat, p.lng]),
    [track],
  );

  // Segments colorés (modes power / vitesse), sous-échantillonnés si besoin.
  const segments = useMemo(() => {
    if (mode === "track" || track.length < 2) return [];

    const metric = mode === "power" ? "power" : "speed";
    const values = track
      .map((p) => p[metric])
      .filter((v): v is number => v != null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const span = max - min;

    const step = Math.max(1, Math.ceil((track.length - 1) / MAX_SEGMENTS));
    const colorFn = mode === "power" ? powerColor : speedColor;

    const segs: { positions: [number, number][]; color: string }[] = [];
    for (let i = 0; i + step < track.length; i += step) {
      const a = track[i];
      const b = track[i + step];
      const raw = a[metric] ?? b[metric] ?? min;
      const t = span > 0 ? (raw - min) / span : 0.5;
      segs.push({
        positions: [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        color: colorFn(t),
      });
    }
    return segs;
  }, [track, mode]);

  const start = points[0];
  const end = points[points.length - 1];

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <MapContainer
        center={start ?? [0, 0]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mode === "track" ? (
          <Polyline positions={points} pathOptions={{ color: "#2563eb", weight: 4 }} />
        ) : (
          segments.map((s, i) => (
            <Polyline
              key={i}
              positions={s.positions}
              pathOptions={{ color: s.color, weight: 5 }}
            />
          ))
        )}

        {start ? (
          <Marker position={start} icon={startIcon}>
            <Tooltip>{startLabel}</Tooltip>
          </Marker>
        ) : null}
        {end && points.length > 1 ? (
          <Marker position={end} icon={endIcon}>
            <Tooltip>{endLabel}</Tooltip>
          </Marker>
        ) : null}

        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
