import type { PrismaClient, Booking, Traveler, TravelerTipo, BookingStatus, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";
import { sincronizarRequisitosDoTraveler } from "./travel-documents";

/**
 * Booking Foundation 01 (PM-NIGHT-RUN-02, Etapa 1) — transforma uma
 * Proposal ACEITA numa reserva/operação comercial real.
 *
 * Deliberadamente NÃO duplica roteiro/preço/moeda/datas/passageiros/
 * condições da Proposal — a proposta ACEITA já é o snapshot imutável
 * dessas informações (nunca é reescrita depois de ENVIADA, ver Proposal
 * Foundation 01); ler esses dados é sempre `booking.proposal.*`. A
 * idempotência de "uma Proposal só gera um Booking" é estrutural
 * (`@@unique([tenantId, proposalId])` no schema), não apenas de aplicação.
 */

// ---------------------------------------------------------------------------
// Máquina de estados — mesmo padrão de `transicaoValida` em gates.ts:
// tabela pura, testável sem banco, usada como defesa em profundidade antes
// de qualquer UPDATE condicional.
// ---------------------------------------------------------------------------

const TRANSICOES_VALIDAS: Record<BookingStatus, BookingStatus[]> = {
  AGUARDANDO_PAGAMENTO: ["PAGAMENTO_PARCIAL", "PAGO", "CANCELADA"],
  PAGAMENTO_PARCIAL: ["PAGO", "CANCELADA"],
  PAGO: ["AGUARDANDO_DOCUMENTOS", "CONFIRMADA", "CANCELADA"],
  AGUARDANDO_DOCUMENTOS: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EM_OPERACAO", "CANCELADA"],
  EM_OPERACAO: ["CONCLUIDA"], // viagem em andamento não cancela sozinha — caso excepcional é decisão operacional fora desta fundação
  CONCLUIDA: [],
  CANCELADA: [],
};

export function transicaoValidaBooking(de: BookingStatus, para: BookingStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

// ---------------------------------------------------------------------------
// Proposal ACEITA → Booking
// ---------------------------------------------------------------------------

export interface CriarBookingDaPropostaParams {
  tenantId: string;
  propostaId: string;
  responsavelId?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type CriarBookingResultado =
  | { ok: true; booking: Booking; criado: boolean } // criado=false quando já existia (idempotência)
  | { ok: false; motivo: "PROPOSTA_NAO_ENCONTRADA" | "PROPOSTA_NAO_ACEITA" };

export async function criarBookingDaProposta(prisma: PrismaClient, params: CriarBookingDaPropostaParams): Promise<CriarBookingResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const proposta = await tx.proposal.findUnique({ where: { id: params.propostaId } });
    if (!proposta) return { ok: false, motivo: "PROPOSTA_NAO_ENCONTRADA" };

    const existente = await tx.booking.findUnique({ where: { tenantId_proposalId: { tenantId: params.tenantId, proposalId: proposta.id } } });
    if (existente) return { ok: true, booking: existente, criado: false };

    if (proposta.status !== "ACEITA") return { ok: false, motivo: "PROPOSTA_NAO_ACEITA" };

    const booking = await tx.booking.create({
      data: {
        tenantId: params.tenantId,
        proposalId: proposta.id,
        leadId: proposta.leadId,
        responsavelId: params.responsavelId ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_CRIADO",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { propostaId: proposta.id, propostaVersao: proposta.versao },
    });
    return { ok: true, booking, criado: true };
  });
}

// ---------------------------------------------------------------------------
// Transição de status
// ---------------------------------------------------------------------------

export interface MoverBookingStatusParams {
  tenantId: string;
  bookingId: string;
  novoStatus: BookingStatus;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
  observacoes?: string | null;
}

export type MoverBookingStatusResultado =
  | { ok: true; booking: Booking }
  | { ok: false; motivo: "NAO_ENCONTRADO" | "TRANSICAO_INVALIDA" };

export async function moverBookingStatus(prisma: PrismaClient, params: MoverBookingStatusParams): Promise<MoverBookingStatusResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (!transicaoValidaBooking(atual.status, params.novoStatus)) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const booking = await tx.booking.update({
      where: { id: atual.id },
      data: { status: params.novoStatus, ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}) },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "BOOKING_STATUS_ALTERADO",
      entidade: "Booking",
      entidadeId: booking.id,
      resultado: "ok",
      detalhe: { de: atual.status, para: params.novoStatus },
    });
    return { ok: true, booking };
  });
}

// ---------------------------------------------------------------------------
// Travelers — privacy-by-design (§8/§29 do comando): nenhum documento
// sensível/imagem aqui, isso é Travel Document Foundation (Etapa 4).
// ---------------------------------------------------------------------------

