import { randomBytes, createHash } from "crypto";
import type { PrismaClient, TravelerCheckIn, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * PM-CONV-04, Track A — QR + Check-in + Boarding.
 *
 * Ciclo de vida único por (TripGroup × Traveler): AGENDADO → CHECKIN_REALIZADO
 * → EMBARCADO, com NO_SHOW/CANCELADO como desvios. Nenhuma tabela "Arrival"/
 * "Boarding" separada — decisão documentada em schema.prisma.
 *
 * Segurança (§6A-§10A do comando):
 * - Token é ALEATÓRIO E OPACO (`randomBytes(24)` → 48 hex chars). NUNCA um ID
 *   interno (Booking/Traveler/TripGroup). Só o HASH SHA-256 é persistido —
 *   o token bruto é devolvido ao chamador uma única vez, na emissão.
 * - Formato validado por regex ANTES de qualquer lookup — um payload que não
 *   bater exatamente com `^[a-f0-9]{48}$` é rejeitado sem nunca ser
 *   interpretado como URL/comando/script (§7A: "conteúdo do QR é só dado").
 * - VALIDAR (`validarCredencial`) nunca muda estado — só EXECUTAR
 *   (`confirmarCheckIn`/`confirmarEmbarque`) muda (§9A).
 * - Isolamento cross-tenant vem "de graça": o hash é globalmente único no
 *   banco, mas a leitura sempre passa por `withTenant` — um token de outro
 *   tenant simplesmente não aparece sob RLS do tenant corrente (mesmo
 *   comportamento de "não encontrado" que um token inválido, de propósito:
 *   não vaza se o token pertence a outro tenant ou não existe).
 */

const TOKEN_REGEX = /^[a-f0-9]{48}$/;
const CREDENCIAL_TTL_MS_PADRAO = 24 * 60 * 60 * 1000; // 24h — mesma ordem de grandeza do Gate (T1)

function gerarTokenBruto(): string {
  return randomBytes(24).toString("hex");
}

// Exportado como `hashTokenCredencial` pra ser reaproveitado por
// passageiro.ts (PM-CONV-05, Track B) — mesma credencial, mesmo hash,
// nunca uma segunda implementação da mesma lógica de segurança.
export function hashToken(tokenBruto: string): string {
  return createHash("sha256").update(tokenBruto).digest("hex");
}

// ---------------------------------------------------------------------------
// Emissão / revogação de credencial
// ---------------------------------------------------------------------------

export interface EmitirCredencialParams {
  tenantId: string;
  tripGroupId: string;
  travelerId: string;
  ttlMs?: number;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

export type EmitirCredencialResultado =
  | { ok: true; travelerCheckInId: string; token: string; expiresAt: Date }
  | { ok: false; motivo: "GRUPO_NAO_ENCONTRADO" | "PASSAGEIRO_NAO_PERTENCE_AO_GRUPO" | "CREDENCIAL_REVOGADA" | "JA_EMBARCADO" };

export async function emitirCredencial(prisma: PrismaClient, params: EmitirCredencialParams): Promise<EmitirCredencialResultado> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const grupo = await tx.tripGroup.findUnique({ where: { id: params.tripGroupId } });
    if (!grupo) return { ok: false, motivo: "GRUPO_NAO_ENCONTRADO" };

    const booking = await tx.booking.findFirst({ where: { tenantId: params.tenantId, tripGroupId: grupo.id, travelers: { some: { id: params.travelerId } } } });
    if (!booking) return { ok: false, motivo: "PASSAGEIRO_NAO_PERTENCE_AO_GRUPO" };

    const existente = await tx.travelerCheckIn.findUnique({
      where: { tenantId_tripGroupId_travelerId: { tenantId: params.tenantId, tripGroupId: grupo.id, travelerId: params.travelerId } },
    });
    if (existente?.status === "EMBARCADO") return { ok: false, motivo: "JA_EMBARCADO" };
    if (existente?.credencialRevogadaEm && existente.status !== "AGENDADO") return { ok: false, motivo: "CREDENCIAL_REVOGADA" };

    const tokenBruto = gerarTokenBruto();
    const hash = hashToken(tokenBruto);
    const agora = new Date();
    const expiresAt = new Date(agora.getTime() + (params.ttlMs ?? CREDENCIAL_TTL_MS_PADRAO));

    const registro = await tx.travelerCheckIn.upsert({
      where: { tenantId_tripGroupId_travelerId: { tenantId: params.tenantId, tripGroupId: grupo.id, travelerId: params.travelerId } },
      update: {
        status: existente && existente.status !== "AGENDADO" ? existente.status : "AGENDADO",
        credencialTokenHash: hash,
        credencialEmitidaEm: agora,
        credencialExpiraEm: expiresAt,
        credencialRevogadaEm: null,
      },
      create: {
        tenantId: params.tenantId,
        tripGroupId: grupo.id,
        travelerId: params.travelerId,
        bookingId: booking.id,
        credencialTokenHash: hash,
        credencialEmitidaEm: agora,
        credencialExpiraEm: expiresAt,
      },
    });

    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "CREDENCIAL_EMITIDA",
      entidade: "TravelerCheckIn",
      entidadeId: registro.id,
      resultado: "ok",
      // Nunca o token/hash no Audit (§17A) — só o fato e a expiração.
      detalhe: { travelerId: params.travelerId, tripGroupId: grupo.id, expiresAt },
    });

    return { ok: true, travelerCheckInId: registro.id, token: tokenBruto, expiresAt };
  });
}

