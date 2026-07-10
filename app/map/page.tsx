'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useState } from 'react';

type SchoolMapRow = {
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: string | null;
};

export default function MapPage() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!el) return;

    const mapElement = el;
    let cancelled = false;
    let map: import('leaflet').Map | null = null;

    async function initializeMap() {
      const L = await import('leaflet');
      if (cancelled) return;

      map = L.map(mapElement).setView([43.6, -113.2], 7);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const response = await fetch('/api/schools-map');
      const rows = (await response.json()) as SchoolMapRow[];
      if (cancelled || !map) return;
      const activeMap = map;

      rows.forEach((school) => {
        if (school.latitude == null || school.longitude == null) return;

        L.marker([school.latitude, school.longitude])
          .addTo(activeMap)
          .bindPopup(
            `<b>${school.name}</b><br>${school.address ?? ''}<br>${school.phone ?? ''}<br>${school.verification_status ?? ''}`,
          );
      });
    }

    void initializeMap();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [el]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 text-2xl font-bold">School map</h1>
      <div ref={setEl} className="h-[600px]" />
    </main>
  );
}
