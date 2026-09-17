import { Prisma } from "@prisma/client";
import type { PrismaClient, CostKind, CostPolicyEscopo, CostPolicyPeriodo, ActorType, CostEvent, CostPolicy } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * Cost Control (T2) — medição → registro → acumulação → limite → alerta →
 * bloqueio → gate para custo técnico/IA. Adaptado do Cost Controller/Budget
 * Foundation do Ai DEV Orquestrador (pesquisa desta rodada, ver relatório de
 * fechamento) — NÃO um porte literal. Desvios deliberados documentados nos
 * comentários do schema.prisma (model CostEvent) e reforçados aqui:
 * Decimal (nunca float) para dinheiro, `UNKNOWN` alcançável de verdade
 * (preço parcial também vira desconhecido, nunca 0 silencioso), reserva
 * atômica também para VALOR (não só contagem de chamadas — o Ai DEV só tem
 * isso pra call-count), e anti-loop de Gate via consumo único registrado em
 * banco (`CostGateConsumo`), não uma máquina de estados nova.
 *
 * Não é financeiro comercial: não há billing, margem, preço de venda nem
 * emissão fiscal aqui — só o teto técnico que o próprio Partiu/KeroMind
 * decide não ultrapassar sem decisão humana.
 */

// ---------------------------------------------------------------------------
// Funções puras (testáveis sem banco)
// ---------------------------------------------------------------------------

export interface UsageInput {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  quantidade?: number; // para cobrança não-baseada-em-token (ex.: por mensagem)
  subscriptionUsage?: boolean; // consumo dentro de uma assinatura já paga — sem custo marginal
  freeTierUsage?: boolean; // dentro do free tier do provider — sem custo marginal
}

export interface PrecoResolvido {
  moeda: string;
  unidade: string;
  precoEntrada: Prisma.Decimal | null;
  precoSaida: Prisma.Decimal | null;
  precoUnico: Prisma.Decimal | null;
  versao: string;
}

export interface ResultadoCusto {
  custoTotal: Prisma.Decimal | null; // null = UNKNOWN de verdade, nunca 0 fingido
  costKind: CostKind;
}

/**
 * Puro — sem acesso a banco. `custoTotal: null` (não 0) é o resultado
 * quando o preço não é conhecido o suficiente para calcular: fecha a lacuna
 * encontrada no Ai DEV (lá, preço PARCIALMENTE configurado — só
 * inputPrice OU outputPrice — silenciosamente virava 0 via `?? 0`,
 * indistinguível de "provider gratuito"). Aqui, preço parcial também é
 * UNKNOWN.
 */
export function calcularCusto(usage: UsageInput, preco: PrecoResolvido | null, opts: { estimado: boolean }): ResultadoCusto {
  // Nunca produz um custo negativo a partir de uso negativo (manipulação ou
  // bug de chamador) — falha alto e cedo em vez de gravar um CostEvent
  // adulterado silenciosamente.
  for (const [campo, valor] of Object.entries({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedTokens: usage.cachedTokens, quantidade: usage.quantidade })) {
    if (valor !== undefined && (valor < 0 || !Number.isFinite(valor))) {
      throw new Error(`calcularCusto: "${campo}" inválido (${valor}) — uso não pode ser negativo, NaN ou infinito`);
    }
  }

  if (usage.subscriptionUsage) return { custoTotal: new Prisma.Decimal(0), costKind: "SUBSCRIPTION_USAGE" };
  if (usage.freeTierUsage) return { custoTotal: new Prisma.Decimal(0), costKind: "FREE_TIER_USAGE" };
  if (!preco) return { custoTotal: null, costKind: "UNKNOWN" };

  if (preco.unidade === "token") {
    if (preco.precoEntrada === null || preco.precoSaida === null) return { custoTotal: null, costKind: "UNKNOWN" };
    // Mesma lógica do preço parcial: USO parcial/ausente também é
    // desconhecido, não 0. Sem isso, uma resposta de provider que não
    // devolveu `usage` (ex.: campo ausente no JSON) viraria
    // ZERO_MARGINAL_COST por acidente via `?? 0` — exatamente a lacuna que
    // a pesquisa desta rodada encontrou no Ai DEV.
    if (usage.inputTokens === undefined || usage.outputTokens === undefined) return { custoTotal: null, costKind: "UNKNOWN" };
    const total = preco.precoEntrada.mul(usage.inputTokens).add(preco.precoSaida.mul(usage.outputTokens));
    if (total.isZero()) return { custoTotal: total, costKind: "ZERO_MARGINAL_COST" };
    return { custoTotal: total, costKind: opts.estimado ? "ESTIMATED" : "ACTUAL" };
  }

  if (preco.precoUnico === null) return { custoTotal: null, costKind: "UNKNOWN" };
  if (usage.quantidade === undefined) return { custoTotal: null, costKind: "UNKNOWN" };
  const total = preco.precoUnico.mul(usage.quantidade);
  if (total.isZero()) return { custoTotal: total, costKind: "ZERO_MARGINAL_COST" };
  return { custoTotal: total, costKind: opts.estimado ? "ESTIMATED" : "ACTUAL" };
}

