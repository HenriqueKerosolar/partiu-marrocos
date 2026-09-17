import { redirect } from "next/navigation";
import { prisma, obterPainelOperacional, formatarDataHora } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { LiveMap } from "@/components/maps/live-map";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { CONFIRMADA: "Confirmada", EM_ANDAMENTO: "Em andamento" };
const ALERTA_LABEL: Record<string, string> = {
  SEM_RASTREAMENTO: "Sem rastreamento",
  CHECKIN_NAO_INICIADO: "Check-in não iniciado",
  CAPACIDADE_LOTADA: "Capacidade lotada",
  RASTREAMENTO_DESATUALIZADO: "Rastreamento desatualizado",
  OCORRENCIA_GRAVE: "Ocorrência grave",
};
const SEVERIDADE_LABEL: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta" };

export default async function CentralOperacoesPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "operacoes.view")) redirect("/dashboard");
  const podeVerMapa = hasPermission(ctx, "gps.view");
  const podeVerOcorrencias = hasPermission(ctx, "ocorrencias.view");

  const painel = await obterPainelOperacional(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Central de Operações <HelpButton helpKey="operacoes.overview" /></h1>
        <p className="text-sm text-muted-foreground">Viagens confirmadas ou em andamento — crew, veículo, check-in/embarque, mapa ao vivo e alertas. Somente leitura: a gestão de cada grupo continua na página da viagem.</p>
      </div>

      {painel.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Nenhuma viagem confirmada ou em andamento no momento.</CardContent>
        </Card>
      )}

      {painel.map((item) => (
        <Card key={item.tripGroupId}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <a href={`/viagens/${item.tripId}`} className="font-medium text-foreground hover:underline">
                  {item.roteiro ?? "Viagem sem roteiro definido"}
                </a>{" "}
                <Badge variant={item.statusViagem === "EM_ANDAMENTO" ? "default" : "muted"}>{STATUS_LABEL[item.statusViagem] ?? item.statusViagem}</Badge>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {formatarDataHora(item.dataInicio, undefined, { dateStyle: "short", timeZone: item.timezone })} – {formatarDataHora(item.dataFim, undefined, { dateStyle: "short", timeZone: item.timezone })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {item.alertas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.alertas.map((a) => (
                  <Badge key={a.tipo} variant="destructive" title={a.mensagem}>
                    {ALERTA_LABEL[a.tipo] ?? a.tipo}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Grupo / Veículo</p>
                <p>
                  {item.grupoNome} — {item.veiculoNome}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Crew</p>
                <p>{item.crew.length === 0 ? "—" : item.crew.map((c) => `${c.nome} (${c.papel === "GUIA" ? "Guia" : "Motorista"})`).join(", ")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Passageiros</p>
                <p>
                  {item.totalPassageiros}/{item.capacidade} · check-in {item.checkinsRealizados} · embarcados {item.embarcados}
                  {item.noShow > 0 ? ` · no-show ${item.noShow}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rastreamento</p>
                <Badge variant={item.rastreamentoAtivo ? "default" : "muted"}>{item.rastreamentoAtivo ? "Ativo" : "Inativo"}</Badge>
                {item.rastreamentoAtivo && item.ultimaAtualizacaoRastreamento && (
                  <p className="mt-1 text-xs text-muted-foreground">Última posição: {formatarDataHora(item.ultimaAtualizacaoRastreamento, undefined, { timeStyle: "short" })}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Parada atual / próxima</p>
                <p>{item.paradaAtual ? item.paradaAtual.nome : "—"}</p>
                {item.proximaParada && <p className="text-xs text-muted-foreground">Próxima: {item.proximaParada.nome}</p>}
              </div>
            </div>

            {podeVerMapa && (
              <LiveMap
                tripGroupId={item.tripGroupId}
                stops={[
                  item.paradaAtual && item.paradaAtual.latitude != null && item.paradaAtual.longitude != null
                    ? { id: item.paradaAtual.tripActivityId, label: item.paradaAtual.nome, latitude: item.paradaAtual.latitude, longitude: item.paradaAtual.longitude, status: "ATUAL" as const }
                    : null,
                  item.proximaParada && item.proximaParada.latitude != null && item.proximaParada.longitude != null
                    ? { id: item.proximaParada.tripActivityId, label: item.proximaParada.nome, latitude: item.proximaParada.latitude, longitude: item.proximaParada.longitude, status: "PLANEJADA" as const }
                    : null,
                ].filter((s): s is NonNullable<typeof s> => !!s)}
              />
            )}

            {podeVerOcorrencias && item.ocorrenciasRecentes.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">Ocorrências recentes</p>
                {item.ocorrenciasRecentes.map((o) => (
                  <p key={o.id} className="text-xs">
                    <Badge variant={o.severidade === "ALTA" ? "destructive" : "muted"}>{SEVERIDADE_LABEL[o.severidade] ?? o.severidade}</Badge>{" "}
                    {o.descricao} — <span className="text-muted-foreground">{o.profissionalNome}, {formatarDataHora(o.createdAt, undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
