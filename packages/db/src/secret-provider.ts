import crypto from "node:crypto";
import type { PrismaClient, SecretFinalidade, ActorType } from "@prisma/client";
import { withTenant } from "./tenant-db";
import { registrarEvento } from "./audit";

/**
 * Secret Provider (PM-BLOQ-001) — elimina o bloqueador de produção
 * `Tenant.aiApiKey`/`WhatsappAccount.accessToken`/`appSecret` em texto
 * plano. Domínio (Tenant, WhatsappAccount) guarda só um `secretRef` opaco
 * (o id de uma linha de `Secret`) — nunca o valor. O valor real só existe em
 * memória pelo tempo da operação autorizada (ex.: gerar uma resposta do
 * Yalla), nunca em log, AuditLog, Gate.metadata, resposta HTTP ou console.
 *
 * Duas camadas neste arquivo, de propósito:
 *
 * 1. `SecretProvider` (contrato) + `LocalSecretProvider` — só
 *    armazenamento/cifragem, sem auditoria. É a peça trocável: um provider
 *    de PRODUÇÃO (AWS Secrets Manager/KMS, Google Secret Manager, Azure Key
 *    Vault, HashiCorp Vault, etc.) implementaria o mesmo contrato sem tocar
 *    na tabela `secrets` — devolveria uma referência externa (ex.: ARN)
 *    como `secretRef`. Nenhum vendor foi escolhido nesta rodada; a
 *    arquitetura só deixa o encaixe pronto (ver `getSecretProvider`).
 * 2. `configurarSecret`/`obterSecret`/`rotacionarSecret`/`removerSecret` —
 *    as funções que o resto do app de fato chama. Cada uma chama o
 *    provider e grava o evento de auditoria correspondente (T1,
 *    `registrarEvento`) — sempre metadados (tenant/finalidade/resultado),
 *    nunca o valor. Mesma divisão de responsabilidade de `gates.ts`: lógica
 *    de negócio + auditoria juntas, provider por trás delas.
 *
 * Implementação LOCAL/DEV (`LocalSecretProvider`): AES-256-GCM via
 * `node:crypto` (primitiva nativa do Node, não é criptografia inventada).
 * Master key vem de `SECRET_PROVIDER_MASTER_KEY` (env, 32 bytes base64) —
 * NUNCA fica junto do ciphertext (fica só na variável de ambiente do
 * processo, nunca na tabela `secrets`). Deliberadamente NÃO depende de
 * Windows DPAPI nem de nenhum serviço externo — roda em qualquer SO, sem
 * infraestrutura de nuvem obrigatória.
 */

// ---------------------------------------------------------------------------
// Camada 1 — contrato + implementação local (sem auditoria)
// ---------------------------------------------------------------------------

export class SecretProviderIndisponivelError extends Error {
  constructor(motivo: string) {
    super(`SecretProvider indisponível: ${motivo}`);
    this.name = "SecretProviderIndisponivelError";
  }
}

export interface SalvarSecretParams {
  tenantId: string;
  finalidade: SecretFinalidade;
  valor: string;
}

export interface ObterSecretParams {
  tenantId: string;
  secretRef: string;
}

export interface RemoverSecretParams {
  tenantId: string;
  secretRef: string;
}

export interface RotacionarSecretParams {
  tenantId: string;
  secretRef: string;
  novoValor: string;
}

/**
 * Contrato provider-agnóstico. Todo método é escopado por tenantId — quem
 * implementa é responsável por nunca deixar um tenant alcançar o secretRef
 * de outro (a implementação local usa `withTenant`/RLS para isso, do mesmo
 * jeito que o resto do app).
 */
export interface SecretProvider {
  salvar(params: SalvarSecretParams): Promise<{ secretRef: string }>;
  /** Retorna null quando o secretRef não existe (ou não pertence a este tenant) — nunca lança para "não encontrado". */
  obter(params: ObterSecretParams): Promise<string | null>;
  /** Idempotente: remover um secretRef que já não existe não é erro. */
  remover(params: RemoverSecretParams): Promise<void>;
  /** Mantém o MESMO secretRef (troca só o conteúdo) — é isso que permite rotação sem mudar nenhum código de domínio. Retorna null se o secretRef não existe neste tenant. */
  rotacionar(params: RotacionarSecretParams): Promise<{ secretRef: string } | null>;
}

const ALGORITMO = "aes-256-gcm" as const;
const LOCAL_KEY_ID = "local-v1";
const GCM_IV_BYTES = 12; // nonce de 96 bits — recomendação padrão do GCM