export interface DimensoesOperacao {
  provider: string;
  model?: string | null;
  capability?: string | null;
  agent?: string | null;
}

/** Puro — quais (escopo, escopoValor) de CostPolicy podem se aplicar a uma operação com estas dimensões. */
export function dimensoesParaEscopos(dim: DimensoesOperacao): { escopo: CostPolicyEscopo; escopoValor: string }[] {
  const escopos: { escopo: CostPolicyEscopo; escopoValor: string }[] = [{ escopo: "TENANT", escopoValor: "" }];
  escopos.push({ escopo: "PROVIDER", escopoValor: dim.provider });
  if (dim.model) escopos.push({ escopo: "MODEL", escopoValor: dim.model });
  if (dim.capability) escopos.push({ escopo: "CAPABILITY", escopoValor: dim.capability });
  if (dim.agent) escopos.push({ escopo: "AGENT", escopoValor: dim.agent });
  return escopos;
}

/** Puro. `POR_CHAMADA` não acumula — não tem chave de período (retorna null). */
export function periodoChaveAtual(periodo: CostPolicyPeriodo, at: Date): string | null {
  if (periodo === "POR_CHAMADA") return null;
  const iso = at.toISOString();
  return periodo === "DIARIO" ? iso.slice(0, 10) : iso.slice(0, 7);
}

function chaveCorrelacaoGateCusto(p: { escopo: CostPolicyEscopo; escopoValor: string; periodo: CostPolicyPeriodo; periodoChave: string }): string {
  return `${p.escopo}|${p.escopoValor}|${p.periodo}|${p.periodoChave}`;
}

// ---------------------------------------------------------------------------
// Catálogo de preços (global, sem RLS — ver schema.prisma model ModelPrice)
// ---------------------------------------------------------------------------

/**
 * Resolve o preço mais específico vigente numa data (model+capability >
 * provider "curinga"), igual em espírito ao resolvePricingVersion do Ai
 * DEV. `null` = nenhum preço cadastrado — NUNCA inventa um valor.
 */
export async function resolverPreco(
  prisma: PrismaClient,
  params: { provider: string; model?: string | null; capability?: string | null; at?: Date },
): Promise<PrecoResolvido | null> {
  const at = params.at ?? new Date();
  const candidatos = await prisma.modelPrice.findMany({
    where: {
      provider: params.provider,
      vigenteDesde: { lte: at },
      OR: [
        { model: null, capability: null },
        ...(params.model ? [{ model: params.model, capability: null }] : []),
        ...(params.capability ? [{ model: null, capability: params.capability }] : []),
        ...(params.model && params.capability ? [{ model: params.model, capability: params.capability }] : []),
      ],
    },
  });
  if (candidatos.length === 0) return null;

  const especificidade = (e: (typeof candidatos)[number]) => (e.model !== null ? 1 : 0) + (e.capability !== null ? 1 : 0);
  const [escolhido] = [...candidatos].sort((a, b) => especificidade(b) - especificidade(a) || b.vigenteDesde.getTime() - a.vigenteDesde.getTime());

  return {
    moeda: escolhido!.moeda,
    unidade: escolhido!.unidade,
    precoEntrada: escolhido!.precoEntrada,
    precoSaida: escolhido!.precoSaida,
    precoUnico: escolhido!.precoUnico,
    versao: escolhido!.versao,
  };
}

