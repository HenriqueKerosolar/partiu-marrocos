"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  criarProposta,
  atualizarPropostaRascunho,
  criarNovaVersao,
  enviarProposta,
  confirmarEnvioAposAprovacaoGate,
  aceitarProposta,
  recusarProposta,
} from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";

function parseServicos(raw: string): string[] | null {
  const linhas = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return linhas.length > 0 ? linhas : null;
}

function dadosDoFormulario(formData: FormData) {
  const precoRaw = String(formData.get("preco") ?? "").trim();
  const precoReferenciaRaw = String(formData.get("precoReferencia") ?? "").trim();
  const custosRaw = String(formData.get("custos") ?? "").trim();
  const validadeRaw = String(formData.get("validade") ?? "").trim();

  return {
    roteiro: String(formData.get("roteiro") ?? "").trim() || null,
    quantidadePassageiros: formData.get("quantidadePassageiros") ? Number(formData.get("quantidadePassageiros")) : null,
    servicosIncluidos: parseServicos(String(formData.get("servicosIncluidos") ?? "")),
    servicosExcluidos: parseServicos(String(formData.get("servicosExcluidos") ?? "")),
    moeda: String(formData.get("moeda") ?? "BRL").trim() || "BRL",
    preco: precoRaw ? Number(precoRaw) : 0,
    precoReferencia: precoReferenciaRaw ? Number(precoReferenciaRaw) : null,
    custos: custosRaw ? Number(custosRaw) : null,
    condicoes: String(formData.get("condicoes") ?? "").trim() || null,
    validade: validadeRaw ? new Date(validadeRaw) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    condicaoExcepcional: formData.get("condicaoExcepcional") === "on",
    compromissoExternoSensivel: formData.get("compromissoExternoSensivel") === "on",
  };
}

export async function criarPropostaAction(leadId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const dados = dadosDoFormulario(formData);
  if (!dados.preco || dados.preco <= 0) return { error: "Informe um preço válido." };

  await criarProposta(prisma, { tenantId: ctx.tenantId!, leadId, criadoPorId: ctx.user.id, ...dados });

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function enviarPropostaAction(leadId: string, propostaId: string): Promise<{ ok?: boolean; error?: string; aguardandoAprovacao?: boolean }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const r = await enviarProposta(prisma, { tenantId: ctx.tenantId!, propostaId, actorType: "HUMANO", userId: ctx.user.id });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: r.motivo === "NAO_E_RASCUNHO" ? "Só é possível enviar uma proposta em rascunho." : "Proposta não encontrada." };
  return { ok: true, aguardandoAprovacao: r.status === "AGUARDANDO_APROVACAO" };
}

export async function verificarAprovacaoPropostaAction(leadId: string, propostaId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const r = await confirmarEnvioAposAprovacaoGate(prisma, { tenantId: ctx.tenantId!, propostaId });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Proposta ou Gate não encontrado." };
  return { ok: true };
}

export async function aceitarPropostaAction(leadId: string, propostaId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const r = await aceitarProposta(prisma, { tenantId: ctx.tenantId!, propostaId });
  revalidatePath(`/leads/${leadId}`);
  return r.ok ? { ok: true } : { error: "Só é possível aceitar uma proposta enviada." };
}

export async function recusarPropostaAction(leadId: string, propostaId: string, motivo?: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const r = await recusarProposta(prisma, { tenantId: ctx.tenantId!, propostaId, motivo });
  revalidatePath(`/leads/${leadId}`);
  return r.ok ? { ok: true } : { error: "Só é possível recusar uma proposta enviada." };
}

export async function criarNovaVersaoPropostaAction(leadId: string, propostaAnteriorId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const dados = dadosDoFormulario(formData);
  const r = await criarNovaVersao(prisma, { tenantId: ctx.tenantId!, propostaAnteriorId, criadoPorId: ctx.user.id, dados });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Não foi possível criar uma nova versão a partir desta proposta." };
  return { ok: true };
}

export async function atualizarPropostaRascunhoAction(leadId: string, propostaId: string, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  requirePermission(ctx, "propostas.manage");

  const dados = dadosDoFormulario(formData);
  const r = await atualizarPropostaRascunho(prisma, { tenantId: ctx.tenantId!, propostaId, dados });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) return { error: "Só é possível editar uma proposta em rascunho." };
  return { ok: true };
}
