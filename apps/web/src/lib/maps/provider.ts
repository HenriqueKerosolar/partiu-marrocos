/**
 * PM-CONV-05, Track A — abstração de provider de mapa. Qualquer componente
 * de mapa do app implementa este contrato; hoje só existe a implementação
 * Leaflet (`@/components/maps/leaflet-map`, OpenStreetMap, sem chave de
 * API). Trocar de provider (Mapbox/Google) no futuro significa escrever um
 * novo componente com esta MESMA interface — nunca espalhar chamada
 * direta a uma lib de mapa pelo resto do app.
 */
export interface MapMarker {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  /** Momento da última posição conhecida — usado pra colorir/avisar posição desatualizada. */
  capturedAt?: string;
}

export interface MapStop {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  status: "PLANEJADA" | "ATUAL" | "CONCLUIDA" | "PULADA";
}

export interface MapProviderProps {
  markers: MapMarker[];
  stops?: MapStop[];
  heightPx?: number;
  /** Centro/zoom iniciais quando não há marcador nenhum ainda (nunca mostra mapa vazio no meio do oceano). */
  fallbackCenter?: { latitude: number; longitude: number };
}