// ---------------------------------------------------------------------------
// Acumulador atômico (CostUsage) — INSERT...ON CONFLICT...DO UPDATE...RETURNING,
// mesmo padrão que o Ai DEV comprovou pra call-count budget, aplicado aqui
// a VALOR monetário (fecha a lacuna de concorrência que a pesquisa desta
// rodada encontrou — lá, dois estouros concorrentes de CUSTO podiam os dois
// passar, só call-count tinha proteção atômica real).
// ---------------------------------------------------------------------------

async function ajustarCostUsage(
  prisma: PrismaClient,
  tenantId: string,
  params: { escopo: CostPolicyEscopo; escopoValor: string; periodo: CostPolicyPeriodo; periodoChave: string; moeda: string; delta: Prisma.Decimal },
): Promise<Prisma.Decimal> {
  return withTenant(prisma, tenantId, async (tx) => {
    const rows = await tx.$queryRaw<{ acumulado: Prisma.Decimal }[]>`
      INSERT INTO cost_usages (id, tenant_id, escopo, escopo_valor, periodo, periodo_chave, moeda, acumulado, updated_at)
      VALUES (gen_random_uuid()::text, ${tenantId}, ${params.escopo}::"CostPolicyEscopo", ${params.escopoValor}, ${params.periodo}::"CostPolicyPeriodo", ${params.periodoChave}, ${params.moeda}, ${params.delta}, now())
      ON CONFLICT (tenant_id, escopo, escopo_valor, periodo, periodo_chave, moeda)
      DO UPDATE SET acumulado = cost_usages.acumulado + EXCLUDED.acumulado, updated_at = now()
      RETURNING acumulado
    `;
    return rows[0]!.acumulado;
  });
}

// ---------------------------------------------------------------------------
// Avaliação de políticas — núcleo compartilhado por PRE-CHECK e POST-RECORD
// ---------------------------------------------------------------------------

export type CostCheckStatus = "ok" | "alerta" | "estourado";

export interface CostCheckResultado {
  escopo: CostPolicyEscopo;
  escopoValor: string;
  periodo: CostPolicyPeriodo;
  atual: Prisma.Decimal;
  limite: Prisma.Decimal;
  percentual: number;
  status: CostCheckStatus;
}

interface EscopoEstourado {
  escopo: CostPolicyEscopo;
  escopoValor: string;
  periodo: CostPolicyPeriodo;
  periodoChave: string;
}

interface AvaliarPoliticasResultado {
  checks: CostCheckResultado[];
  piorStatus: CostCheckStatus;
  escopoEstourado: EscopoEstourado | null;
}

/**
 * `modo: "reservar"` (PRE-CHECK): reserva otimista atômica por política
 * DIARIO/MENSAL; se estourar o limite, desfaz a reserva (a operação não vai
 * acontecer sem um Gate) — nunca deixa uma reserva "fantasma" presa.
 * `modo: "reconciliar"` (POST-RECORD): aplica o delta real definitivamente,
 * NUNCA desfaz — o custo já foi gasto de verdade, só pode ser corrigido por
 * um evento de ajuste novo, nunca por reescrever o passado (mesmo espírito
 * append-only do CostEvent/AuditLog).
 */