function obterMasterKey(): Buffer {
  const raw = process.env.SECRET_PROVIDER_MASTER_KEY;
  if (!raw) {
    throw new SecretProviderIndisponivelError("variável de ambiente SECRET_PROVIDER_MASTER_KEY não definida");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new SecretProviderIndisponivelError("SECRET_PROVIDER_MASTER_KEY não é base64 válido");
  }
  if (key.length !== 32) {
    throw new SecretProviderIndisponivelError("SECRET_PROVIDER_MASTER_KEY deve decodificar para 32 bytes (AES-256)");
  }
  return key;
}

interface Envelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  algoritmo: string;
  keyId: string;
}

/** Lança SecretProviderIndisponivelError se a master key não estiver configurada — nunca cifra "sem chave". */
function cifrar(valor: string): Envelope {
  const key = obterMasterKey();
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    algoritmo: ALGORITMO,
    keyId: LOCAL_KEY_ID,
  };
}

/**
 * Lança em qualquer falha (master key ausente, algoritmo desconhecido,
 * autenticação do GCM falhando por ciphertext adulterado) — nunca retorna
 * um valor "parcial". Quem chama (`obterSecret` abaixo) decide o que fazer
 * com a falha (fail-closed + evento de auditoria).
 */
function decifrar(envelope: Envelope): string {
  if (envelope.algoritmo !== ALGORITMO) {
    throw new Error(`algoritmo de cifragem desconhecido: ${envelope.algoritmo}`);
  }
  const key = obterMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITMO, key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Provider local/dev — único disponível nesta rodada. Guarda o envelope
 * cifrado na tabela `secrets` (tenant-scoped, RLS). Cada método abre sua
 * própria transação `withTenant` — mesmo padrão de isolamento usado em todo
 * o resto do app (gates.ts); um tenant nunca alcança o
 * secretRef de outro, não por checagem de aplicação, mas porque a policy de
 * RLS já filtra a linha antes de chegar aqui.
 */
function criarLocalSecretProvider(prisma: PrismaClient): SecretProvider {
  return {
    async salvar({ tenantId, finalidade, valor }) {
      const envelope = cifrar(valor);
      return withTenant(prisma, tenantId, async (tx) => {
        const secret = await tx.secret.create({
          data: { tenantId, finalidade, ciphertext: envelope.ciphertext, iv: envelope.iv, authTag: envelope.authTag, algoritmo: envelope.algoritmo, keyId: envelope.keyId },
        });
        return { secretRef: secret.id };
      });
    },

    async obter({ tenantId, secretRef }) {
      return withTenant(prisma, tenantId, async (tx) => {
        const secret = await tx.secret.findUnique({ where: { id: secretRef } });
        if (!secret || secret.tenantId !== tenantId) return null;
        return decifrar(secret);
      });
    },

    async remover({ tenantId, secretRef }) {
      await withTenant(prisma, tenantId, async (tx) => {
        const secret = await tx.secret.findUnique({ where: { id: secretRef } });
        if (!secret || secret.tenantId !== tenantId) return;
        await tx.secret.delete({ where: { id: secretRef } });
      });
    },

    async rotacionar({ tenantId, secretRef, novoValor }) {
      const envelope = cifrar(novoValor);
      return withTenant(prisma, tenantId, async (tx) => {
        const existente = await tx.secret.findUnique({ where: { id: secretRef } });
        if (!existente || existente.tenantId !== tenantId) return null;
        const atualizado = await tx.secret.update({
          where: { id: secretRef },
          data: { ciphertext: envelope.ciphertext, iv: envelope.iv, authTag: envelope.authTag, algoritmo: envelope.algoritmo, keyId: envelope.keyId },
        });
        return { secretRef: atualizado.id };
      });
    },
  };
}

/**
 * Fábrica do provider ativo — lê `SECRET_PROVIDER` (default "local"). Só
 * "local" está implementado nesta rodada; qualquer outro valor lança um
 * erro claro em vez de silenciosamente cair para texto plano ou escolher um
 * vendor não autorizado. Um provider de produção real (AWS/GCP/Azure/Vault)
 * é o "PRÓXIMO BLOQUEADOR" — a arquitetura só deixa o contrato pronto para
 * receber essa implementação sem mudar `configurarSecret`/`obterSecret`/etc.
 */
export function getSecretProvider(prisma: PrismaClient): SecretProvider {
  const kind = process.env.SECRET_PROVIDER ?? "local";
  if (kind === "local") return criarLocalSecretProvider(prisma);
  throw new SecretProviderIndisponivelError(
    `provider "${kind}" ainda não implementado — só "local" está disponível nesta rodada (PM-BLOQ-001); um provider de produção fica registrado como próximo bloqueador`,
  );
}

// ---------------------------------------------------------------------------
// Camada 2 — funções com auditoria, usadas pelo resto do app
// ---------------------------------------------------------------------------

export interface AtorSecret {
  actorType: ActorType;
  userId?: string | null;
  actorLabel?: string | null;
}

async function registrarFalhaAcesso(prisma: PrismaClient, tenantId: string, secretRef: string | null, ator: AtorSecret, motivo: string, finalidade?: SecretFinalidade) {
  await withTenant(prisma, tenantId, (tx) =>
    registrarEvento(tx, {
      tenantId,
      actorType: ator.actorType,
      userId: ator.userId ?? null,
      actorLabel: ator.actorLabel ?? null,
      acao: "SECRET_ACCESS_FAILED",
      entidade: "Secret",
      entidadeId: secretRef,
      resultado: "falha",
      detalhe: { motivo, ...(finalidade ? { finalidade } : {}) },
    }),
  );
}

/** Primeira configuração de um segredo (ainda não existe secretRef para esta finalidade). Grava SECRET_CONFIGURED. */
export async function configurarSecret(
  prisma: PrismaClient,
  params: { tenantId: string; finalidade: SecretFinalidade; valor: string } & AtorSecret,
): Promise<{ secretRef: string }> {
  const provider = getSecretProvider(prisma);
  let resultado: { secretRef: string };
  try {
    resultado = await provider.salvar({ tenantId: params.tenantId, finalidade: params.finalidade, valor: params.valor });
  } catch (err) {
    await registrarFalhaAcesso(prisma, params.tenantId, null, params, err instanceof SecretProviderIndisponivelError ? "provider_indisponivel" : "falha_ao_cifrar", params.finalidade);
    throw err;
  }

  await withTenant(prisma, params.tenantId, (tx) =>
    registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "SECRET_CONFIGURED",
      entidade: "Secret",
      entidadeId: resultado.secretRef,
      resultado: "ok",
      detalhe: { finalidade: params.finalidade },
    }),
  );

  return resultado;
}

