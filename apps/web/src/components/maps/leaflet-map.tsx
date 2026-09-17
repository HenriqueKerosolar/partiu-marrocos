"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMapInstance, Marker } from "leaflet";
import type { MapProviderProps } from "@/lib/maps/provider";

const STATUS_COLOR: Record<string, string> = {
  PLANEJADA: "#94a3b8",
  ATUAL: "#f59e0b",
  CONCLUIDA: "#22c55e",
  PULADA: "#cbd5e1",
};

/**
 * Implementação Leaflet (OpenStreetMap, sem chave de API — real, não mock)
 * de `MapProviderProps`. Client-only: Leaflet manipula o DOM diretamente e
 * não roda em SSR — sempre importar este componente com `next/dynamic` e
 * `ssr: false`.
 */
export function LeafletMap({ markers, stops, heightPx = 360, fallbackCenter }: MapProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const markerLayerRef = useRef<Marker[]>([]);

  useEffect(() => {
    let cancelado = false;

    import("leaflet").then((L) => {
      if (cancelado || !containerRef.current || mapRef.current) return;

      // Bug conhecido do Leaflet com bundlers: os ícones padrão apontam pra
      // um caminho relativo que o Webpack/Next não resolve — corrigido uma
      // vez aqui, nunca em cada marcador.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const centro = markers[0]
        ? ([markers[0].latitude, markers[0].longitude] as [number, number])
        : fallbackCenter
          ? ([fallbackCenter.latitude, fallbackCenter.longitude] as [number, number])
          : ([31.6295, -7.9811] as [number, number]); // Marrakech — só quando não há NENHUM dado real ainda

      const map = L.map(containerRef.current).setView(centro, markers.length > 0 ? 13 : 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    });

    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map) return;

      for (const m of markerLayerRef.current) m.remove();
      markerLayerRef.current = [];

      for (const parada of stops ?? []) {
        const cor = STATUS_COLOR[parada.status] ?? STATUS_COLOR.PLANEJADA!;
        const marker = L.circleMarker([parada.latitude, parada.longitude], { radius: 8, color: cor, fillColor: cor, fillOpacity: 0.8 })
          .bindPopup(`${parada.label} — ${parada.status}`)
          .addTo(map);
        markerLayerRef.current.push(marker as unknown as Marker);
      }

      for (const marcador of markers) {
        const marker = L.marker([marcador.latitude, marcador.longitude]).bindPopup(marcador.label).addTo(map);
        markerLayerRef.current.push(marker);
      }

      if (markers.length > 0 || (stops?.length ?? 0) > 0) {
        const todosPontos = [...markers.map((m) => [m.latitude, m.longitude] as [number, number]), ...(stops ?? []).map((s) => [s.latitude, s.longitude] as [number, number])];
        if (todosPontos.length > 1) map.fitBounds(todosPontos, { padding: [24, 24] });
      }
    });
  }, [markers, stops]);

  return <div ref={containerRef} style={{ height: heightPx, width: "100%", borderRadius: "0.5rem" }} />;
}
