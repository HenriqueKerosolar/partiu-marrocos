import type { PrismaClient, DocumentRequirement, TravelerDocument, DocumentStatus, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * Travel Document Foundation 01 (PM-NIGHT-RUN-02, Etapa 4) — separa
 * REQUISITO (`DocumentRequirement`, catálogo reusável por tenant) de
 * DOCUMENTO ENVIADO (`TravelerDocument`, uma linha por passageiro ×
 * requisito). Mudar/desativar um requisito nunca destrói o histórico de
 * quem já enviou o quê (`ativo=false` some da lista de novos requisitos,
 * mas `TravelerDocument` já criados continuam intactos).
 *
 * PRIVACY-BY-DESIGN (§29): nenhuma função aqui aceita/grava bytes de
 * arquivo, URL ou caminho — só metadata/status. Upload real é
 * explicitamente YELLOW nesta rodada (ver relatório de fechamento):
 * este ambiente não tem storage privado/autenticado/com validação de MIME
 * disponível, e o próprio comando autoriza esse fallback.
 */

// ---------------------------------------------------------------------------
// Catálogo de requisitos
// ---------------------------------------------------------------------------

export interface CriarRequisitoParams {
  tenantId: string;
  nome: string;
  descricao?: string | null;
  obrigatorio?: boolean;
}

export async function criarRequisito(prisma: PrismaClient, params: CriarRequisitoParams): Promise<DocumentRequirement> {
  return withTenant(prisma, params.tenantId, (tx) =>
    tx.documentRequirement.create({
      data: { tenantId: params.tenantId, nome: params.nome, descricao: params.descricao ?? null, obrigatorio: params.obrigatorio ?? true },
    }),
  );
}

export async function desativarRequisito(prisma: PrismaClient, params: { tenantId: string; requirementId: string }): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const result = await tx.documentRequirement.updateMany({ where: { id: params.requirementId, tenantId: params.tenantId }, data: { ativo: false } });
    return result.count > 0;
  });
}

export async function listarRequisitos(prisma: PrismaClient, tenantId: string, apenasAtivos = true): Promise<DocumentRequirement[]> {
  return withTenant(prisma, tenantId, (tx) => tx.documentRequirement.findMany({ where: { tenantId, ...(apenasAtivos ? { ativo: true } : {}) }, orderBy: { createdAt: "asc" } }));
}

// ---------------------------------------------------------------------------
// Instanciação por passageiro — chamada depois de `adicionarTraveler`
// (booking.ts) pra criar uma linha PENDENTE por requisito ativo. Idempotente:
// nunca duplica uma linha já existente pro mesmo par (traveler, requisito).
// ---------------------------------------------------------------------------

export async function sincronizarRequisitosDoTraveler(prisma: PrismaClient, params: { tenantId: string; travelerId: string }): Promise<number> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const [requisitosAtivos, existentes] = await Promise.all([
      tx.documentRequirement.findMany({ where: { tenantId: params.tenantId, ativo: true } }),
      tx.travelerDocument.findMany({ where: { tenantId: params.tenantId, travelerId: params.travelerId }, select: { requirementId: true } }),
    ]);
    const jaTem = new Set(existentes.map((e) => e.requirementId));
    const faltantes = requisitosAtivos.filter((r) => !jaTem.has(r.id));
    if (faltantes.length === 0) return 0;

    await tx.travelerDocument.createMany({
      data: faltantes.map((r) => ({ tenantId: params.tenantId, travelerId: params.travelerId, requirementId: r.id })),
    });
    return faltantes.length;
  });
}

// ---------------------------------------------------------------------------
// Máquina de estados — cobre os 6 estados do comando (§30). EM_ANALISE é
// opcional (ENVIADO pode ir direto pra APROVADO/REJEITADO).
// ---------------------------------------------------------------------------

const TRANSICOES_VALIDAS: Record<DocumentStatus, DocumentStatus[]> = {
  PENDENTE: ["ENVIADO"],
  ENVIADO: ["EM_ANALISE", "APROVADO", "REJEITADO"],
  EM_ANALISE: ["APROVADO", "REJEITADO"],
  APROVADO: ["EXPIRADO"],
  REJEITADO: ["ENVIADO"],
  EXPIRADO: ["ENVIADO"],
};

export function transicaoValidaDocumento(de: DocumentStatus, para: DocumentStatus): boolean {
  return TRANSICOES_VALIDAS[de]?.includes(para) ?? false;
}

