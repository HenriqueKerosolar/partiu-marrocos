/**
 * Finance Core (PM-CRM-FIN-ARCH-01) — contratos/tipos, sem implementação
 * fiscal concreta. Nada aqui grava em banco ainda (nenhuma migration nesta
 * rodada) — são as interfaces que o resto do código (Finance Core real,
 * quando construído; Country Packs; UI) vai usar, definidas agora pra não
 * fechar a arquitetura errado depois (ver seção 21/22 da autorização).
 *
 * Princípio central que estes tipos existem pra impor estruturalmente
 * (seção 9 da autorização): país do cliente, mercado, idioma, moeda, país
 * da prestação do serviço e entidade jurídica/faturadora são conceitos
 * DIFERENTES — nunca a mesma coisa, nunca inferidos um do outro por
 * `if idioma === "pt-PT"` ou equivalente. A determinação fiscal de verdade
 * é sempre CountryPack + LegalEntity + FiscalProfile, nunca um desses
 * campos sozinho.
 */

/** País onde o cliente está — dado de cadastro, não decide nada fiscal sozinho. */
export type CustomerCountry = string; // ISO 3166-1 alpha-2, ex. "BR"

/** Mercado comercial atendido (ex.: "BR", "PT") — decide idioma/moeda padrão de UX, nunca tributação. */
export interface Market {
  codigo: string; // livre, não é enum fechado — novos mercados não devem exigir alterar tipo
  nome: string;
  idiomaPadrao: string; // BCP 47, ex. "pt-BR"
  idiomasPermitidos: string[];
  moedaPadrao: string; // ISO 4217
  moedasPermitidas: string[];
  timezone: string; // IANA tz de referência pra exibição/agenda
}

/**
 * Empresa juridicamente responsável por uma operação/faturamento. Uma
 * mesma plataforma pode ter futuramente mais de uma (ex.: entidade no
 * Brasil + entidade em Portugal). `fiscalProfileId` é uma referência opaca
 * de propósito — nenhum FiscalProfile concreto existe ainda nesta rodada,
 * então nunca é resolvido/validado aqui.
 */
export interface LegalEntity {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName?: string | null;
  country: string; // ISO 3166-1 alpha-2 — país de registro da entidade, nunca confundir com CustomerCountry
  taxIdentifier?: string | null; // NIF/CNPJ/etc — formato varia por país, não validado aqui
  baseCurrency: string; // ISO 4217
  timezone: string; // IANA tz
  fiscalProfileId?: string | null;
  status: "ATIVA" | "INATIVA";
  metadata?: unknown;
}

/**
 * Conjunto de regras fiscais aplicáveis — hoje só o contrato existe.
 * Nenhum FiscalProfile real é construído nesta rodada (isso exigiria
 * validação de contador/especialista, explicitamente fora de escopo).
 * `jurisdiction` é a jurisdição fiscal determinada pelas regras — nunca
 * assumida a partir de idioma/moeda/país do cliente.
 */
export interface FiscalProfile {
  id: string;
  jurisdiction: string; // ex.: "PT", "BR" — mas é resultado de uma determinação, não um espelho de CustomerCountry
  countryPackId: string;
  vigenteDesde: Date;
  metadata?: unknown;
}

/**
 * Contrato que um Country Pack precisa satisfazer para plugar no Finance
 * Core. Nenhuma implementação concreta (Portugal, Brasil) existe nesta
 * rodada — ver `country-pack-registry.ts`. Cada método é action opcional
 * de propósito: um pack pode implementar só o que já tem regra validada,
 * sem precisar fingir suporte ao resto.
 */
export interface CountryPack {
  id: string; // ex.: "PT", "BR" — mesmo valor usado como jurisdiction em FiscalProfile
  nome: string;
  /** Calcula imposto aplicável a uma operação — ausente até haver regra validada. */
  calcularImposto?(input: { valor: number; moeda: string; categoria?: string }): { imposto: number; aliquota: number; detalhe?: unknown };
  /** Lista documentos fiscais obrigatórios pra um tipo de operação. */
  documentosObrigatorios?(input: { tipoOperacao: string }): string[];
  /** Valida se os dados de uma LegalEntity satisfazem os requisitos deste pack (ex.: formato de NIF). */
  validarLegalEntity?(entity: LegalEntity): { valido: boolean; erros?: string[] };
}

/**
 * Câmbio ≠ preço (seção 12 da autorização) — este tipo representa só a
 * COTAÇÃO observada, nunca decide sozinho o preço público de nada. Alterar
 * preço/proposta comercial a partir disso é decisão humana via Gate,
 * nunca automática.
 */
export interface ExchangeRateQuote {
  baseCurrency: string;
  transactionCurrency: string;
  displayCurrency?: string;
  rate: number;
  source: string;
  timestamp: Date;
  fxMargin?: number;
  roundingRule?: string;
  lockedExchangeRate?: boolean;
  priceValidity?: Date;
}

