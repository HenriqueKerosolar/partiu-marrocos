"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  listarMeusGruposAction,
  iniciarMeuTrackingAction,
  finalizarMeuTrackingAction,
  buscarMinhaSessaoAtivaAction,
  registrarPingAction,
} from "@/app/actions/geolocation";
import { registrarOcorrenciaAction, listarOcorrenciasDoGrupoAction } from "@/app/actions/ocorrencia";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Ocorrencia = { id: string; descricao: string; severidade: string; profissionalNome: string; createdAt: string };
type Severidade = "BAIXA" | "MEDIA" | "ALTA";

type Grupo = { id: string; nome: string; tripRoteiro: string | null };

/**
 * PM-CONV-05, Track A — controle de rastreamento do próprio profissional
 * (guia/motorista). Vive em `/checkin` por ora (já é a página do papel
 * "Operação"); o Track B (Mobile/PWA) constrói uma experiência mobile
 * dedicada reaproveitando estas mesmas server actions, não um motor novo.
 */
export function TrackingControl() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoSelecionado, setGrupoSelecionado] = useState("");
  const [sessaoAtiva, setSessaoAtiva] = useState<{ trackingSessionId: string; tripGroupId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimaPosicao, setUltimaPosicao] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const watchIdRef = useRef<number | null>(null);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState("");
  const [severidadeOcorrencia, setSeveridadeOcorrencia] = useState<Severidade>("MEDIA");

  useEffect(() => {
    buscarMinhaSessaoAtivaAction().then(setSessaoAtiva);
    listarMeusGruposAction().then(setGrupos);
  }, []);

  const grupoAtualId = sessaoAtiva?.tripGroupId || grupoSelecionado;

  useEffect(() => {
    if (!grupoAtualId) {
      setOcorrencias([]);
      return;
    }
    listarOcorrenciasDoGrupoAction(grupoAtualId).then(setOcorrencias);
  }, [grupoAtualId]);

  function registrarOcorrencia() {
    if (!grupoAtualId || !descricaoOcorrencia.trim()) return;
    startTransition(async () => {
      const r = await registrarOcorrenciaAction(grupoAtualId, descricaoOcorrencia.trim(), severidadeOcorrencia);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setDescricaoOcorrencia("");
      listarOcorrenciasDoGrupoAction(grupoAtualId).then(setOcorrencias);
    });
  }

  useEffect(() => {
    if (!sessaoAtiva || typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (posicao) => {
        registrarPingAction({
          trackingSessionId: sessaoAtiva.trackingSessionId,
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          accuracy: posicao.coords.accuracy,
          capturedAtIso: new Date(posicao.timestamp).toISOString(),
        }).then((r) => {
          if (r.error) setErro(r.error);
          else setUltimaPosicao(new Date().toLocaleTimeString("pt-BR"));
        });
      },
      (geoErro) => setErro(`Não foi possível obter sua localização: ${geoErro.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [sessaoAtiva]);

  function iniciar() {
    if (!grupoSelecionado) return;
    setErro(null);
    startTransition(async () => {
      const r = await iniciarMeuTrackingAction(grupoSelecionado);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setSessaoAtiva({ trackingSessionId: r.trackingSessionId!, tripGroupId: grupoSelecionado });
    });
  }

  function finalizar() {
    if (!sessaoAtiva) return;
    startTransition(async () => {
      const r = await finalizarMeuTrackingAction(sessaoAtiva.trackingSessionId);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setSessaoAtiva(null);
      setUltimaPosicao(null);
    });
  }

  if (grupos.length === 0 && !sessaoAtiva) return null; // sem grupo atribuído — não mostra o card à toa

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Meu rastreamento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        {sessaoAtiva ? (
          <>
            <p>Rastreamento ativo{ultimaPosicao ? ` — última posição enviada às ${ultimaPosicao}` : " — aguardando localização do dispositivo..."}</p>
            <Button size="sm" variant="outline" className="w-fit" disabled={pending} onClick={finalizar}>
              Finalizar rastreamento
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={grupoSelecionado}
                onChange={(e) => setGrupoSelecionado(e.target.value)}
              >
                <option value="" disabled>
                  Grupo operacional...
                </option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome} {g.tripRoteiro ? `— ${g.tripRoteiro}` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={pending || !grupoSelecionado} onClick={iniciar}>
                Iniciar rastreamento
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Seu navegador vai pedir permissão de localização quando você iniciar.</p>
          </>
        )}

        {grupoAtualId && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground">Ocorrências deste grupo</p>
            {ocorrencias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</p>}
            {ocorrencias.map((o) => (
              <div key={o.id} className="rounded-md border border-border p-2 text-xs">
                <p className="flex items-center gap-2">
                  <Badge variant={o.severidade === "ALTA" ? "destructive" : "muted"}>{o.severidade}</Badge>
                  <span className="text-muted-foreground">
                    {o.profissionalNome} · {new Date(o.createdAt).toLocaleString("pt-BR")}
                  </span>
                </p>
                <p>{o.descricao}</p>
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <textarea
                className="rounded-md border border-input bg-background p-2 text-xs"
                rows={2}
                placeholder="Descrever ocorrência (atraso, imprevisto, problema com fornecedor/veículo...)"
                value={descricaoOcorrencia}
                onChange={(e) => setDescricaoOcorrencia(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={severidadeOcorrencia} onChange={(e) => setSeveridadeOcorrencia(e.target.value as Severidade)}>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                </select>
                <Button size="sm" disabled={pending || !descricaoOcorrencia.trim()} onClick={registrarOcorrencia}>
                  Registrar ocorrência
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
