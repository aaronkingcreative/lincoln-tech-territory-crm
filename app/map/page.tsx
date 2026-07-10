'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import L from 'leaflet';
export default function MapPage(){ const [el,setEl]=useState<HTMLDivElement|null>(null); useEffect(()=>{ if(!el) return; const map=L.map(el).setView([43.6,-113.2],7); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(map); fetch('/api/schools-map').then(r=>r.json()).then(rows=>rows.forEach((s:any)=>{ if(s.latitude&&s.longitude)L.marker([s.latitude,s.longitude]).addTo(map).bindPopup(`<b>${s.name}</b><br>${s.address??''}<br>${s.phone??''}<br>${s.verification_status??''}`)})); return()=>map.remove();},[el]); return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-4 text-2xl font-bold">School map</h1><div ref={setEl}/></main> }
