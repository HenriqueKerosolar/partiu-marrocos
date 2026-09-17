import type { PrismaClient, TravelerCare, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-03, §8 — dados de atendimento/saúde do passageiro. Tabela
 * SEPARADA de `Traveler` de propósito (nunca aparece em `listarTravelers`),
 * gated por uma permissão própria mais restrita que `bookings.manage`
 * (`passageiros.dados_sensiveis.*`). NÃO é um cadastro médico — só o mínimo
 * operacionalmente necessário, sempre texto livre informado por humano.
 * `consentimento` é obrigatório para gravar QUALQUER campo preenchido —
 * registrar a informação sem consentimento explícito não é permitido.
 */

export interface RegistrarTravelerCareParams {
  tenantId: string;
  travelerId: string;
  dieta?: string | null;
  condicoes?: string | null;
  medicamentos?: string | null;
  frequencia?: string | null;
  consentimento: boolean;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type RegistrarTravelerCareResultado = { ok: true; care: TravelerCare } | { ok: false; motivo: "TRAVELER_NAO_ENCONTRADO" | "CONSENTIMENTO_REQUERIDO" };

export async function registrarTravelerCare(prisma: PrismaClient, params: RegistrarTravelerCareParams): Promise<RegistrarTravelerCareResultado> {
  const algumCampoPreenchido = [params.dieta, params.condicoes, params.medicamentos, params.frequencia].some((v) => v);
  if (algumCampoPreenchido && !params.consentimento) return { ok: false, motivo: "CONSENTIMENTO_REQUERIDO" };

  return withTenant(prisma, params.tenantId, async (tx) => {
    const traveler = await tx.traveler.findUnique({ where: { id: params.travelerId } });
    if (!traveler) return { ok: false, motivo: "TRAVELER_NAO_ENCONTRADO" };

    const care = await tx.travelerCare.upsert({
      where: { tenantId_travelerId: { tenantId: params.tenantId, travelerId: traveler.id } },
      update: {
        dieta: params.dieta ?? null,
        condicoes: params.condicoes ?? null,
        medicamentos: params.medicamentos ?? null,
        frequencia: params.frequencia ?? null,
        consentimento: params.consentimento,
        registradoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null,
      },
      create: {
        tenantId: params.tenantId,
        travelerId: traveler.id,
        dieta: params.dieta ?? null,
        condicoes: params.condicoes ?? null,
        medicamentos: params.medicamentos ?? null,
        frequencia: params.frequencia ?? null,
        consentimento: params.consentimento,
        registradoPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null,
      },
    });

    // Audit NUNCA grava o conteúdo sensível em si (§27 do comando: "não
    // registrar conteúdo sensível integralmente em logs se isso gerar
    // vazamento") — só o fato de que a informação foi alterada e por quem.
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "TRAVELER_CARE_REGISTRADO",
      entidade: "TravelerCare",
      entidadeId: care.id,
      resultado: "ok",
      detalhe: { travelerId: traveler.id, consentimento: care.consentimento, camposPreenchidos: algumCampoPreenchido },
    });
    return { ok: true, care };
  });
}

// Consulta separada e explícita — nunca incluída em `listarTravelers` (§8:
// "não expor esse conteúdo em listagens amplas"). Quem chama esta função é
// responsável por exigir `passageiros.dados_sensiveis.view` antes.
export async function buscarTravelerCare(prisma: PrismaClient, tenantId: string, travelerId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.travelerCare.findUnique({ where: { tenantId_travelerId: { tenantId, travelerId } } }));
}
