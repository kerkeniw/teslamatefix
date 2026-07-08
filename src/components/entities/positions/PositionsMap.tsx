"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  groupPoints,
  subsampleTrack,
  driveColor,
  MAX_POINTS_PER_DRIVE,
  MAX_LOOSE_POINTS,
  type MapPoint,
} from "@/lib/positions/map-points";

// Marqueur départ/arrivée sans dépendance CDN (divIcon), calqué sur DriveTrackMap.
function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Cadre la vue une seule fois par `fitKey` (changement de plage), pas à chaque
// lot reçu — sinon le zoom se réinitialiserait pendant le chargement AJAX.
function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  const doneRef = useRef<string | null>(null);
  useEffect(() => {
    if (points.length === 0) return;
    if (doneRef.current === fitKey) return;
    doneRef.current = fitKey;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points, fitKey]);
  return null;
}

function PointPopup({ point }: { point: MapPoint }) {
  const t = useTranslations("positions");
  const format = useFormatter();
  return (
    <Popup>
      <div className="space-y-0.5 text-xs">
        <div className="font-mono">#{point.id}</div>
        <div>{format.dateTime(new Date(point.date), "short")}</div>
        {point.speed != null ? (
          <div>
            {t("fields.speed")}: {point.speed}
          </div>
        ) : null}
        {point.power != null ? (
          <div>
            {t("fields.power")}: {point.power}
          </div>
        ) : null}
        <Link
          href={`/positions/${point.id}`}
          className="text-tesla-red underline underline-offset-2"
        >
          {t("edit")}
        </Link>
      </div>
    </Popup>
  );
}

function DriveTrack({ driveId, points }: { driveId: number; points: MapPoint[] }) {
  const t = useTranslations("positions");
  const color = driveColor(driveId);
  const line = points.map((p) => [p.lat, p.lng] as [number, number]);
  const start = points[0];
  const end = points[points.length - 1];
  if (line.length === 0) return null;

  return (
    <>
      <Polyline positions={line} pathOptions={{ color, weight: 4, opacity: 0.85 }}>
        <Tooltip sticky>{t("map.driveTooltip", { id: driveId })}</Tooltip>
      </Polyline>
      {start ? (
        <Marker position={[start.lat, start.lng]} icon={pinIcon(color)}>
          <PointPopup point={start} />
        </Marker>
      ) : null}
      {end && line.length > 1 ? (
        <Marker position={[end.lat, end.lng]} icon={pinIcon(color)}>
          <PointPopup point={end} />
        </Marker>
      ) : null}
    </>
  );
}

export function PositionsMap({
  points,
  hiddenDrives,
  showLoose,
  fitKey,
}: {
  points: MapPoint[];
  hiddenDrives: Set<number>;
  showLoose: boolean;
  fitKey: string;
}) {
  // Regroupement + filtrage visibilité + décimation (rendu) — recalculé quand
  // les points s'accumulent ou que la sélection change.
  const { tracks, loose, allLatLng } = useMemo(() => {
    const grouped = groupPoints(points);
    const tracks = grouped.drives
      .filter((d) => !hiddenDrives.has(d.driveId))
      .map((d) => ({
        driveId: d.driveId,
        points: subsampleTrack(d.points, MAX_POINTS_PER_DRIVE),
      }));
    const loose = showLoose ? subsampleTrack(grouped.loose, MAX_LOOSE_POINTS) : [];

    const allLatLng: [number, number][] = [];
    for (const tr of tracks) for (const p of tr.points) allLatLng.push([p.lat, p.lng]);
    for (const p of loose) allLatLng.push([p.lat, p.lng]);
    return { tracks, loose, allLatLng };
  }, [points, hiddenDrives, showLoose]);

  const center = allLatLng[0] ?? [46.6, 2.4]; // centre France par défaut

  return (
    <div className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {tracks.map((tr) => (
          <DriveTrack key={tr.driveId} driveId={tr.driveId} points={tr.points} />
        ))}

        {loose.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={3}
            pathOptions={{
              color: "#6b7280",
              fillColor: "#9ca3af",
              fillOpacity: 0.8,
              weight: 1,
            }}
          >
            <PointPopup point={p} />
          </CircleMarker>
        ))}

        <FitBounds points={allLatLng} fitKey={fitKey} />
      </MapContainer>
    </div>
  );
}
