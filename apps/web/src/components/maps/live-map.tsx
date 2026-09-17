"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MapMarker, MapStop } from "@/lib/maps/provider";
import { obterPosicoesAtivasAction } from "@/app/actions/geolocation";

const LeafletMap = dynamic(() => import("./leaflet-map").then((m) => m.LeafletMap), { ssr: false });

const INTERVALO_POLLING_MS = 8000;
const INTERVALO_BACKOFF_MAX_MS = 60_000; // depois de falhas seguidas, nunca martela o banco a cada 8s indefinidamente

/**
 * Mapa ao vivo de um grupo operacional — busca posições via polling
 * controlado (não WebSocket/SSE, decisão deliberada: funções serverless da
 * Vercel não seguram bem conexão de longa duração; polling a cada 8s é
 * simples, robusto e explicitamente permitido pelo comando).
 *
 * PM-CONV-06 §7C/§7E — revisão específica do polling sob restrição de
 * Vercel (nunca WebSocket "pra ficar bonito"; a decisão de polling
 * continua): três gaps reais fechados aqui, nenhum deles hipotético —
 * (1) sem pausa em aba oculta, uma central de operações aberta em segundo
 * plano continuava gerando invocação serverless + query a cada 8s pra
 * sempre — custo real e desnecessário no Vercel; (2) sem proteção contra
 * sobreposição, uma resposta lenta (carga real no banco) podia terminar
 * DEPOIS de uma requisição mais nova já em voo, sobrescrevendo posição
 * fresca com dado velho fora de ordem; (3) sem backoff, uma falha
 * transitória (rede, cold start) continuava tentando a cada 8s sem nunca
 * dar uma folga real pro banco sob instabilidade prolongada.
 */
export function LiveMap({ tripGroupId, stops }: { tripGroupId: string; stops?: MapStop[] }) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let emVoo = false; // nunca duas requisições simultâneas pro mesmo componente
    let sequencia = 0; // descarta resposta atrasada de uma requisição já superada por outra mais nova
    let falhasSeguidas = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function buscar() {
      if (emVoo || document.visibilityState !== "visible") return;
      emVoo = true;
      const minhaSequencia = ++sequencia;
      try {
        const posicoes = await obterPosicoesAtivasAction(tripGroupId);
        if (cancelado || minhaSequencia !== sequencia) return;
        setMarkers(
          posicoes.map((p) => ({
            id: p.trackingSessionId,
            label: p.professionalNome,
            latitude: p.latitude,
            longitude: p.longitude,
            capturedAt: new Date(p.capturedAt).toISOString(),
          })),
        );
        setCarregando(false);
        setErro(false);
        falhasSeguidas = 0;
      } catch {
        if (cancelado || minhaSequencia !== sequencia) return;
        falhasSeguidas++;
        setErro(true);
      } finally {
        emVoo = false;
      }
    }

    function agendarProxima() {
      if (cancelado) return;
      // backoff exponencial só quando há falha real — caso normal continua nos 8s fixos já validados
      const atraso = falhasSeguidas === 0 ? INTERVALO_POLLING_MS : Math.min(INTERVALO_POLLING_MS * 2 ** falhasSeguidas, INTERVALO_BACKOFF_MAX_MS);
      timeoutId = setTimeout(async () => {
        await buscar();
        agendarProxima();
      }, atraso);
    }

    function aoMudarVisibilidade() {
      // volta visível: busca na hora (não espera o próximo tick) — evita mostrar posição velha por até 8s depois de reabrir a aba
      if (document.visibilityState === "visible") buscar();
    }

    buscar();
    agendarProxima();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [tripGroupId]);

  return (
    <div className="flex flex-col gap-2">
      <LeafletMap markers={markers} stops={stops} heightPx={320} />
      <p className="text-xs text-muted-foreground">
        {erro
          ? "Não foi possível atualizar as posições agora — tentando novamente."
          : carregando
            ? "Carregando posições..."
            : markers.length === 0
              ? "Nenhum rastreamento ativo no momento."
              : `${markers.length} rastreamento(s) ativo(s) — atualiza a cada 8s.`}
      </p>
    </div>
  );
}