/**
 * Resolve um secretRef para o valor real — só para uso imediato (ex.:
 * chamar a API do provedor de IA/WhatsApp), nunca para guardar em variável
 * de longa duração/cache. Fail-closed: qualquer falha (provider
 * indisponível, ciphertext corrompido) grava SECRET_ACCESS_FAILED e
 * retorna null — nunca lança para o chamador, para nunca virar um fallback
 * inseguro por acidente (ver yalla.ts).
 */
export async function obterSecret(prisma: PrismaClient, params: { tenantId: string; secretRef: string } & AtorSecret): Promise<string | null> {
  const provider = getSecretProvider(prisma);
  try {
    return await provider.obter({ tenantId: params.tenantId, secretRef: params.secretRef });
  } catch (err) {
    await registrarFalhaAcesso(prisma, params.tenantId, params.secretRef, params, err instanceof SecretProviderIndisponivelError ? "provider_indisponivel" : "falha_ao_decifrar");
    return null;
  }
}

/** Troca o valor mantendo o mesmo secretRef — domínio não precisa mudar nada. Grava SECRET_ROTATED. Retorna null se o secretRef não existir neste tenant. */
export async function rotacionarSecret(
  prisma: PrismaClient,
  params: { tenantId: string; secretRef: string; novoValor: string; finalidade: SecretFinalidade } & AtorSecret,
): Promise<{ secretRef: string } | null> {
  const provider = getSecretProvider(prisma);
  let resultado: { secretRef: string } | null;
  try {
    resultado = await provider.rotacionar({ tenantId: params.tenantId, secretRef: params.secretRef, novoValor: params.novoValor });
  } catch (err) {
    await registrarFalhaAcesso(prisma, params.tenantId, params.secretRef, params, err instanceof SecretProviderIndisponivelError ? "provider_indisponivel" : "falha_ao_cifrar", params.finalidade);
    throw err;
  }
  if (!resultado) return null;

  await withTenant(prisma, params.tenantId, (tx) =>
    registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "SECRET_ROTATED",
      entidade: "Secret",
      entidadeId: resultado!.secretRef,
      resultado: "ok",
      detalhe: { finalidade: params.finalidade },
    }),
  );

  return resultado;
}

/** Remove definitivamente um secret. Idempotente (remover algo já removido não falha). Grava SECRET_REMOVED só quando havia algo para remover. */
export async function removerSecret(
  prisma: PrismaClient,
  params: { tenantId: string; secretRef: string; finalidade: SecretFinalidade } & AtorSecret,
): Promise<void> {
  const provider = getSecretProvider(prisma);
  await provider.remover({ tenantId: params.tenantId, secretRef: params.secretRef });

  await withTenant(prisma, params.tenantId, (tx) =>
    registrarEvento(tx, {
      tenantId: params.tenantId,
      actorType: params.actorType,
      userId: params.userId ?? null,
      actorLabel: params.actorLabel ?? null,
      acao: "SECRET_REMOVED",
      entidade: "Secret",
      entidadeId: params.secretRef,
      resultado: "ok",
      detalhe: { finalidade: params.finalidade },
    }),
  );
}