async function avaliarPoliticas(
  prisma: PrismaClient,
  tenantId: string,
  dims: DimensoesOperacao,
  custo: { custoTotal: Prisma.Decimal | null; moeda: string },
  opts: { modo: "reservar" | "reconciliar"; delta: Prisma.Decimal | null },
): Promise<AvaliarPoliticasResultado> {
  const checks: CostCheckResultado[] = [];
  let piorStatus: CostCheckStatus = "ok";
  let escopoEstourado: EscopoEstourado | null = null;

  if (custo.custoTotal === null) return { checks, piorStatus, escopoEstourado }; // custo desconhecido — nada a checar (nunca vira 0)

  const escopos = dimensoesParaEscopos(dims);
  const politicas = await withTenant(prisma, tenantId, (tx) =>
    tx.costPolicy.findMany({ where: { tenantId, ativo: true, OR: escopos.map((e) => ({ escopo: e.escopo, escopoValor: e.escopoValor })) } }),
  );

  const registrarPior = (status: CostCheckStatus, escopo: EscopoEstourado) => {
    if (status === "estourado") {
      piorStatus = "estourado";
      escopoEstourado ??= escopo;
    } else if (status === "alerta" && piorStatus === "ok") {
      piorStatus = "alerta";
    }
  };

  for (const politica of politicas) {
    if (politica.moeda !== custo.moeda) continue; // moeda diferente — sem conversor nesta rodada, não compara (ver README)

    if (politica.periodo === "POR_CHAMADA") {
      const atual = custo.custoTotal;
      const percentual = politica.limite.isZero() ? 100 : atual.div(politica.limite).mul(100).toNumber();
      const status: CostCheckStatus = atual.gt(politica.limite) ? "estourado" : percentual >= politica.alertaPercentual.toNumber() ? "alerta" : "ok";
      checks.push({ escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, atual, limite: politica.limite, percentual, status });
      registrarPior(status, { escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, periodoChave: "unica" });
      continue;
    }

    const periodoChave = periodoChaveAtual(politica.periodo, new Date())!;
    const delta = opts.modo === "reservar" ? custo.custoTotal : (opts.delta ?? custo.custoTotal);
    const novoAcumulado = await ajustarCostUsage(prisma, tenantId, {
      escopo: politica.escopo,
      escopoValor: politica.escopoValor,
      periodo: politica.periodo,
      periodoChave,
      moeda: custo.moeda,
      delta,
    });
    const percentual = politica.limite.isZero() ? 100 : novoAcumulado.div(politica.limite).mul(100).toNumber();

    if (novoAcumulado.gt(politica.limite)) {
      if (opts.modo === "reservar") {
        // desfaz a reserva otimista — a operação não deve prosseguir sem Gate
        await ajustarCostUsage(prisma, tenantId, {
          escopo: politica.escopo,
          escopoValor: politica.escopoValor,
          periodo: politica.periodo,
          periodoChave,
          moeda: custo.moeda,
          delta: delta.negated(),
        });
        checks.push({ escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, atual: novoAcumulado.sub(delta), limite: politica.limite, percentual, status: "estourado" });
      } else {
        checks.push({ escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, atual: novoAcumulado, limite: politica.limite, percentual, status: "estourado" });
      }
      registrarPior("estourado", { escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, periodoChave });
    } else {
      const status: CostCheckStatus = percentual >= politica.alertaPercentual.toNumber() ? "alerta" : "ok";
      checks.push({ escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, atual: novoAcumulado, limite: politica.limite, percentual, status });
      registrarPior(status, { escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, periodoChave });
    }
  }

  return { checks, piorStatus, escopoEstourado };
}

// ---------------------------------------------------------------------------
// Gate — correlação e consumo único (anti-loop)
// ---------------------------------------------------------------------------

interface ResolverAutorizacaoResultado {
  autorizado: boolean;
  novoGate: boolean;
  gateId: string;
}

/**
 * Ponto único de decisão "preciso de um Gate pra este estouro, ou já existe
 * um que resolve?". Três casos, nesta ordem:
 * 1. Já existe um Gate PENDENTE correlacionado a este exato
 *    (escopo,escopoValor,periodo,periodoChave) → reusa (nunca abre um
 *    segundo Gate pro mesmo estouro — é isso que impede o loop).
 * 2. Já existe um Gate APROVADO correlacionado, ainda não consumido →
 *    consome atomicamente (`INSERT...ON CONFLICT...DO NOTHING`, mesma
 *    garantia da reserva de CostUsage) e autoriza EXATAMENTE esta operação
 *    — autorização de uso único, nunca reaproveitável numa próxima chamada.
 * 3. Nenhum dos dois → abre um Gate novo (categoria FINANCEIRO, reaproveita
 *    T1 — não é um segundo sistema de aprovação).
 *
 * Não chama `criarGate`/`gates.ts` diretamente para não abrir uma
 * transação aninhada dentro do `withTenant` já aberto aqui — a lógica de
 * criação é replicada inline (mesmos campos, mesmo evento `gate_requested`).
 */
