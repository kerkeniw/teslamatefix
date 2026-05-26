"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet 1.9 sert ses icônes via des chemins relatifs au CSS, qui sont cassés
// dans un bundler moderne (Next.js / webpack). On force des URLs CDN absolues.
// Effectué une seule fois côté client.
let iconsPatched = false;
function patchLeafletIcons() {
  if (iconsPatched) return;
  iconsPatched = true;
  type IconDefault = L.Icon.Default & { _getIconUrl?: unknown };
  delete (L.Icon.Default.prototype as IconDefault)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export function LeafletMap({ lat, lng }: { lat: number; lng: number }) {
  useEffect(() => {
    patchLeafletIcons();
  }, []);

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} />
      </MapContainer>
    </div>
  );
}