export interface AdicionarTravelerParams {
  tenantId: string;
  bookingId: string;
  nome: string;
  tipo?: TravelerTipo;
  dataNascimento?: Date | null;
  nacionalidade?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export async function adicionarTraveler(prisma: PrismaClient, params: AdicionarTravelerParams): Promise<{ ok: true; traveler: Traveler } | { ok: false; motivo: "BOOKING_NAO_ENCONTRADO" }> {
  const resultado = await withTenant(prisma, params.tenantId, async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) return { ok: false as const, motivo: "BOOKING_NAO_ENCONTRADO" as const };

    const traveler = await tx.traveler.create({
      data: {
        tenantId: params.tenantId,
        bookingId: booking.id,
        nome: params.nome,
        tipo: params.tipo ?? "ADULTO",
        dataNascimento: params.dataNascimento ?? null,
        nacionalidade: params.nacionalidade ?? null,
        telefone: params.telefone ?? null,
        email: params.email ?? null,
      },
    });
    return { ok: true as const, traveler };
  });

  // Instancia automaticamente uma linha PENDENTE por requisito ativo do
  // tenant (Travel Document Foundation 01) — melhor esforço, fora da
  // transação acima; a função é idempotente e pode ser chamada de novo
  // (ex.: por uma ação "sincronizar requisitos" na UI) sem duplicar nada.
  if (resultado.ok) await sincronizarRequisitosDoTraveler(prisma, { tenantId: params.tenantId, travelerId: resultado.traveler.id });
  return resultado;
}

// PM-CONV-03, §5/§6/§7 — ampliação de Traveler (passaporte/voo/guardião/
// contato de emergência), separada da criação simples original (o form de
// "adicionar passageiro" continua enxuto; estes campos são preenchidos
// depois, quando exigidos — ex. antes do pagamento/embarque, decisão de
// uma etapa futura). Auditado porque inclui dado documental sensível
// (§6: "RBAC, Audit, tenant isolation, privacidade").
export interface EditarTravelerParams {
  tenantId: string;
  travelerId: string;
  nacionalidade?: string | null;
  telefone?: string | null;
  email?: string | null;
  passaporteTipo?: string | null;
  passaporteNumero?: string | null;
  passaportePaisEmissor?: string | null;
  passaporteEmitidoEm?: Date | null;
  passaporteValidoAte?: Date | null;
  vooChegadaCompanhia?: string | null;
  vooChegadaNumero?: string | null;
  vooChegadaAeroporto?: string | null;
  vooChegadaEm?: Date | null;
  vooPartidaCompanhia?: string | null;
  vooPartidaNumero?: string | null;
  vooPartidaAeroporto?: string | null;
  vooPartidaEm?: Date | null;
  guardiaoNome?: string | null;
  guardiaoEmail?: string | null;
  guardiaoRelacao?: string | null;
  contatoEmergenciaNome?: string | null;
  contatoEmergenciaTelefone?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function editarTraveler(prisma: PrismaClient, params: EditarTravelerParams): Promise<{ ok: true; traveler: Traveler } | { ok: false; motivo: "NAO_ENCONTRADO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.traveler.findUnique({ where: { id: params.travelerId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };

    const { tenantId: _t, travelerId: _id, actorType: _a, userId: _u, actorLabel: _l, ...campos } = params;
    const dados = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));

    const traveler = await tx.traveler.update({ where: { id: atual.id }, data: dados });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRAVELER_ATUALIZADO",
      entidade: "Traveler",
      entidadeId: traveler.id,
      resultado: "ok",
      detalhe: { camposAlterados: Object.keys(dados) },
    });
    return { ok: true, traveler };
  });
}

export async function removerTraveler(prisma: PrismaClient, params: { tenantId: string; travelerId: string }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const result = await tx.traveler.deleteMany({ where: { id: params.travelerId, tenantId: params.tenantId } });
    return result.count > 0;
  });
}

export async function listarTravelers(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<Traveler[]> {
  return withTenant(prisma, tenantId, (tx) => tx.traveler.findMany({ where: { tenantId, bookingId }, orderBy: { createdAt: "asc" } }));
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarBookingsDoLead(prisma: PrismaClient, tenantId: string, leadId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.booking.findMany({
      where: { tenantId, leadId },
      include: {
        proposal: true,
        travelers: { include: { documents: { include: { requirement: true }, orderBy: { createdAt: "asc" } } } },
        payments: { orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] },
        commissions: { orderBy: { createdAt: "desc" } },
        responsavel: true,
        trip: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export async function buscarBooking(prisma: PrismaClient, tenantId: string, bookingId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.booking.findUnique({
      where: { id: bookingId },
      include: { proposal: true, travelers: true, responsavel: true },
    }),
  );
}