async function resolverAutorizacaoGateCusto(
  prisma: PrismaClient,
  params: EscopoEstourado & { tenantId: string; motivo: string; actorType: ActorType; actorLabel?: string | null; userId?: string | null },
): Promise<ResolverAutorizacaoResultado> {
  const chave = chaveCorrelacaoGateCusto(params);

  return withTenant(prisma, params.tenantId, async (tx) => {
    const gatesCorrelacionados = await tx.gate.findMany({
      where: { tenantId: params.tenantId, categoria: "FINANCEIRO", metadata: { path: ["costCorrelationKey"], equals: chave } },
      orderBy: { requestedAt: "desc" },
    });

    const pendente = gatesCorrelacionados.find((g) => g.status === "PENDENTE");
    if (pendente) return { autorizado: false, novoGate: false, gateId: pendente.id };

    const aprovado = gatesCorrelacionados.find((g) => g.status === "APROVADO");
    if (aprovado) {
      const consumo = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO cost_gate_consumos (id, tenant_id, gate_id, consumido_em)
        VALUES (gen_random_uuid()::text, ${params.tenantId}, ${aprovado.id}, now())
        ON CONFLICT (tenant_id, gate_id) DO NOTHING
        RETURNING id
      `;
      if (consumo.length > 0) return { autorizado: true, novoGate: false, gateId: aprovado.id };
      // já foi consumido por outra operação — cai para abrir um Gate novo abaixo (nova decisão humana necessária)
    }

    const solicitanteId = params.actorType === "HUMANO" ? (params.userId ?? null) : null;
    const solicitanteLabel = params.actorType !== "HUMANO" ? (params.actorLabel ?? null) : null;
    const acaoProposta = `Autorizar custo de IA/técnico acima do limite configurado (${params.escopo}${params.escopoValor ? " " + params.escopoValor : ""}, ${params.periodo})`;

    const novoGate = await tx.gate.create({
      data: {
        tenantId: params.tenantId,
        categoria: "FINANCEIRO",
        acaoProposta,
        motivo: params.motivo,
        solicitanteTipo: params.actorType,
        solicitanteId,
        solicitanteLabel,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { costCorrelationKey: chave, escopo: params.escopo, escopoValor: params.escopoValor, periodo: params.periodo, periodoChave: params.periodoChave },
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: solicitanteId,
      actorLabel: solicitanteLabel,
      acao: "gate_requested",
      entidade: "Gate",
      entidadeId: novoGate.id,
      resultado: "pendente",
      detalhe: { categoria: "FINANCEIRO", acaoProposta },
    });
    return { autorizado: false, novoGate: true, gateId: novoGate.id };
  });
}

// ---------------------------------------------------------------------------
// PRE-CHECK
// ---------------------------------------------------------------------------

export type PreCheckDecisao = "ALLOW" | "WARN" | "REQUIRE_GATE" | "BLOCK";

export interface PreCheckCustoResultado {
  decisao: PreCheckDecisao;
  custoEstimado: Prisma.Decimal | null;
  costKind: CostKind;
  moeda: string;
  gateId?: string;
  checks: CostCheckResultado[];
}

export interface PreCheckCustoParams extends DimensoesOperacao {
  tenantId: string;
  operation: string;
  usageEstimado: UsageInput;
  actorType: ActorType;
  actorLabel?: string | null;
  userId?: string | null;
}

/**
 * Responde ALLOW/WARN/REQUIRE_GATE/BLOCK ANTES de chamar o provider —
 * nunca chama nada externo se já estiver claramente bloqueado (quem decide
 * isso é o chamador, com base no retorno). REQUIRE_GATE = Gate novo criado,
 * a operação deve parar e esperar decisão humana. BLOCK = já existe um Gate
 * pendente pra este exato estouro (evita abrir um segundo) — a operação
 * também deve parar, só que apontando pro Gate já existente.
 */
export async function preCheckCusto(prisma: PrismaClient, params: PreCheckCustoParams): Promise<PreCheckCustoResultado> {
  const preco = await resolverPreco(prisma, { provider: params.provider, model: params.model, capability: params.capability });
  const { custoTotal, costKind } = calcularCusto(params.usageEstimado, preco, { estimado: true });
  const moeda = preco?.moeda ?? "USD";

  const { checks, piorStatus, escopoEstourado } = await avaliarPoliticas(
    prisma,
    params.tenantId,
    { provider: params.provider, model: params.model, capability: params.capability, agent: params.agent },
    { custoTotal, moeda },
    { modo: "reservar", delta: null },
  );

  if (piorStatus === "estourado" && escopoEstourado) {
    const resultadoGate = await resolverAutorizacaoGateCusto(prisma, {
      ...escopoEstourado,
      tenantId: params.tenantId,
      motivo: `Custo estimado (${params.provider}${params.model ? "/" + params.model : ""}, operação "${params.operation}") ultrapassaria o limite configurado para ${escopoEstourado.escopo}${escopoEstourado.escopoValor ? " " + escopoEstourado.escopoValor : ""} (${escopoEstourado.periodo}).`,
      actorType: params.actorType,
      actorLabel: params.actorLabel,
      userId: params.userId,
    });

    if (resultadoGate.autorizado) {
      await withTenant(prisma, params.tenantId, (tx) =>
        registrarEvento(tx, {
          tenantId: params.tenantId,
          actorType: params.actorType,
          userId: params.userId ?? null,
          actorLabel: params.actorLabel ?? null,
          acao: "COST_GATE_APPROVED_CONSUMED",
          entidade: "Gate",
          entidadeId: resultadoGate.gateId,
          resultado: "ok",
          detalhe: { escopo: escopoEstourado.escopo, escopoValor: escopoEstourado.escopoValor, periodo: escopoEstourado.periodo },
        }),
      );
      return { decisao: "ALLOW", custoEstimado: custoTotal, costKind, moeda, gateId: resultadoGate.gateId, checks };
    }

    await withTenant(prisma, params.tenantId, (tx) =>
      registrarEvento(tx, {
        tenantId: params.tenantId,
        actorType: params.actorType,
        userId: params.userId ?? null,
        actorLabel: params.actorLabel ?? null,
        acao: "COST_LIMIT_REACHED",
        entidade: "CostPolicy",
        entidadeId: resultadoGate.gateId,
        resultado: resultadoGate.novoGate ? "gate_criado" : "gate_pendente_reutilizado",
        detalhe: { escopo: escopoEstourado.escopo, escopoValor: escopoEstourado.escopoValor, periodo: escopoEstourado.periodo },
      }),
    );
    return { decisao: resultadoGate.novoGate ? "REQUIRE_GATE" : "BLOCK", custoEstimado: custoTotal, costKind, moeda, gateId: resultadoGate.gateId, checks };
  }

  if (piorStatus === "alerta") {
    await withTenant(prisma, params.tenantId, (tx) =>
      registrarEvento(tx, {
        tenantId: params.tenantId,
        actorType: params.actorType,
        userId: params.userId ?? null,
        actorLabel: params.actorLabel ?? null,
        acao: "COST_THRESHOLD_WARNING",
        entidade: "CostPolicy",
        resultado: "alerta",
        detalhe: { checks: checks.filter((c) => c.status === "alerta").map((c) => ({ escopo: c.escopo, escopoValor: c.escopoValor, periodo: c.periodo, percentual: c.percentual })) },
      }),
    );
    return { decisao: "WARN", custoEstimado: custoTotal, costKind, moeda, checks };
  }

  return { decisao: "ALLOW", custoEstimado: custoTotal, costKind, moeda, checks };
}

// ---------------------------------------------------------------------------
// POST-RECORD
// ---------------------------------------------------------------------------

export interface RegistrarCostEventParams extends DimensoesOperacao {
  tenantId: string;
  operation: string;
  usage: UsageInput;
  source: string;
  idempotencyKey?: string | null;
  /** Custo que preCheckCusto já reservou pra esta mesma operação (se houve pre-check) — usado pra reconciliar o delta em vez de contar duas vezes. */
  custoEstimadoReservado?: Prisma.Decimal | null;
  metadata?: unknown;
  actorType: ActorType;
  actorLabel?: string | null;
  userId?: string | null;
}

export interface RegistrarCostEventResultado {
  evento: CostEvent;
  duplicado: boolean; // true = idempotencyKey já existia, nada foi contabilizado de novo
  checks: CostCheckResultado[];
}

/**
 * Grava o custo REAL depois da operação. Idempotente quando `idempotencyKey`
 * é informado (`@@unique([tenantId, idempotencyKey])` — reenvio acidental
 * do mesmo evento não duplica). Nunca perde o custo real por causa de
 * estouro de limite — o evento é gravado sempre; o que muda é só o audit
 * (`COST_LIMIT_REACHED`/`COST_THRESHOLD_WARNING`) registrado depois.
 */
export async function registrarCostEvent(prisma: PrismaClient, params: RegistrarCostEventParams): Promise<RegistrarCostEventResultado> {
  const preco = await resolverPreco(prisma, { provider: params.provider, model: params.model, capability: params.capability });
  const { custoTotal, costKind } = calcularCusto(params.usage, preco, { estimado: false });
  const moeda = preco?.moeda ?? "USD";

  let duplicado = false;
  const evento = await withTenant(prisma, params.tenantId, async (tx) => {
    if (params.idempotencyKey) {
      const existente = await tx.costEvent.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: params.tenantId, idempotencyKey: params.idempotencyKey } },
      });
      if (existente) {
        duplicado = true;
        return existente;
      }
    }

    const novo = await tx.costEvent.create({
      data: {
        tenantId: params.tenantId,
        provider: params.provider,
        model: params.model ?? null,
        capability: params.capability ?? null,
        agent: params.agent ?? null,
        operation: params.operation,
        inputTokens: params.usage.inputTokens ?? null,
        outputTokens: params.usage.outputTokens ?? null,
        cachedTokens: params.usage.cachedTokens ?? null,
        unidade: preco?.unidade ?? null,
        quantidade: params.usage.quantidade ?? null,
        moeda,
        custoUnitario: null,
        custoTotal,
        costKind,
        source: params.source,
        idempotencyKey: params.idempotencyKey ?? null,
        metadata: params.metadata === undefined ? undefined : (params.metadata as Prisma.InputJsonValue),
      },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "COST_RECORDED",
      entidade: "CostEvent",
      entidadeId: novo.id,
      resultado: "ok",
      detalhe: { provider: params.provider, model: params.model ?? null, costKind, moeda },
    });
    return novo;
  });

  if (duplicado) {
    return { evento, duplicado: true, checks: [] };
  }

  let checks: CostCheckResultado[] = [];
  if (custoTotal !== null) {
    const delta = params.custoEstimadoReservado != null ? custoTotal.sub(params.custoEstimadoReservado) : custoTotal;
    const resultado = await avaliarPoliticas(
      prisma,
      params.tenantId,
      { provider: params.provider, model: params.model, capability: params.capability, agent: params.agent },
      { custoTotal, moeda },
      { modo: "reconciliar", delta },
    );
    checks = resultado.checks;

    if (resultado.piorStatus === "estourado") {
      await withTenant(prisma, params.tenantId, (tx) =>
        registrarEvento(tx, {
          tenantId: params.tenantId,
          actorType: "SISTEMA",
          acao: "COST_LIMIT_REACHED",
          entidade: "CostEvent",
          entidadeId: evento.id,
          resultado: "pos_registro",
          detalhe: { checks: resultado.checks.filter((c) => c.status === "estourado").map((c) => ({ escopo: c.escopo, escopoValor: c.escopoValor, periodo: c.periodo })) },
        }),
      );
    } else if (resultado.piorStatus === "alerta") {
      await withTenant(prisma, params.tenantId, (tx) =>
        registrarEvento(tx, {
          tenantId: params.tenantId,
          actorType: "SISTEMA",
          acao: "COST_THRESHOLD_WARNING",
          entidade: "CostEvent",
          entidadeId: evento.id,
          resultado: "pos_registro",
          detalhe: { checks: resultado.checks.filter((c) => c.status === "alerta").map((c) => ({ escopo: c.escopo, escopoValor: c.escopoValor, periodo: c.periodo })) },
        }),
      );
    }
  }

  return { evento, duplicado: false, checks };
}

// ---------------------------------------------------------------------------
// CostPolicy — CRUD administrativo (RBAC: cost.manage; ver apps/web)
// ---------------------------------------------------------------------------

export async function listarPoliticas(prisma: PrismaClient, tenantId: string): Promise<CostPolicy[]> {
  return withTenant(prisma, tenantId, (tx) => tx.costPolicy.findMany({ where: { tenantId }, orderBy: [{ escopo: "asc" }, { periodo: "asc" }] }));
}

export interface SalvarPoliticaParams {
  tenantId: string;
  escopo: CostPolicyEscopo;
  escopoValor?: string;
  periodo: CostPolicyPeriodo;
  limite: string | number;
  moeda?: string;
  alertaPercentual?: string | number;
  ativo?: boolean;
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

/** Cria ou atualiza a política do (escopo, escopoValor, período) — upsert, nunca duplica. */
export async function salvarPolitica(prisma: PrismaClient, params: SalvarPoliticaParams): Promise<CostPolicy> {
  const escopoValor = params.escopo === "TENANT" ? "" : (params.escopoValor?.trim() ?? "");
  const limite = new Prisma.Decimal(params.limite);
  const alertaPercentual = new Prisma.Decimal(params.alertaPercentual ?? 80);
  const moeda = params.moeda ?? "USD";
  const ativo = params.ativo ?? true;

  if (limite.isNegative()) throw new Error("salvarPolitica: limite não pode ser negativo");
  if (alertaPercentual.isNegative() || alertaPercentual.gt(100)) throw new Error("salvarPolitica: alertaPercentual precisa estar entre 0 e 100");
  if (params.escopo !== "TENANT" && !escopoValor) throw new Error(`salvarPolitica: escopoValor é obrigatório para escopo=${params.escopo}`);

  return withTenant(prisma, params.tenantId, async (tx) => {
    const politica = await tx.costPolicy.upsert({
      where: { tenantId_escopo_escopoValor_periodo: { tenantId: params.tenantId, escopo: params.escopo, escopoValor, periodo: params.periodo } },
      update: { limite, moeda, alertaPercentual, ativo },
      create: { tenantId: params.tenantId, escopo: params.escopo, escopoValor, periodo: params.periodo, limite, moeda, alertaPercentual, ativo },
    });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "COST_POLICY_CHANGED",
      entidade: "CostPolicy",
      entidadeId: politica.id,
      resultado: "salva",
      detalhe: { escopo: politica.escopo, escopoValor: politica.escopoValor, periodo: politica.periodo, limite: politica.limite.toString(), moeda: politica.moeda, ativo: politica.ativo },
    });
    return politica;
  });
}

export async function removerPolitica(
  prisma: PrismaClient,
  params: { tenantId: string; politicaId: string; actorType: ActorType; userId?: string | null; actorLabel?: string | null },
): Promise<boolean> {
  return withTenant(prisma, params.tenantId, async (tx) => {
    const existente = await tx.costPolicy.findUnique({ where: { id: params.politicaId } });
    if (!existente || existente.tenantId !== params.tenantId) return false;
    await tx.costPolicy.delete({ where: { id: params.politicaId } });
    await registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "COST_POLICY_CHANGED",
      entidade: "CostPolicy",
      entidadeId: params.politicaId,
      resultado: "removida",
      detalhe: { escopo: existente.escopo, escopoValor: existente.escopoValor, periodo: existente.periodo },
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Consumo atual (para a UI — soma direta de CostEvent, independente de
// existir política; CostUsage só acumula escopos com política ativa).
// ---------------------------------------------------------------------------

export interface ConsumoAtual {
  hoje: Prisma.Decimal;
  mes: Prisma.Decimal;
  moeda: string;
}

export async function obterConsumoAtual(prisma: PrismaClient, tenantId: string, moeda = "USD"): Promise<ConsumoAtual> {
  const agora = new Date();
  const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));

  return withTenant(prisma, tenantId, async (tx) => {
    const [dia, mes] = await Promise.all([
      tx.costEvent.aggregate({ where: { tenantId, moeda, custoTotal: { not: null }, createdAt: { gte: inicioDia } }, _sum: { custoTotal: true } }),
      tx.costEvent.aggregate({ where: { tenantId, moeda, custoTotal: { not: null }, createdAt: { gte: inicioMes } }, _sum: { custoTotal: true } }),
    ]);
    return { hoje: dia._sum.custoTotal ?? new Prisma.Decimal(0), mes: mes._sum.custoTotal ?? new Prisma.Decimal(0), moeda };
  });
}
