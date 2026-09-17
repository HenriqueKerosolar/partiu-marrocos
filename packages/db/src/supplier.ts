import type { PrismaClient, Supplier, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-03, §11 — Supplier turístico (hotel/restaurante/agência local).
 * Só identificação/relacionamento operacional nesta rodada — contas a pagar
 * completas ficam para um Finance Core futuro (mesma lacuna já documentada
 * em Finance Core Real 01 para `Payable`).
 */

export interface CriarSupplierParams {
  tenantId: string;
  nome: string;
  tipo?: string | null;
  cidade?: string | null;
  contato?: string | null;
  email?: string | null;
  servicos?: string | null;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function criarSupplier(prisma: PrismaClient, params: CriarSupplierParams): Promise<Supplier> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const fornecedor = await tx.supplier.create({
      data: {
        tenantId: params.tenantId,
        nome: params.nome,
        tipo: params.tipo ?? null,
        cidade: params.cidade ?? null,
        contato: params.contato ?? null,
        email: params.email ?? null,
        servicos: params.servicos ?? null,
        observacoes: params.observacoes ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "FORNECEDOR_CRIADO",
      entidade: "Supplier",
      entidadeId: fornecedor.id,
      resultado: "ok",
      detalhe: { nome: fornecedor.nome },
    });
    return fornecedor;
  });
}

export interface EditarSupplierParams {
  tenantId: string;
  supplierId: string;
  nome?: string;
  tipo?: string | null;
  cidade?: string | null;
  contato?: string | null;
  email?: string | null;
  servicos?: string | null;
  ativo?: boolean;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function editarSupplier(prisma: PrismaClient, params: EditarSupplierParams): Promise<{ ok: true; fornecedor: Supplier } | { ok: false; motivo: "NAO_ENCONTRADO" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.supplier.findUnique({ where: { id: params.supplierId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };

    const fornecedor = await tx.supplier.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined ? { nome: params.nome } : {}),
        ...(params.tipo !== undefined ? { tipo: params.tipo } : {}),
        ...(params.cidade !== undefined ? { cidade: params.cidade } : {}),
        ...(params.contato !== undefined ? { contato: params.contato } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.servicos !== undefined ? { servicos: params.servicos } : {}),
        ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
        ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "FORNECEDOR_ALTERADO",
      entidade: "Supplier",
      entidadeId: fornecedor.id,
      resultado: "ok",
      detalhe: { ativo: fornecedor.ativo },
    });
    return { ok: true, fornecedor };
  });
}

export async function listarSuppliers(prisma: PrismaClient, tenantId: string, params?: { somenteAtivos?: boolean }) {
  return withTenant(prisma, tenantId, (tx) => tx.supplier.findMany({ where: { tenantId, ...(params?.somenteAtivos ? { ativo: true } : {}) }, orderBy: { nome: "asc" } }));
}

export async function buscarSupplier(prisma: PrismaClient, tenantId: string, supplierId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.supplier.findUnique({ where: { id: supplierId } }));
}
