import type { PrismaClient, TourVehicle, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-03, §12 — veículo EXCLUSIVAMENTE de operação turística. Modelo
 * `TourVehicle` deliberadamente distinto de `Vehicle` (nome do domínio
 * KeroCar, telemetria/OBD2, extraído para D:\Projetos\OBD2 e removido deste
 * schema — migration `20260915000000_remove_kerocar_domain`). Nenhuma
 * telemetria, nenhum GPS aqui.
 */

export interface CriarTourVehicleParams {
  tenantId: string;
  nome: string;
  placa?: string | null;
  categoria?: string | null;
  capacidade: number;
  fornecedorId?: string | null;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function criarTourVehicle(prisma: PrismaClient, params: CriarTourVehicleParams): Promise<{ ok: true; veiculo: TourVehicle } | { ok: false; motivo: "CAPACIDADE_INVALIDA" }> {
  if (!Number.isInteger(params.capacidade) || params.capacidade < 1) return { ok: false, motivo: "CAPACIDADE_INVALIDA" };
  return withTenant(prisma, params.tenantId, async (tx) => {
    const veiculo = await tx.tourVehicle.create({
      data: {
        tenantId: params.tenantId,
        nome: params.nome,
        placa: params.placa ?? null,
        categoria: params.categoria ?? null,
        capacidade: params.capacidade,
        fornecedorId: params.fornecedorId ?? null,
        observacoes: params.observacoes ?? null,
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "VEICULO_CRIADO",
      entidade: "TourVehicle",
      entidadeId: veiculo.id,
      resultado: "ok",
      detalhe: { nome: veiculo.nome, capacidade: veiculo.capacidade },
    });
    return { ok: true, veiculo };
  });
}

export interface EditarTourVehicleParams {
  tenantId: string;
  veiculoId: string;
  nome?: string;
  placa?: string | null;
  categoria?: string | null;
  capacidade?: number;
  fornecedorId?: string | null;
  ativo?: boolean;
  observacoes?: string | null;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export async function editarTourVehicle(
  prisma: PrismaClient,
  params: EditarTourVehicleParams,
): Promise<{ ok: true; veiculo: TourVehicle } | { ok: false; motivo: "NAO_ENCONTRADO" | "CAPACIDADE_INVALIDA" }> {
  if (params.capacidade !== undefined && (!Number.isInteger(params.capacidade) || params.capacidade < 1)) return { ok: false, motivo: "CAPACIDADE_INVALIDA" };
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.tourVehicle.findUnique({ where: { id: params.veiculoId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADO" };

    const veiculo = await tx.tourVehicle.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined ? { nome: params.nome } : {}),
        ...(params.placa !== undefined ? { placa: params.placa } : {}),
        ...(params.categoria !== undefined ? { categoria: params.categoria } : {}),
        ...(params.capacidade !== undefined ? { capacidade: params.capacidade } : {}),
        ...(params.fornecedorId !== undefined ? { fornecedorId: params.fornecedorId } : {}),
        ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
        ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "VEICULO_ALTERADO",
      entidade: "TourVehicle",
      entidadeId: veiculo.id,
      resultado: "ok",
      detalhe: { ativo: veiculo.ativo },
    });
    return { ok: true, veiculo };
  });
}

export async function listarTourVehicles(prisma: PrismaClient, tenantId: string, params?: { somenteAtivos?: boolean }) {
  return withTenant(prisma, tenantId, (tx) => tx.tourVehicle.findMany({ where: { tenantId, ...(params?.somenteAtivos ? { ativo: true } : {}) }, orderBy: { nome: "asc" } }));
}

export async function buscarTourVehicle(prisma: PrismaClient, tenantId: string, veiculoId: string) {
  return withTenant(prisma, tenantId, (tx) => tx.tourVehicle.findUnique({ where: { id: veiculoId } }));
}
