import { notFound, redirect } from "next/navigation";
import {
  prisma,
  withTenant,
  formatarMoeda,
  formatarDataHora,
  calcularScoreLead,
  sugerirProximaAcao,
  diasDesdeUltimaAtividade,
  listarPropostasDoLead,
  listarBookingsDoLead,
  listarTripsDisponiveisParaBooking,
  buscarTravelerCare,
  type ProximaAcao,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { MoverEtapaSelect } from "../mover-etapa";
import { PrioridadeToggle } from "./prioridade-toggle";
import { TaskConcluidaCheckbox } from "./task-checkbox";
import { AgendarRepescagemButton } from "./agendar-repescagem-button";
import { PropostaForm } from "./proposta-form";
import { PropostaCard } from "./proposta-card";
import { BookingCard } from "./booking-card";

export const dynamic = "force-dynamic";

const CAMPOS_PREFERENCIAS_LABEL: Record<string, string> = {
  datasDesejadas: "Datas desejadas",
  quantidadePassageiros: "Quantidade de passageiros",
  orcamentoInformado: "Orçamento informado",
  preferenciaRoteiro: "Preferência de roteiro",
  observacoes: "Observações",
};

const NBA_LABEL: Record<ProximaAcao, string> = {
  solicitar_informacao_faltante: "Solicitar informação faltante",
  agendar_retorno: "Agendar retorno",
  encaminhar_humano: "Encaminhar para humano",
  repescar_oportunidade: "Repescar oportunidade",
  preparar_proposta: "Preparar proposta",
  nenhuma_acao_necessaria: "Nenhuma ação necessária",
};

type TimelineItem = { data: Date; tipo: "NOTA" | "TAREFA" | "MENSAGEM"; titulo: string; detalhe?: string };

export default async function LeadDetalhePage({ params }: { params: { id: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "leads.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "leads.manage");

  const dados = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: params.id },
      include: {
        contact: true,
        stage: true,
        responsavel: true,
        notes: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "desc" } },
        attributionTouches: { orderBy: { capturedAt: "desc" } },
      },
    });
    if (!lead || lead.tenantId !== ctx.tenantId) return null;

    const pipeline = await tx.pipeline.findUniqueOrThrow({
      where: { id: lead.pipelineId },
      include: { stages: { orderBy: { ordem: "asc" } } },
    });

    const conversas = await tx.conversation.findMany({
      where: { tenantId: ctx.tenantId!, contactId: lead.contactId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 50 } },
    });

    return { lead, pipeline, conversas };
  });

  if (!dados) notFound();
  const { lead, pipeline, conversas } = dados;

  const podeVerPropostas = hasPermission(ctx, "propostas.view");
  const podeGerenciarPropostas = hasPermission(ctx, "propostas.manage");
  const propostas = podeVerPropostas ? await listarPropostasDoLead(prisma, ctx.tenantId!, lead.id) : [];

  const podeVerBookings = hasPermission(ctx, "bookings.view");
  const bookings = podeVerBookings ? await listarBookingsDoLead(prisma, ctx.tenantId!, lead.id) : [];
  const podeVerComissoes = hasPermission(ctx, "comissoes.view");
  const podeVerDocumentos = hasPermission(ctx, "documentos.view");
  const podeVerViagens = hasPermission(ctx, "trips.view");
  const podeGerenciarViagens = hasPermission(ctx, "trips.manage");
  const tripsDisponiveis = podeGerenciarViagens ? await listarTripsDisponiveisParaBooking(prisma, ctx.tenantId!) : [];
  const bookingPorProposta = new Map(bookings.map((b) => [b.proposalId, b]));

  // PM-CONV-03, §8 — TravelerCare NUNCA vem embutido em listarBookingsDoLead
  // (dado sensível/LGPD). Buscado à parte, só quando a permissão restrita
  // está presente, um traveler por vez (nunca em listagem ampla).
  const podeVerDadosSensiveis = hasPermission(ctx, "passageiros.dados_sensiveis.view");
  const todosTravelers = bookings.flatMap((b) => b.travelers);
  const carePorTraveler = podeVerDadosSensiveis
    ? new Map((await Promise.all(todosTravelers.map(async (t) => [t.id, await buscarTravelerCare(prisma, ctx.tenantId!, t.id)] as const))))
    : new Map<string, Awaited<ReturnType<typeof buscarTravelerCare>>>();

  const etapaOrdem = pipeline.stages.findIndex((s) => s.id === lead.stageId);
  const totalEtapas = pipeline.stages.length;
  const mensagens = conversas.flatMap((c) => c.messages);
  const ultimaConversa = conversas.reduce<(typeof conversas)[number] | null>((mais, c) => {
    if (!mais || (c.lastMessageAt?.getTime() ?? 0) > (mais.lastMessageAt?.getTime() ?? 0)) return c;
    return mais;
  }, null);

  const dias = diasDesdeUltimaAtividade([
    lead.notes[0]?.createdAt,
    lead.tasks[0]?.createdAt,
    ultimaConversa?.lastMessageAt,
    lead.createdAt,
  ]);
  const diasParaFatores = Number.isFinite(dias) ? dias : null;

  const preferencias = (lead.preferenciasCliente as Record<string, unknown> | null) ?? null;
  const score = calcularScoreLead({
    temEmail: !!lead.contact.email,
    temTelefone: !!lead.contact.telefone,
    preferenciasCliente: preferencias,
    etapaOrdem: etapaOrdem < 0 ? 0 : etapaOrdem,
    totalEtapas,
    diasDesdeUltimaAtividade: diasParaFatores,
    temAtribuicao: lead.attributionTouches.length > 0,
  });

  const temTarefaPendente = lead.tasks.some((t) => !t.concluida && t.tipo === "FOLLOWUP");
  const nba = sugerirProximaAcao({
    status: lead.status,
    etapaIsWon: lead.stage.isWon,
    etapaIsLost: lead.stage.isLost,
    conversaComIA: ultimaConversa?.aiEnabled ?? true,
    preferenciasCliente: preferencias,
    diasDesdeUltimaAtividade: diasParaFatores,
    temTarefaPendente,
  });

  const timeline: TimelineItem[] = [
    ...lead.notes.map((n): TimelineItem => ({ data: n.createdAt, tipo: "NOTA", titulo: n.tipo ? `Nota · ${n.tipo}` : "Nota", detalhe: n.conteudo })),
    ...lead.tasks.map((t): TimelineItem => ({ data: t.createdAt, tipo: "TAREFA", titulo: `Tarefa (${t.tipo}) ${t.concluida ? "concluída" : "pendente"}`, detalhe: t.titulo })),
    ...mensagens.map((m): TimelineItem => ({ data: m.createdAt, tipo: "MENSAGEM", titulo: m.direction === "ENTRADA" ? "Mensagem recebida" : `Mensagem enviada (${m.senderType})`, detalhe: m.conteudo })),
  ].sort((a, b) => b.data.getTime() - a.data.getTime());

  const ultimoTouch = lead.attributionTouches[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{lead.contact.nome} <HelpButton helpKey="leads.detail" /></h1>
            {lead.prioridade && <Badge variant="destructive">Prioridade</Badge>}
            <Badge variant={lead.status === "GANHO" ? "default" : lead.status === "PERDIDO" ? "muted" : "muted"}>{lead.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {[lead.contact.telefone, lead.contact.email].filter(Boolean).join(" · ") || "Sem contato registrado"}
          </p>
        </div>
        {podeGerenciar && <PrioridadeToggle leadId={lead.id} prioridade={lead.prioridade} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Funil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>{pipeline.nome}</p>
            {podeGerenciar ? (
              <MoverEtapaSelect leadId={lead.id} etapaAtualId={lead.stageId} etapas={pipeline.stages.map((s) => ({ id: s.id, nome: s.nome, isLost: s.isLost }))} />
            ) : (
              <p className="text-muted-foreground">{lead.stage.nome}</p>
            )}
            {lead.motivoPerda && <p className="text-xs text-destructive">Motivo de perda: {lead.motivoPerda}</p>}
            {lead.valor != null && <p className="text-muted-foreground">{formatarMoeda(lead.valor, lead.moeda ?? "BRL")}</p>}
            <p className="text-xs text-muted-foreground">Responsável: {lead.responsavel?.email ?? "não atribuído"}</p>
            <p className="text-xs text-muted-foreground">Origem: {lead.origem ?? "não informada"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Atribuição (T6)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {ultimoTouch ? (
              <>
                <p>{[ultimoTouch.source, ultimoTouch.medium].filter(Boolean).join(" · ") || "origem não rastreada"}</p>
                {ultimoTouch.campaign && <p className="text-muted-foreground">Campanha: {ultimoTouch.campaign}</p>}
                <p className="text-xs text-muted-foreground">{formatarDataHora(ultimoTouch.capturedAt)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhum touch de atribuição registrado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Preferências de viagem</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {preferencias && Object.keys(preferencias).length > 0 ? (
              Object.entries(preferencias).map(([k, v]) =>
                v ? (
                  <p key={k}>
                    <span className="text-muted-foreground">{CAMPOS_PREFERENCIAS_LABEL[k] ?? k}:</span> {String(v)}
                  </p>
                ) : null,
              )
            ) : (
              <p className="text-muted-foreground">Nenhuma preferência informada ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Lead score (fundação determinística)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-3xl font-semibold">{score.score}</p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {score.fatores.map((f) => (
                <li key={f.fator} className="flex justify-between gap-2">
                  <span>{f.motivo}</span>
                  <span className="shrink-0 font-medium text-foreground">
                    {f.pontos}/{f.peso}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Próxima ação sugerida (recomendação — não é execução automática)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-lg font-medium">{NBA_LABEL[nba.acao]}</p>
            <p className="text-muted-foreground">{nba.motivo}</p>
            {podeGerenciar && nba.acao === "repescar_oportunidade" && <AgendarRepescagemButton leadId={lead.id} />}
          </CardContent>
        </Card>
      </div>

      {podeVerPropostas && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Propostas comerciais</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {propostas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma proposta criada ainda.</p>}
            {propostas.map((p) => {
              const booking = bookingPorProposta.get(p.id);
              return (
                <div key={p.id} className="flex flex-col gap-2">
                  <PropostaCard
                    leadId={lead.id}
                    proposta={{ id: p.id, versao: p.versao, status: p.status, moeda: p.moeda, preco: p.preco, roteiro: p.roteiro, validade: p.validade.toISOString(), condicoes: p.condicoes }}
                    temBooking={!!booking}
                  />
                  {booking && (
                    <BookingCard
                      leadId={lead.id}
                      booking={{
                        id: booking.id,
                        status: booking.status,
                        moeda: booking.proposal.moeda,
                        preco: booking.proposal.preco,
                        travelers: booking.travelers.map((t) => {
                          const care = carePorTraveler.get(t.id);
                          return {
                            id: t.id,
                            nome: t.nome,
                            tipo: t.tipo,
                            documents: t.documents.map((d) => ({ id: d.id, status: d.status, requirementNome: d.requirement.nome, requirementObrigatorio: d.requirement.obrigatorio, motivoRejeicao: d.motivoRejeicao })),
                            care: care ? { dieta: care.dieta, condicoes: care.condicoes, medicamentos: care.medicamentos, frequencia: care.frequencia, consentimento: care.consentimento } : null,
                          };
                        }),
                        payments: booking.payments.map((p) => ({ id: p.id, status: p.status, valor: p.valor, moeda: p.moeda, vencimento: p.vencimento ? p.vencimento.toISOString() : null, gateId: p.gateId })),
                        commissions: booking.commissions.map((c) => ({ id: c.id, status: c.status, valor: c.valor, moeda: c.moeda, percentual: c.percentual, gateId: c.gateId })),
                        responsavelId: booking.responsavelId,
                        responsavelLabel: booking.responsavel?.email ?? null,
                        trip: booking.trip ? { id: booking.trip.id, roteiro: booking.trip.roteiro } : null,
                      }}
                      podeVerComissoes={podeVerComissoes}
                      podeVerDocumentos={podeVerDocumentos}
                      podeVerViagens={podeVerViagens}
                      tripsDisponiveis={tripsDisponiveis.map((t) => ({ id: t.id, roteiro: t.roteiro, dataInicio: t.dataInicio.toISOString() }))}
                      podeVerDadosSensiveis={podeVerDadosSensiveis}
                      podeGerenciarDadosSensiveis={hasPermission(ctx, "passageiros.dados_sensiveis.manage")}
                    />
                  )}
                </div>
              );
            })}
            {podeGerenciarPropostas && <PropostaForm leadId={lead.id} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Tarefas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {lead.tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>}
          {lead.tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              {podeGerenciar ? (
                <TaskConcluidaCheckbox taskId={t.id} concluida={t.concluida} />
              ) : (
                <span className={t.concluida ? "text-muted-foreground line-through" : ""}>●</span>
              )}
              <span className={t.concluida ? "text-muted-foreground line-through" : ""}>{t.titulo}</span>
              <Badge variant="muted">{t.tipo}</Badge>
              {t.vencimento && <span className="text-xs text-muted-foreground">até {formatarDataHora(t.vencimento)}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Histórico (notas, tarefas e mensagens)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {timeline.length === 0 && <p className="text-sm text-muted-foreground">Nenhum histórico ainda.</p>}
          {timeline.map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5 border-b border-border pb-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <Badge variant="muted">{item.tipo}</Badge>
                <span className="text-xs text-muted-foreground">{formatarDataHora(item.data)}</span>
              </div>
              <p className="font-medium">{item.titulo}</p>
              {item.detalhe && <p className="text-muted-foreground">{item.detalhe}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
