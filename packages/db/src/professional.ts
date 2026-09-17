import type { PrismaClient, Professional, ProfessionalPapel, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-03 (Core Turístico Canônico), §10 — PROFISSIONAL/PESSOA + PAPÉIS,
 * não Guide/Driver como models separados. Uma mesma pessoa pode acumular
 * GUIA e MOTORISTA (ver `TripGroupProfissional`, onde o papel é atribuído
 * por vínculo com um grupo, não fixo no cadastro da pessoa) sem duplicar
 * nome/telefone/e-mail/idioma/agenda.
 *
 * `Professional` NÃO é um `User` — não faz login no CRM, é um cadastro
 * operacional (mesmo nível de Supplier/TourVehicle).
 */

export interface CriarProfessionalParams {
  tenantId: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  idiomas?: string | null;
  documento?: string | null;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function criarProfessional(prisma: PrismaClient, params: CriarProfessionalParams): Promise<Professional> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const profissional = await tx.professional.create({
      data: {
        tenantId: params.tenantId,
        nome: params.nome,
        telefone: params.telefone ?? null,
        email: params.email ?? null,
        idiomas: params.idiomas ?? null,
        documento: params.documento ?? null,
        observacoes: params.observacoes ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PROFISSIONAL_CRIADO",
      entidade: "Professional",
      entidadeId: profissional.id,
      resultado: "ok",
      detalhe: { nome: profissional.nome },
    });
    return profissional;
  });
}

export interface EditarProfessionalParams {
  tenantId: string;
  professionalId: string;
  nome?: string;
  telefone?: string | null;
  email?: string | null;
  idiomas?: string | null;
  documento?: string | null;
  ativo?: boolean;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function editarProfessional(prisma: PrismaClient, params: EditarProfessionalParams): Promise<{ ok: true; profissional: Professional } | { ok: false; motivo: "NAO_ENCONTRADO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.professional.findUnique({ where: { id: params.professionalId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };

    const profissional = await tx.professional.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined ? { nome: params.nome } : {}),
        ...(params.telefone !== undefined ? { telefone: params.telefone } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.idiomas !== undefined ? { idiomas: params.idiomas } : {}),
        ...(params.documento !== undefined ? { documento: params.documento } : {}),
        ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
        ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "PROFISSIONAL_ALTERADO",
      entidade: "Professional",
      entidadeId: profissional.id,
      resultado: "ok",
      detalhe: { ativo: profissional.ativo },
    });
    return { ok: true, profissional };
  });
}

export async function listarProfessionals(prisma: PrismaClient, tenantId: string, params?: { somenteAtivos?: boolean; papel?: ProfessionalPapel }) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.professional.findMany({
      where: { tenantId, ...(params?.somenteAtivos ? { ativo: true } : {}) },
      orderBy: { nome: "asc" },
    }),
  );
}

export async function buscarProfessional(prisma: PrismaClient, tenantId: string, professionalId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.professional.findUnique({ where: { id: professionalId } }));
}

/** O Professional ligado ao User logado, se houver (app mobile de guia/motorista — PM-CONV-05). */
export async function buscarProfessionalDoUsuario(prisma: PrismaClient, tenantId: string, userId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.professional.findFirst({ where: { tenantId, userId } }));
}
