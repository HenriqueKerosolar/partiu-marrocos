import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma, buscarTrip, listarItinerario, listarChecklist, listarGruposDaTrip, listarVeiculosDisponiveisParaGrupo, listarProfessionals, formatarDataHora, formatarMoeda } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { TripStatusControls } from "./status-controls";
import { ItinerarioSection } from "./itinerario-section";
import { ChecklistSection } from "./checklist-section";
import { GruposSection } from "./grupos-section";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PLANEJAMENTO: "Planejamento",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export default async function ViagemDetalhePage({ params }: { params: { id: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "trips.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "trips.manage");

  const trip = await buscarTrip(prisma, ctx.tenantId!, params.id);
  if (!trip) notFound();

  const podeVerGrupos = hasPermission(ctx, "grupos_operacionais.view");
  const podeGerenciarGrupos = hasPermission(ctx, "grupos_operacionais.manage");

  const [itinerario, checklist, grupos, veiculosDisponiveis, profissionaisDisponiveis] = await Promise.all([
    listarItinerario(prisma, ctx.tenantId!, trip.id),
    listarChecklist(prisma, ctx.tenantId!, trip.id),
    podeVerGrupos ? listarGruposDaTrip(prisma, ctx.tenantId!, trip.id) : Promise.resolve([]),
    podeGerenciarGrupos ? listarVeiculosDisponiveisParaGrupo(prisma, ctx.tenantId!) : Promise.resolve([]),
    podeGerenciarGrupos ? listarProfessionals(prisma, ctx.tenantId!, { somenteAtivos: true }) : Promise.resolve([]),
  ]);

  const atividadesFlat = itinerario.flatMap((d) => d.atividades.map((a) => ({ id: a.id, nome: a.nome, diaTitulo: d.titulo ?? `Dia ${d.numeroDia}` })));
  const bookingsSemGrupo = trip.bookings.filter((b) => !b.tripGroupId).map((b) => ({ id: b.id, leadId: b.leadId, travelerCount: b.travelers.length }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{trip.roteiro ?? "Viagem sem roteiro definido"} <HelpButton helpKey="viagens.detail" /></h1>
        <p className="text-sm text-muted-foreground">
          {/* PM-CONV-09 — achado real: trip.timezone já existia e era mostrado como texto solto ao lado da data, mas a data em si era formatada no fuso padrão (BR), não no fuso real da operação — corrigido passando o timezone explícito pro formatador. */}
          {formatarDataHora(trip.dataInicio, undefined, { dateStyle: "short", timeZone: trip.timezone })} – {formatarDataHora(trip.dataFim, undefined, { dateStyle: "short", timeZone: trip.timezone })} · {trip.timezone}
          {trip.mercado && ` · Mercado: ${trip.mercado}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Badge>{STATUS_LABEL[trip.status]}</Badge>
          {podeGerenciar && <TripStatusControls tripId={trip.id} statusAtual={trip.status} />}
          {trip.responsavelOperacional && <p className="text-xs text-muted-foreground">Responsável operacional: {trip.responsavelOperacional.email}</p>}
          {trip.observacoes && <p className="text-sm">{trip.observacoes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Reservas vinculadas ({trip.bookings.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {trip.bookings.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma reserva vinculada ainda — vincule pela página do lead.</p>}
          {trip.bookings.map((b) => (
            <Link key={b.id} href={`/leads/${b.leadId}`} className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-muted/50">
              <span>{b.travelers.length} passageiro(s)</span>
              <span className="text-muted-foreground">{formatarMoeda(b.proposal.preco, b.proposal.moeda)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <ItinerarioSection tripId={trip.id} itinerario={itinerario.map((d) => ({
        id: d.id,
        numeroDia: d.numeroDia,
        data: d.data.toISOString(),
        titulo: d.titulo,
        atividades: d.atividades.map((a) => ({ id: a.id, nome: a.nome, local: a.local, horaInicio: a.horaInicio, visivelParaViajante: a.visivelParaViajante })),
      }))} podeGerenciar={podeGerenciar} />

      <ChecklistSection tripId={trip.id} itens={checklist.map((c) => ({ id: c.id, categoria: c.categoria, titulo: c.titulo, concluido: c.concluido }))} podeGerenciar={podeGerenciar} />

      {podeVerGrupos && (
        <GruposSection
          tripId={trip.id}
          grupos={grupos.map((g) => ({
            id: g.id,
            nome: g.nome,
            veiculo: { id: g.veiculo.id, nome: g.veiculo.nome, capacidade: g.veiculo.capacidade },
            profissionais: g.profissionais.map((p) => ({ professionalId: p.professionalId, papel: p.papel, professional: { nome: p.professional.nome } })),
            bookings: g.bookings.map((b) => ({
              id: b.id,
              leadId: b.leadId,
              travelerCount: b.travelers.length,
              travelers: b.travelers.map((t) => ({ id: t.id, nome: t.nome })),
            })),
            progresso: g.progresso.map((p) => ({ tripActivityId: p.tripActivityId, status: p.status })),
          }))}
          veiculosDisponiveis={veiculosDisponiveis.map((v) => ({ id: v.id, nome: v.nome, capacidade: v.capacidade }))}
          profissionaisDisponiveis={profissionaisDisponiveis.map((p) => ({ id: p.id, nome: p.nome }))}
          bookingsSemGrupo={bookingsSemGrupo}
          atividades={atividadesFlat}
          podeGerenciar={podeGerenciarGrupos}
          podeEmitirCredencial={hasPermission(ctx, "checkin.execute")}
          podeVerMapa={hasPermission(ctx, "gps.view")}
        />
      )}
    </div>
  );
}