export async function revogarCredencial(
  prisma: PrismaClient,
  params: { tenantId: string; travelerCheckInId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const result = await tx.travelerCheckIn.updateMany({
      where: { id: params.travelerCheckInId, tenantId: params.tenantId, credencialRevogadaEm: null },
      data: { credencialRevogadaEm: new Date() },
    });
    if (result.count === 0) return false;
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "CREDENCIAL_REVOGADA",
      entidade: "TravelerCheckIn",
      entidadeId: params.travelerCheckInId,
      resultado: "ok",
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Validação (nunca muda estado) — §9A
// ---------------------------------------------------------------------------

export type ValidarCredencialResultado =
  | { ok: true; travelerCheckIn: TravelerCheckIn }
  | { ok: false; motivo: "FORMATO_INVALIDO" | "NAO_ENCONTRADA" | "EXPIRADA" | "REVOGADA" };

/**
 * Único ponto de entrada pra "o que é isso que o scanner leu" — trata o
 * payload SEMPRE como dado opaco. Qualquer coisa que não bata no formato
 * esperado (48 hex chars) é rejeitada sem nunca ser interpretada como
 * URL/comando/HTML/JS (§7A). Também limita o tamanho do input recebido
 * antes até de rodar a regex, contra payload excessivo.
 */
export async function validarCredencial(prisma: PrismaClient, tenantId: string, payloadBruto: string): Promise<ValidarCredencialResultado> {
  if (typeof payloadBruto !== "string" || payloadBruto.length === 0 || payloadBruto.length > 200) return { ok: false, motivo: "FORMATO_INVALIDO" };
  const payload = payloadBruto.trim();
  if (!TOKEN_REGEX.test(payload)) return { ok: false, motivo: "FORMATO_INVALIDO" };

  const hash = hashToken(payload);
  return withTenant(prisma, tenantId, async (tx) => {
    const registro = await tx.travelerCheckIn.findFirst({ where: { tenantId, credencialTokenHash: hash } });
    if (!registro) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (registro.credencialRevogadaEm) return { ok: false, motivo: "REVOGADA" };
    if (!registro.credencialExpiraEm || registro.credencialExpiraEm < new Date()) return { ok: false, motivo: "EXPIRADA" };
    return { ok: true, travelerCheckIn: registro };
  });
}

// ---------------------------------------------------------------------------
// Execução — check-in
// ---------------------------------------------------------------------------

export type ConfirmarCheckInResultado =
  | { ok: true; travelerCheckIn: TravelerCheckIn; jaAplicado: boolean }
  | { ok: false; motivo: "FORMATO_INVALIDO" | "NAO_ENCONTRADA" | "EXPIRADA" | "REVOGADA" | "NO_SHOW_OU_CANCELADO" | "JA_EMBARCADO" };

export async function confirmarCheckIn(
  prisma: PrismaClient,
  params: { tenantId: string; tokenBruto: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<ConfirmarCheckInResultado> {
  const validacao = await validarCredencial(prisma, params.tenantId, params.tokenBruto);
  if (!validacao.ok) return validacao;

  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.travelerCheckIn.findUnique({ where: { id: validacao.travelerCheckIn.id } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    // Idempotência real (§10A): repetir check-in no mesmo passageiro nunca
    // duplica o evento nem falha — mesma regra já aplicada em Payment/
    // Commission/TripGroupProfissional nesta base.
    if (atual.status === "CHECKIN_REALIZADO") return { ok: true, travelerCheckIn: atual, jaAplicado: true };
    if (atual.status === "EMBARCADO") return { ok: false, motivo: "JA_EMBARCADO" };
    if (atual.status === "NO_SHOW" || atual.status === "CANCELADO") return { ok: false, motivo: "NO_SHOW_OU_CANCELADO" };

    const registro = await tx.travelerCheckIn.update({
      where: { id: atual.id },
      data: { status: "CHECKIN_REALIZADO", checkinEm: new Date(), checkinPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "CHECKIN_REALIZADO",
      entidade: "TravelerCheckIn",
      entidadeId: registro.id,
      resultado: "ok",
      detalhe: { travelerId: registro.travelerId, tripGroupId: registro.tripGroupId },
    });
    return { ok: true, travelerCheckIn: registro, jaAplicado: false };
  });
}

// ---------------------------------------------------------------------------
// Execução — embarque
// ---------------------------------------------------------------------------

export type ConfirmarEmbarqueResultado =
  | { ok: true; travelerCheckIn: TravelerCheckIn; jaAplicado: boolean }
  | { ok: false; motivo: "FORMATO_INVALIDO" | "NAO_ENCONTRADA" | "EXPIRADA" | "REVOGADA" | "CHECKIN_NAO_REALIZADO" | "NO_SHOW_OU_CANCELADO" | "CAPACIDADE_EXCEDIDA" };

export async function confirmarEmbarque(
  prisma: PrismaClient,
  params: { tenantId: string; tokenBruto: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<ConfirmarEmbarqueResultado> {
  const validacao = await validarCredencial(prisma, params.tenantId, params.tokenBruto);
  if (!validacao.ok) return validacao;

  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.travelerCheckIn.findUnique({ where: { id: validacao.travelerCheckIn.id } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status === "EMBARCADO") return { ok: true, travelerCheckIn: atual, jaAplicado: true };
    if (atual.status === "NO_SHOW" || atual.status === "CANCELADO") return { ok: false, motivo: "NO_SHOW_OU_CANCELADO" };
    // Política fixa desta fundação: check-in é pré-requisito de embarque
    // (§12A: "verificar check-in quando política exigir" — aqui sempre exige).
    if (atual.status !== "CHECKIN_REALIZADO") return { ok: false, motivo: "CHECKIN_NAO_REALIZADO" };

    // Capacidade validada no BACKEND (§14A: "não confiar apenas no contador
    // visual") — nunca embarcar além da capacidade do veículo do grupo.
    const grupo = await tx.tripGroup.findUniqueOrThrow({ where: { id: atual.tripGroupId }, include: { veiculo: true } });
    const embarcados = await tx.travelerCheckIn.count({ where: { tenantId: params.tenantId, tripGroupId: grupo.id, status: "EMBARCADO" } });
    if (embarcados >= grupo.veiculo.capacidade) return { ok: false, motivo: "CAPACIDADE_EXCEDIDA" };

    const registro = await tx.travelerCheckIn.update({
      where: { id: atual.id },
      data: { status: "EMBARCADO", embarqueEm: new Date(), embarquePorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "EMBARQUE_REALIZADO",
      entidade: "TravelerCheckIn",
      entidadeId: registro.id,
      resultado: "ok",
      detalhe: { travelerId: registro.travelerId, tripGroupId: registro.tripGroupId },
    });
    return { ok: true, travelerCheckIn: registro, jaAplicado: false };
  });
}

// ---------------------------------------------------------------------------
// No-show — só ação manual autorizada (§13A: nunca automático)
// ---------------------------------------------------------------------------

export async function marcarNoShow(
  prisma: PrismaClient,
  params: { tenantId: string; travelerCheckInId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<{ ok: true; travelerCheckIn: TravelerCheckIn } | { ok: false; motivo: "NAO_ENCONTRADA" | "TRANSICAO_INVALIDA" }> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const atual = await tx.travelerCheckIn.findUnique({ where: { id: params.travelerCheckInId } });
    if (!atual) return { ok: false, motivo: "NAO_ENCONTRADA" };
    if (atual.status !== "AGENDADO" && atual.status !== "CHECKIN_REALIZADO") return { ok: false, motivo: "TRANSICAO_INVALIDA" };

    const registro = await tx.travelerCheckIn.update({
      where: { id: atual.id },
      data: { status: "NO_SHOW", noShowEm: new Date(), noShowPorId: params.actorType === "HUMANO" ? (params.userId ?? null) : null },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.actorType === "HUMANO" ? params.userId : null,
      actorLabel: params.actorLabel ?? null,
      acao: "NO_SHOW_REGISTRADO",
      entidade: "TravelerCheckIn",
      entidadeId: registro.id,
      resultado: "ok",
      detalhe: { travelerId: registro.travelerId, tripGroupId: registro.tripGroupId },
    });
    return { ok: true, travelerCheckIn: registro };
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listarCheckinsDoGrupo(prisma: PrismaClient, tenantId: string, tripGroupId: string) {
  return withTenant(prisma, tenantId, (tx) =>
    tx.travelerCheckIn.findMany({ where: { tenantId, tripGroupId }, include: { traveler: true }, orderBy: { createdAt: "asc" } }),
  );
}