/**
 * Finance Core Foundation 02 (PM-NIGHT-RUN-01, Etapa 4) — motor financeiro
 * (movimentação de dinheiro: a receber, a pagar, transação, comissão,
 * reembolso, categoria, centro de custo/receita).
 *
 * Avaliação explícita (matriz completa em
 * `docs/FINANCE_CORE_FOUNDATION_02_FECHAMENTO.md`): nenhuma das 9
 * entidades abaixo tem hoje um consumidor real no produto — não existe
 * Proposal/Booking/Payment implementado ainda, e mesmo a etapa seguinte
 * (Proposal Foundation 01) grava preço/custo/margem DENTRO do próprio
 * Proposal, não aqui. Mesma disciplina já aplicada a `Market`/`LegalEntity`
 * acima (F2): ficam como contrato TypeScript puro, **ZERO tabela/migration
 * nesta rodada** — "não construir um ERP que ninguém usa ainda" (princípio
 * já estabelecido em PM-CRM-FIN-ARCH-01).
 *
 * Referências a entidades futuras (Proposal/Booking/Trip/Customer/
 * Campaign/Supplier/Partner) são sempre um id OPAQUE (`string`), nunca uma
 * relação Prisma de verdade — não inventar FK pra tabela que não existe.
 * `Lead` é a única referenciada abaixo que já é uma tabela real hoje;
 * ainda assim fica como `string` solta aqui (não uma FK), porque a própria
 * entidade que a referencia (ex. `FinancialTransaction`) também não é uma
 * tabela — uma FK só faz sentido quando as duas pontas existem de verdade.
 *
 * Quando qualquer uma destas for promovida a tabela real (exigindo um
 * consumidor genuíno — Booking/Payment construído, não hipotético): RLS é
 * obrigatório desde o primeiro dia (mesmo padrão de toda tabela
 * tenant-scoped já existente), toda ação sensível (confirmar pagamento,
 * aprovar reembolso, liberar comissão) passa por Audit, e qualquer ação de
 * risco (mover dinheiro de verdade) passa por Gate — autoaprovação por
 * agente continua estruturalmente impossível, sem exceção.
 */

export type FinancialAccountTipo = "CAIXA" | "BANCO" | "GATEWAY_PAGAMENTO" | "CARTAO_CORPORATIVO";
export type FinancialCategoryNatureza = "RECEITA" | "DESPESA";
export type FinancialTransactionNatureza = "CREDITO" | "DEBITO";
export type ReceivableStatus = "PENDENTE" | "RECEBIDO" | "ATRASADO" | "CANCELADO";
export type PayableStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "CANCELADO";

/** Conta financeira (caixa, banco, gateway) pertencente a uma `LegalEntity`. */
export interface FinancialAccount {
  id: string;
  tenantId: string;
  legalEntityId: string; // referência opaca a LegalEntity (contrato, não FK — LegalEntity também não é tabela ainda)
  nome: string;
  tipo: FinancialAccountTipo;
  moeda: string; // ISO 4217
  saldoInicial: number;
  status: "ATIVA" | "INATIVA";
}

/** Taxonomia de receita/despesa — hierarquia opcional (ex.: "Hospedagem" > "Hotel", "Riad"). */
export interface FinancialCategory {
  id: string;
  tenantId: string;
  nome: string;
  natureza: FinancialCategoryNatureza;
  categoriaPaiId?: string | null;
}

/** Agrupamento organizacional de custo (ex.: "Operação BR", "Operação PT") — sem ligação com CostEvent de T2 (custo operacional de IA é um domínio diferente, não confundir). */
export interface CostCenter {
  id: string;
  tenantId: string;
  nome: string;
  ativo: boolean;
}

/** Agrupamento organizacional de receita (ex.: "Pacotes fechados", "Serviços avulsos"). */
export interface RevenueCenter {
  id: string;
  tenantId: string;
  nome: string;
  ativo: boolean;
}

/** Movimentação financeira única (crédito ou débito) numa `FinancialAccount`. */
export interface FinancialTransaction {
  id: string;
  tenantId: string;
  accountId: string;
  categoryId?: string | null;
  costCenterId?: string | null;
  revenueCenterId?: string | null;
  natureza: FinancialTransactionNatureza;
  valor: number;
  moeda: string;
  data: Date;
  descricao: string;
  // Referências opacas a entidades ainda não construídas (preparar, não forçar) — nenhuma é FK real.
  leadId?: string | null;
  proposalId?: string | null;
  bookingId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
}

/** Valor a receber do cliente (referencia Lead/Proposal — futura Booking/Payment que efetivamente cobra). */
export interface Receivable {
  id: string;
  tenantId: string;
  transactionId?: string | null;
  leadId?: string | null;
  proposalId?: string | null;
  valor: number;
  moeda: string;
  vencimento: Date;
  status: ReceivableStatus;
}

/** Valor a pagar a um fornecedor/parceiro (Supplier/Partner ainda não são tabelas). */
export interface Payable {
  id: string;
  tenantId: string;
  transactionId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  valor: number;
  moeda: string;
  vencimento: Date;
  status: PayableStatus;
}

// `Commission` e `Refund` foram removidos deste arquivo de contratos
// (PM-NIGHT-RUN-02, Etapa 3 — Finance Core Real 01):
// - `Commission` foi PROMOVIDA a tabela real (`packages/db/src/commission.ts`,
//   model `Commission` no schema) — Booking.responsavelId já é um
//   consumidor real. Manter os dois nomes conflitaria com o tipo gerado
//   pelo Prisma (`@prisma/client` também exporta `Commission`).
// - `Refund` nunca precisou virar tabela própria — já está inteiramente
//   resolvido por `Payment.status` (`REEMBOLSADO`/`PARCIALMENTE_REEMBOLSADO`,
//   Payment Foundation 01) + `solicitarEstornoPayment`/
//   `confirmarEstornoAposAprovacaoGate`. Uma tabela `Refund` separada
//   duplicaria o mesmo dado que `Payment` já guarda.
