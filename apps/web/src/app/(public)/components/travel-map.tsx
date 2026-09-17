"use client";

import { useEffect, useRef, useState } from "react";

// Porte de travel-map.js (mapa SVG do roteiro, projeção de Mercator simplificada
// sobre assets/geo.json + assets/roads.json do site original).
const cityCoordinates: Record<string, [number, number]> = {
  Marrakech: [-7.9811, 31.6295],
  Dades: [-5.984, 31.453],
  Merzouga: [-4.012, 31.099],
  Fez: [-5.0033, 34.0331],
  Chefchaouen: [-5.2636, 35.1688],
  Casablanca: [-7.5898, 33.5731],
  "Aït Benhaddou": [-7.129, 31.047],
  Ouarzazate: [-6.906, 30.92],
  Ifrane: [-5.11, 33.53],
};

type GeoFeature = { geometry: { type: string; coordinates: unknown } };
type Geo = { countries: GeoFeature[]; regions: GeoFeature[]; rivers: GeoFeature[] };
type Roads = { legs: [number, number][][] };

let cache: Promise<[Geo, Roads]> | null = null;
function load() {
  if (!cache) {
    cache = Promise.all([
      fetch("/data/geo.json").then((r) => r.json()),
      fetch("/data/roads.json").then((r) => r.json()),
    ]) as Promise<[Geo, Roads]>;
  }
  return cache;
}

function mercator([lon, lat]: [number, number]): [number, number] {
  return [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360))];
}

function geometryPath(g: { type: string; coordinates: unknown }, project: (c: [number, number]) => [number, number]) {
  const line = (coords: [number, number][]) =>
    coords.map((p, i) => {
      const [x, y] = project(p);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  if (g.type === "Polygon") return (g.coordinates as [number, number][][]).map((r) => line(r) + "Z").join(" ");
  if (g.type === "MultiPolygon") return (g.coordinates as [number, number][][][]).map((p) => p.map((r) => line(r) + "Z").join(" ")).join(" ");
  if (g.type === "MultiLineString") return (g.coordinates as [number, number][][]).map(line).join(" ");
  if (g.type === "LineString") return line(g.coordinates as [number, number][]);
  return "";
}

export function TravelMap({ cities }: { cities: string[] }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setZoom(1);
    load()
      .then(([geo, roads]) => {
        if (cancelled) return;
        const coordinates = [...new Set(cities)]
          .map((name) => ({ name, coords: cityCoordinates[name] }))
          .filter((x): x is { name: string; coords: [number, number] } => Boolean(x.coords));
        const all = coordinates.map((x) => x.coords);
        if (!all.length) {
          setSvg(null);
          return;
        }
        const box = all.map(mercator);
        const xs = box.map((p) => p[0]);
        const ys = box.map((p) => p[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const spanX = Math.max(0.015, Math.max(...xs) - minX);
        const spanY = Math.max(0.015, Math.max(...ys) - minY);
        const width = 900;
        const height = 590;
        const scale = Math.min(720 / spanX, 410 / spanY);
        const offsetX = (width - spanX * scale) / 2;
        const offsetY = (height - spanY * scale) / 2;
        const project = (coords: [number, number]): [number, number] => {
          const [x, y] = mercator(coords);
          return [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY];
        };
        const line = (coords: [number, number][]) =>
          coords.map((p, i) => {
            const [x, y] = project(p);
            return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");
        const standard = cities.every((c) => cityCoordinates[c]);
        const long = cities.includes("Fez");
        const planned = standard ? (long ? roads.legs : roads.legs.slice(0, 4)).map(line).join(" ") : line(all);

        const markup = `
          <rect width="900" height="590" fill="#071725"/>
          <rect x="-4000" y="-4000" width="9000" height="9000" fill="url(#map-texture)"/>
          ${geo.countries.map((f) => `<path d="${geometryPath(f.geometry, project)}" fill="#14283b" stroke="#32414c" stroke-width="1"/>`).join("")}
          ${geo.regions.map((f) => `<path d="${geometryPath(f.geometry, project)}" fill="none" stroke="#344453" stroke-width=".55"/>`).join("")}
          ${geo.rivers.map((f) => `<path d="${geometryPath(f.geometry, project)}" fill="none" stroke="#286070" opacity=".5" stroke-width="1"/>`).join("")}
          <path d="${planned}" class="planned-road"/>
          ${coordinates.map(({ name, coords }) => {
            const [x, y] = project(coords);
            return `<g><circle cx="${x}" cy="${y}" r="5" fill="#edbd6a"/><text x="${x + 12}" y="${y - 12}" class="city-label">${name}</text></g>`;
          }).join("")}
        `;
        setSvg(markup);
      })
      .catch(() => setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [cities]);

  return (
    <div className="map-panel" ref={wrapRef}>
      <div className="map-toolbar">
        <span>Seu caminho pelo Marrocos</span>
        <div>
          <button type="button" onClick={() => setZoom((z) => Math.min(5, z * 1.35))} aria-label="Ampliar">+</button>
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.35))} aria-label="Reduzir">−</button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Enquadrar percurso">↺</button>
        </div>
      </div>
      {svg ? (
        <svg className="atlas-map" viewBox="0 0 900 590" role="img" aria-label="Mapa do roteiro">
          <defs>
            <pattern id="map-texture" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".7" fill="#294055" />
            </pattern>
            <clipPath id="map-clip">
              <rect width="900" height="590" rx="12" />
            </clipPath>
          </defs>
          <g clipPath="url(#map-clip)">
            <g transform={`translate(450 295) scale(${zoom}) translate(-450 -295)`} dangerouslySetInnerHTML={{ __html: svg }} />
          </g>
          <text x="30" y="555" className="ocean-label">ATLÂNTICO</text>
        </svg>
      ) : (
        <div style={{ minHeight: 310, display: "grid", placeItems: "center", color: "#8697a9", fontSize: 12 }}>Carregando mapa…</div>
      )}
      <div className="map-legend">
        <span className="planned">Planejado</span>
      </div>
      <small className="map-credit">© OpenStreetMap contributors · Natural Earth · geoBoundaries</small>
    </div>
  );
}
