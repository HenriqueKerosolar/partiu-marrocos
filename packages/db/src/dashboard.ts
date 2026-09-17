import type { PrismaClient } from "@prisma/client";
import { withTenant } from "./tenant-db";

/**
 * PM-CONV-05, Track E — Dashboard Executivo. Só compõe dado que já existe
 * (Lead/Booking/Payment/Commission/Trip/TripGroup/TravelerCheckIn/
 * CostEvent) — nenhuma métrica inventada, nenhum KPI mostrado sem evento
 * real que o sustente (§ do comando: "não inventar KPI"; "IA/automação:
 * mostrar métricas somente quando houver eventos reais que as suportem").
 *
 * Valores financeiros NUNCA são somados entre moedas diferentes — cada
 * agrupamento (`PorMoeda`) é uma lista, uma linha por moeda realmente
 * usada. Margem só aparece para reservas cuja Proposal tem `custos`
 * preenchido — nunca assume custo zero pra uma reserva sem esse dado.
 */

export interface ValorPorMoeda {
  moeda: string;
  valor: number;
}

export interface DashboardExecutivo {
  funil: { etapa: string; ordem: number; leads: number; isWon: boolean; isLost: boolean }[];
  bookings: { total: number; passageiros: number };
  operacao: {
    viagensAtivas: number;
    ocupacaoPercentual: number | null; // null quando não há nenhum grupo com capacidade > 0 pra calcular
    checkinsRealizados: number;
    embarcados: number;
    noShow: number;
    veiculosAtivos: number;
    profissionaisAtivos: number;
  };
  financeiro: {
    recebido: ValorPorMoeda[];
    aReceber: ValorPorMoeda[];
    comissaoPaga: ValorPorMoeda[];
    margem: { amostras: number; porMoeda: ValorPorMoeda[] }; // amostras = quantas reservas tinham custos informados
  };
  automacao: {
    chamadasYallaMes: number;
    custoYallaMesUsd: number | null; // null quando não há nenhum CostEvent em USD no mês (nunca mostra 0 forçado se a moeda dos eventos for outra)
  };
}

function somarPorMoeda(itens: { moeda: string; valor: number }[]): ValorPorMoeda[] {
  const porMoeda = new Map<string, number>();
  for (const item of itens) porMoeda.set(item.moeda, (porMoeda.get(item.moeda) ?? 0) + item.valor);
  return [...porMoeda.entries()].map(([moeda, valor]) => ({ moeda, valor }));
}

export async function obterDashboardExecutivo(prisma: PrismaClient, tenantId: string): Promise<DashboardExecutivo> {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.findFirst({ where: { tenantId, isDefault: true }, include: { stages: { orderBy: { ordem: "asc" } } } });
    const funil = pipeline
      ? await Promise.all(
          pipeline.stages.map(async (stage) => ({
            etapa: stage.nome,
            ordem: stage.ordem,
            isWon: stage.isWon,
            isLost: stage.isLost,
            leads: await tx.lead.count({ where: { tenantId, pipelineId: pipeline.id, stageId: stage.id } }),
          })),
        )
      : [];

    const [totalBookings, bookings] = await Promise.all([
      tx.booking.count({ where: { tenantId } }),
      tx.booking.findMany({ where: { tenantId }, select: { id: true, travelers: { select: { id: true } } } }),
    ]);
    const totalPassageiros = bookings.reduce((soma, b) => soma + b.travelers.length, 0);

    const gruposAtivos = await tx.tripGroup.findMany({
      where: { tenantId, trip: { status: { in: ["CONFIRMADA", "EM_ANDAMENTO"] } } },
      include: { veiculo: true, bookings: { include: { travelers: true } }, checkins: true },
    });
    const capacidadeTotal = gruposAtivos.reduce((s, g) => s + g.veiculo.capacidade, 0);
    const ocupacaoTotal = gruposAtivos.reduce((s, g) => s + g.bookings.reduce((soma, b) => soma + b.travelers.length, 0), 0);
    const checkinsRealizados = gruposAtivos.reduce((s, g) => s + g.checkins.filter((c) => c.status === "CHECKIN_REALIZADO" || c.status === "EMBARCADO").length, 0);
    const embarcados = gruposAtivos.reduce((s, g) => s + g.checkins.filter((c) => c.status === "EMBARCADO").length, 0);
    const noShow = gruposAtivos.reduce((s, g) => s + g.checkins.filter((c) => c.status === "NO_SHOW").length, 0);

    const [viagensAtivas, veiculosAtivos, profissionaisAtivos] = await Promise.all([
      tx.trip.count({ where: { tenantId, status: { in: ["CONFIRMADA", "EM_ANDAMENTO"] } } }),
      tx.tourVehicle.count({ where: { tenantId, ativo: true } }),
      tx.professional.count({ where: { tenantId, ativo: true } }),
    ]);

    const [pagamentosRecebidos, pagamentosAReceber, comissoesPagas] = await Promise.all([
      tx.payment.findMany({ where: { tenantId, status: "PAGO" }, select: { valor: true, moeda: true } }),
      tx.payment.findMany({ where: { tenantId, status: { in: ["PENDENTE", "PROCESSANDO", "PARCIALMENTE_PAGO"] } }, select: { valor: true, moeda: true } }),
      tx.commission.findMany({ where: { tenantId, status: "PAGA" }, select: { valor: true, moeda: true } }),
    ]);

    const bookingsComCusto = await tx.booking.findMany({
      where: { tenantId, proposal: { custos: { not: null } } },
      select: { proposal: { select: { preco: true, custos: true, moeda: true } } },
    });
    const margens = bookingsComCusto.map((b) => ({ moeda: b.proposal.moeda, valor: b.proposal.preco - (b.proposal.custos ?? 0) }));

    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const eventosYallaMes = await tx.costEvent.findMany({ where: { tenantId, agent: "yalla", createdAt: { gte: inicioMes } }, select: { custoTotal: true, moeda: true } });
    const custosUsd = eventosYallaMes.filter((e) => e.moeda === "USD" && e.custoTotal !== null).map((e) => Number(e.custoTotal));

    return {
      funil,
      bookings: { total: totalBookings, passageiros: totalPassageiros },
      operacao: {
        viagensAtivas,
        ocupacaoPercentual: capacidadeTotal > 0 ? Math.round((ocupacaoTotal / capacidadeTotal) * 1000) / 10 : null,
        checkinsRealizados,
        embarcados,
        noShow,
        veiculosAtivos,
        profissionaisAtivos,
      },
      financeiro: {
        recebido: somarPorMoeda(pagamentosRecebidos),
        aReceber: somarPorMoeda(pagamentosAReceber),
        comissaoPaga: somarPorMoeda(comissoesPagas),
        margem: { amostras: margens.length, porMoeda: somarPorMoeda(margens) },
      },
      automacao: {
        chamadasYallaMes: eventosYallaMes.length,
        custoYallaMesUsd: custosUsd.length > 0 ? custosUsd.reduce((s, v) => s + v, 0) : null,
      },
    };
  });
}
