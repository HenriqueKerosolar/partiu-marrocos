import type { PrismaClient } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { derivarParadaAtualProxima } from "./trip-group";

/**
 * PM-CONV-05, Track C — Central de Operações. Composição de dado que já
 * existe (Trip/TripGroup/TravelerCheckIn de PM-CONV-03/04, TrackingSession
 * de PM-CONV-05 Track A) — nenhum model novo, nenhuma duplicação de fonte
 * de verdade. "Zero redesign" (§ do comando): esta é uma consulta de
 * leitura só, sem novo model/tabela.
 */

export interface AlertaOperacional {
  tipo: "SEM_RASTREAMENTO" | "CHECKIN_NAO_INICIADO" | "CAPACIDADE_LOTADA" | "RASTREAMENTO_DESATUALIZADO" | "OCORRENCIA_GRAVE";
  mensagem: string;
}

export interface OcorrenciaResumo {
  id: string;
  severidade: string;
  descricao: string;
  profissionalNome: string;
  createdAt: Date;
}

export interface ParadaResumo {
  tripActivityId: string;
  nome: string;
  local: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PainelGrupo {
  tripGroupId: string;
  grupoNome: string;
  tripId: string;
  roteiro: string | null;
  dataInicio: Date;
  dataFim: Date;
  timezone: string;
  statusViagem: string;
  veiculoNome: string;
  capacidade: number;
  crew: { nome: string; papel: string }[];
  totalPassageiros: number;
  checkinsRealizados: number;
  embarcados: number;
  noShow: number;
  rastreamentoAtivo: boolean;
  ultimaAtualizacaoRastreamento: Date | null;
  paradaAtual: ParadaResumo | null;
  proximaParada: ParadaResumo | null;
  ocorrenciasRecentes: OcorrenciaResumo[];
  alertas: AlertaOperacional[];
}

// Rastreamento é considerado "desatualizado" (não "parado" — a sessão
// continua ATIVA) quando o último ping é mais velho que isto. Só faz
// sentido junto de `rastreamentoAtivo`: sem sessão ativa, já existe o
// alerta SEM_RASTREAMENTO, que é o problema real ali.
const RASTREAMENTO_DESATUALIZADO_MIN = 10;

/** Painel operacional — só viagens CONFIRMADA/EM_ANDAMENTO (as que fazem sentido acompanhar ao vivo). */
export async function obterPainelOperacional(prisma: PrismaClient, tenantId: string): Promise<PainelGrupo[]> {
  const grupos = await withTenant(prisma, tenantId, (tx) =>
    tx.tripGroup.findMany({
      where: { tenantId, trip: { status: { in: ["CONFIRMADA", "EM_ANDAMENTO"] } } },
      include: {
        trip: { include: { itinerarioDias: { include: { atividades: true }, orderBy: { numeroDia: "asc" } } } },
        veiculo: true,
        profissionais: { include: { professional: true } },
        bookings: { include: { travelers: true } },
        checkins: true,
        trackingSessions: { where: { status: "ATIVA" }, include: { pings: { orderBy: { capturedAt: "desc" }, take: 1 } } },
        progresso: true,
        incidentes: { orderBy: { createdAt: "desc" }, take: 5, include: { professional: true } },
      },
      orderBy: { trip: { dataInicio: "asc" } },
    }),
  );

  return grupos.map((g) => {
    const totalPassageiros = g.bookings.reduce((soma, b) => soma + b.travelers.length, 0);
    const checkinsRealizados = g.checkins.filter((c) => c.status === "CHECKIN_REALIZADO" || c.status === "EMBARCADO").length;
    const embarcados = g.checkins.filter((c) => c.status === "EMBARCADO").length;
    const noShow = g.checkins.filter((c) => c.status === "NO_SHOW").length;
    const rastreamentoAtivo = g.trackingSessions.length > 0;
    const ultimaAtualizacaoRastreamento = g.trackingSessions
      .flatMap((s) => s.pings)
      .reduce<Date | null>((maisRecente, p) => (!maisRecente || p.capturedAt > maisRecente ? p.capturedAt : maisRecente), null);

    // Parada atual/próxima — sem fabricar ETA (§ do comando): só o que já
    // existe de verdade (`TripActivityProgress`, mesma fonte que o
    // check-in de campo escreve via `atualizarProgressoParada`). Mesma
    // derivação reaproveitada por `/minha-viagem` (`passageiro.ts`) — fonte
    // única, nunca duas lógicas calculando "parada atual" de formas
    // diferentes.
    const atividadesEmOrdem = g.trip.itinerarioDias.flatMap((d) => d.atividades);
    const paraResumo = (a: (typeof atividadesEmOrdem)[number]): ParadaResumo => ({ tripActivityId: a.id, nome: a.nome, local: a.local, latitude: a.latitude, longitude: a.longitude });
    const { atual: paradaAtualAtividade, proxima: proximaAtividade } = derivarParadaAtualProxima(atividadesEmOrdem, g.progresso);
    const paradaAtual = paradaAtualAtividade ? paraResumo(paradaAtualAtividade) : null;
    const proximaParada = proximaAtividade ? paraResumo(proximaAtividade) : null;

    const ocorrenciasRecentes: OcorrenciaResumo[] = g.incidentes.map((i) => ({
      id: i.id,
      severidade: i.severidade,
      descricao: i.descricao,
      profissionalNome: i.professional.nome,
      createdAt: i.createdAt,
    }));

    const alertas: AlertaOperacional[] = [];
    const horasParaPartida = (g.trip.dataInicio.getTime() - Date.now()) / (60 * 60 * 1000);
    if (g.trip.status === "EM_ANDAMENTO" && !rastreamentoAtivo) {
      alertas.push({ tipo: "SEM_RASTREAMENTO", mensagem: "Viagem em andamento sem nenhum rastreamento de localização ativo." });
    }
    if (rastreamentoAtivo && ultimaAtualizacaoRastreamento) {
      const minutosSemAtualizar = (Date.now() - ultimaAtualizacaoRastreamento.getTime()) / (60 * 1000);
      if (minutosSemAtualizar >= RASTREAMENTO_DESATUALIZADO_MIN) {
        alertas.push({ tipo: "RASTREAMENTO_DESATUALIZADO", mensagem: `Sessão de rastreamento ativa, mas sem nova posição há ${Math.round(minutosSemAtualizar)} min.` });
      }
    }
    if (horasParaPartida > 0 && horasParaPartida <= 24 && checkinsRealizados === 0 && totalPassageiros > 0) {
      alertas.push({ tipo: "CHECKIN_NAO_INICIADO", mensagem: "Partida em menos de 24h e nenhum check-in realizado ainda." });
    }
    if (totalPassageiros >= g.veiculo.capacidade && g.veiculo.capacidade > 0) {
      alertas.push({ tipo: "CAPACIDADE_LOTADA", mensagem: "Grupo no limite da capacidade do veículo." });
    }
    const ocorrenciaGrave = ocorrenciasRecentes.find((o) => o.severidade === "ALTA");
    if (ocorrenciaGrave) {
      alertas.push({ tipo: "OCORRENCIA_GRAVE", mensagem: `Ocorrência de severidade alta registrada por ${ocorrenciaGrave.profissionalNome}.` });
    }

    return {
      tripGroupId: g.id,
      grupoNome: g.nome,
      tripId: g.tripId,
      roteiro: g.trip.roteiro,
      dataInicio: g.trip.dataInicio,
      dataFim: g.trip.dataFim,
      timezone: g.trip.timezone,
      statusViagem: g.trip.status,
      veiculoNome: g.veiculo.nome,
      capacidade: g.veiculo.capacidade,
      crew: g.profissionais.map((p) => ({ nome: p.professional.nome, papel: p.papel })),
      totalPassageiros,
      checkinsRealizados,
      embarcados,
      noShow,
      rastreamentoAtivo,
      ultimaAtualizacaoRastreamento,
      paradaAtual,
      proximaParada,
      ocorrenciasRecentes,
      alertas,
    };
  });
}
