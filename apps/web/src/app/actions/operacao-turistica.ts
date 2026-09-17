"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  criarProfessional,
  editarProfessional,
  criarSupplier,
  editarSupplier,
  criarTourVehicle,
  editarTourVehicle,
  criarTripGroup,
  atribuirProfissional,
  removerProfissional,
  vincularBookingAoGrupo,
  desvincularBookingDoGrupo,
  atualizarProgressoParada,
  registrarTravelerCare,
  type ProfessionalPapel,
  type TripActivityProgressStatus,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// Professional
// ---------------------------------------------------------------------------

export async function criarProfessionalAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "profissionais.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome." };

  await criarProfessional(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    telefone: String(formData.get("telefone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    idiomas: String(formData.get("idiomas") ?? "").trim() || null,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/profissionais");
  return { ok: true };
}

export async function alternarAtivoProfessionalAction(professionalId: string, ativo: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "profissionais.manage");
  const r = await editarProfessional(prisma, { tenantId: ctx.tenantId!, professionalId, ativo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/profissionais");
  return r.ok ? { ok: true } : { error: "Profissional não encontrado." };
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export async function criarSupplierAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "fornecedores.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome." };

  await criarSupplier(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    tipo: String(formData.get("tipo") ?? "").trim() || null,
    cidade: String(formData.get("cidade") ?? "").trim() || null,
    contato: String(formData.get("contato") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/fornecedores");
  return { ok: true };
}

export async function alternarAtivoSupplierAction(supplierId: string, ativo: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "fornecedores.manage");
  const r = await editarSupplier(prisma, { tenantId: ctx.tenantId!, supplierId, ativo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/fornecedores");
  return r.ok ? { ok: true } : { error: "Fornecedor não encontrado." };
}

// ---------------------------------------------------------------------------
// TourVehicle
// ---------------------------------------------------------------------------

export async function criarTourVehicleAction(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "veiculos.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  const capacidade = Number(formData.get("capacidade"));
  if (!nome) return { error: "Informe o nome." };
  if (!Number.isInteger(capacidade) || capacidade < 1) return { error: "Capacidade inválida." };

  const r = await criarTourVehicle(prisma, {
    tenantId: ctx.tenantId!,
    nome,
    placa: String(formData.get("placa") ?? "").trim() || null,
    categoria: String(formData.get("categoria") ?? "").trim() || null,
    capacidade,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath("/veiculos");
  return r.ok ? { ok: true } : { error: "Capacidade inválida." };
}

export async function alternarAtivoTourVehicleAction(veiculoId: string, ativo: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "veiculos.manage");
  const r = await editarTourVehicle(prisma, { tenantId: ctx.tenantId!, veiculoId, ativo, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath("/veiculos");
  return r.ok ? { ok: true } : { error: "Veículo não encontrado." };
}

// ---------------------------------------------------------------------------
// TripGroup (dentro da página da Trip)
// ---------------------------------------------------------------------------

const MOTIVOS_GRUPO: Record<string, string> = {
  TRIP_NAO_ENCONTRADA: "Viagem não encontrada.",
  TRIP_CANCELADA: "Viagem cancelada não pode receber grupo operacional.",
  VEICULO_NAO_ENCONTRADO: "Veículo não encontrado.",
  VEICULO_INATIVO: "Veículo está inativo.",
  CONFLITO_VEICULO: "Este veículo já está alocado a outro grupo com datas sobrepostas.",
};

export async function criarTripGroupAction(tripId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const nome = String(formData.get("nome") ?? "").trim();
  const veiculoId = String(formData.get("veiculoId") ?? "").trim();
  if (!nome || !veiculoId) return { error: "Informe nome e veículo." };

  const r = await criarTripGroup(prisma, { tenantId: ctx.tenantId!, tripId, nome, veiculoId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: MOTIVOS_GRUPO[r.motivo] ?? "Não foi possível criar o grupo." };
  return { ok: true };
}

const MOTIVOS_ATRIBUICAO: Record<string, string> = {
  GRUPO_NAO_ENCONTRADO: "Grupo não encontrado.",
  PROFISSIONAL_NAO_ENCONTRADO: "Profissional não encontrado.",
  PROFISSIONAL_INATIVO: "Profissional está inativo.",
  CONFLITO_PROFISSIONAL: "Este profissional já está atribuído a outro grupo com datas sobrepostas.",
};

export async function atribuirProfissionalAction(tripId: string, tripGroupId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const professionalId = String(formData.get("professionalId") ?? "").trim();
  const papel = String(formData.get("papel") ?? "").trim() as ProfessionalPapel;
  if (!professionalId || !papel) return { error: "Selecione o profissional e o papel." };

  const r = await atribuirProfissional(prisma, { tenantId: ctx.tenantId!, tripGroupId, professionalId, papel, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: MOTIVOS_ATRIBUICAO[r.motivo] ?? "Não foi possível atribuir." };
  return { ok: true };
}

export async function removerProfissionalAction(tripId: string, tripGroupId: string, professionalId: string, papel: ProfessionalPapel): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const removido = await removerProfissional(prisma, { tenantId: ctx.tenantId!, tripGroupId, professionalId, papel, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  return removido ? { ok: true } : { error: "Atribuição não encontrada." };
}

const MOTIVOS_BOOKING_GRUPO: Record<string, string> = {
  GRUPO_NAO_ENCONTRADO: "Grupo não encontrado.",
  BOOKING_NAO_ENCONTRADO: "Reserva não encontrada.",
  TRIP_DIVERGENTE: "Essa reserva pertence a outra viagem.",
  CAPACIDADE_EXCEDIDA: "A capacidade do veículo deste grupo seria excedida.",
};

export async function vincularBookingAoGrupoAction(tripId: string, tripGroupId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { error: "Selecione a reserva." };

  const r = await vincularBookingAoGrupo(prisma, { tenantId: ctx.tenantId!, tripGroupId, bookingId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  if (!r.ok) return { error: MOTIVOS_BOOKING_GRUPO[r.motivo] ?? "Não foi possível vincular." };
  return { ok: true };
}

export async function desvincularBookingDoGrupoAction(tripId: string, bookingId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const r = await desvincularBookingDoGrupo(prisma, { tenantId: ctx.tenantId!, bookingId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  return r ? { ok: true } : { error: "Reserva não estava vinculada a um grupo." };
}

export async function atualizarProgressoParadaAction(tripId: string, tripGroupId: string, tripActivityId: string, status: TripActivityProgressStatus): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "grupos_operacionais.manage");
  const r = await atualizarProgressoParada(prisma, { tenantId: ctx.tenantId!, tripGroupId, tripActivityId, status, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/viagens/${tripId}`);
  return r.ok ? { ok: true } : { error: "Não foi possível atualizar o progresso." };
}

// ---------------------------------------------------------------------------
// TravelerCare (restrito — permissão própria, nunca em listagem ampla)
// ---------------------------------------------------------------------------

export async function registrarTravelerCareAction(leadId: string, travelerId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "passageiros.dados_sensiveis.manage");
  const consentimento = formData.get("consentimento") === "on";

  const r = await registrarTravelerCare(prisma, {
    tenantId: ctx.tenantId!,
    travelerId,
    dieta: String(formData.get("dieta") ?? "").trim() || null,
    condicoes: String(formData.get("condicoes") ?? "").trim() || null,
    medicamentos: String(formData.get("medicamentos") ?? "").trim() || null,
    frequencia: String(formData.get("frequencia") ?? "").trim() || null,
    consentimento,
    actorType: "HUMANO",
    userId: ctx.user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "CONSENTIMENTO_REQUERIDO" ? "Consentimento é obrigatório para registrar essa informação." : "Passageiro não encontrado." };
  return { ok: true };
}