export interface MoverStatusDocumentoParams {
  tenantId: string;
  travelerDocumentId: string;
  novoStatus: DocumentStatus;
  motivoRejeicao?: string | null;
  validadeAte?: Date | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type MoverStatusResultado = { ok: true; documento: TravelerDocument } | { ok: false; motivo: "NAO_ENCONTRADO" | "TRANSICAO_INVALIDA" };

export async function moverStatusDocumento(prisma: PrismaClient, params: MoverStatusDocumentoParams): Promise<MoverStatusResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.travelerDocument.findUnique({ where: { id: params.travelerDocumentId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };
    if (!transicaoValidaDocumento(atual.status, params.novoStatus)) return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const documento = await tx.travelerDocument.update({
      where: { id: atual.id },
      data: {
        status: params.novoStatus,
        ...(params.novoStatus === "ENVIADO" ? { enviadoEm: new Date(), motivoRejeicao: null } : {}),
        ...(params.novoStatus === "APROVADO" || params.novoStatus === "REJEITADO"
          ? { revisadoEm: new Date(), revisadoPorId: params.actorType === "HUMANO" ? params.userId : null }
          : {}),
        ...(params.novoStatus === "REJEITADO" ? { motivoRejeicao: params.motivoRejeicao ?? null } : {}),
        ...(params.novoStatus === "APROVADO" && params.validadeAte !== undefined ? { validadeAte: params.validadeAte } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "DOCUMENTO_STATUS_ALTERADO",
      entidade: "TravelerDocument",
      entidadeId: documento.id,
      resultado: "ok",
      detalhe: { de: atual.status, para: params.novoStatus },
    });
    return { ok: true, documento };
  });
}

// ---------------------------------------------------------------------------
// Expiração — sweep preguiçoso (mesmo padrão de `expirarSeVencido` em
// Gates T1 / `expirarPropostasVencidas` em Proposal). APROVADO com
// `validadeAte` vencida vira EXPIRADO — nunca fica "aprovado" indefinidamente
// depois que a validade passou.
// ---------------------------------------------------------------------------

export async function expirarDocumentosVencidos(prisma: PrismaClient, tenantId: string): Promise<number> {
  return withTenant(prisma, tenantId, async (tx) => {
    const vencidos = await tx.travelerDocument.findMany({
      where: { tenantId, status: "APROVADO", validadeAte: { lt: new Date() } },
      select: { id: true },
    });
    let expirados = 0;
    for (const d of vencidos) {
      const result = await tx.travelerDocument.updateMany({ where: { id: d.id, tenantId, status: "APROVADO" }, data: { status: "EXPIRADO" } });
      if (result.count > 0) {
        expirados++;
        await registrarEvento(tx, { tenantId, actorType: "SISTEMA", acao: "DOCUMENTO_EXPIRADO", entidade: "TravelerDocument", entidadeId: d.id, resultado: "expirado", detalhe: {} });
      }
    }
    return expirados;
  });
}

// ---------------------------------------------------------------------------
// Estado documental agregado do Booking (§30: "Booking pode usar estado
// documental agregado"). Puramente informativo — NUNCA move o status do
// Booking sozinho ("não confirmar automaticamente viagem... salvo regra
// explícita" — nenhuma regra explícita foi pedida nesta rodada).
// ---------------------------------------------------------------------------

export interface StatusDocumentalBooking {
  totalObrigatorios: number;
  aprovados: number;
  pendentes: number;
  rejeitados: number;
  completo: boolean; // todos os obrigatórios estão APROVADO
}

export async function statusDocumentalDoBooking(prisma: PrismaClient, tenantId: string, bookingId: string): Promise<StatusDocumentalBooking> {
  await expirarDocumentosVencidos(prisma, tenantId);
  return withTenant(prisma, tenantId, async (tx) => {
    const documentos = await tx.travelerDocument.findMany({
      where: { tenantId, traveler: { bookingId } },
      include: { requirement: true },
    });
    const obrigatorios = documentos.filter((d) => d.requirement.obrigatorio);
    const aprovados = obrigatorios.filter((d) => d.status === "APROVADO").length;
    const rejeitados = obrigatorios.filter((d) => d.status === "REJEITADO").length;
    return {
      totalObrigatorios: obrigatorios.length,
      aprovados,
      rejeitados,
      pendentes: obrigatorios.length - aprovados - rejeitados,
      completo: obrigatorios.length > 0 && aprovados === obrigatorios.length,
    };
  });
}

export async function listarDocumentosDoTraveler(prisma: PrismaClient, tenantId: string, travelerId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.travelerDocument.findMany({ where: { tenantId, travelerId }, include: { requirement: true }, orderBy: { createdAt: "asc" } }),
  );
}
