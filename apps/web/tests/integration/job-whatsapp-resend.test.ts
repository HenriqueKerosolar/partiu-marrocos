import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant, submeterJob } from "@partiumarrocos/db";
import { processarJobAteConcluir, reivindicarUmaTentativa } from "../helpers/job-queue";
import { MOCK_FALHA_UMA_VEZ, MOCK_JANELA_FECHADA, MOCK_HANG, contarChamadasMock } from "../helpers/whatsapp-mock";

/**
 * T5 — primeiro caso real: `whatsapp.enviar_mensagem`. Prova ponta a ponta
 * através do Job Engine de verdade (não um mock do motor). A chamada de
 * rede real (Meta Cloud API) é substituída por um servidor HTTP real e
 * compartilhado (`tests/setup/whatsapp-mock-server.ts`, via `globalSetup`)
 * — NÃO por `vi.stubGlobal("fetch")` local: sob a fila global do Job Engine
 * (T5, confirmado por leitura direta de engine.ts — sem filtro de
 * tipo/tenant no claim, por design de produção), o job submetido aqui pode
 * ser reivindicado e executado pelo drain loop de OUTRO arquivo de teste
 * rodando em paralelo, cujo `fetch` NÃO seria interceptado por um stub
 * local deste arquivo (Bug #4 real do PM-CONV-06 §5E, achado ao rodar este
 * arquivo sozinho 8/8 vezes sem falha vs. ~3/10 falhas junto da suíte
 * completa). O comportamento simulado (sucesso/falha transitória/janela
 * fechada/nunca responder) agora viaja DENTRO do payload do job via
 * marcadores em `texto` — então é determinístico não importa qual
 * arquivo/thread acabe executando-o. Mesma configuração de conta que
 * `secret-provider-wiring.test.ts` já usa.
 */
const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { salvarContaWhatsapp } = await import("@/app/actions/whatsapp");
await import("@/lib/jobs"); // registra whatsapp.enviar_mensagem
// PM-CONV-06, §5E — "teste.whatsapp_timeout_curto" agora é registrado em
// um módulo compartilhado (não mais aqui) — todo arquivo que participa da
// fila global de teste precisa conhecer TODOS os tipos em jogo, senão o
// motor DEAD_LETTER a job quando outro arquivo a reivindica primeiro (ver
// tests/helpers/register-test-job-types.ts para a explicação completa).
await import("../helpers/register-test-job-types");

let tenant: { id: string };
let admin: { id: string; email: string };

function ctx(tenantId: string, chaves: string[]) {
  return { sessionId: "s1", user: { id: admin.id, email: admin.email, mustChangePassword: false }, tenantId, role: null, permissions: new Set(chaves) };
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (job whatsapp teste)", slug: `jw-${Date.now()}` } });
  admin = await prisma.user.create({ data: { email: `job-whatsapp-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: admin.id, tenantId: tenant.id, roleId: role.id } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  mockRequireAuthContext.mockReset();
  await withSystem(prisma, async (tx) => {
    await tx.execution.deleteMany({ where: { tenantId: tenant.id } });
    await tx.job.deleteMany({ where: { tenantId: tenant.id } });
  });
});

const TELEFONE_TESTE = "5521999998888"; // normalizado (só dígitos) — mesmo valor em todo teste, a chave de contagem do mock já é única por phoneNumberId

async function criarContaEConversa(sufixo: string) {
  mockRequireAuthContext.mockResolvedValue(ctx(tenant.id, ["whatsapp.manage"]));
  const phoneNumberId = `pnid-job-${sufixo}-${Date.now()}`;
  await salvarContaWhatsapp(formData({ label: "Conta job", phoneNumberId, accessToken: `tok-${sufixo}`, verifyToken: `verify-${sufixo}-${Date.now()}` }));
  const conta = await withTenant(prisma, tenant.id, (tx) => tx.whatsappAccount.findFirstOrThrow({ where: { tenantId: tenant.id, phoneNumberId } }));
  const contato = await withTenant(prisma, tenant.id, (tx) => tx.contact.create({ data: { tenantId: tenant.id, nome: `Contato ${sufixo}`, telefone: TELEFONE_TESTE } }));
  const conversa = await withTenant(prisma, tenant.id, (tx) => tx.conversation.create({ data: { tenantId: tenant.id, contactId: contato.id, accountId: conta.id, channel: "WHATSAPP" } }));
  return { conta, contato, conversa };
}

describe("whatsapp.enviar_mensagem — caminho feliz", () => {
  it("job SUCCEEDED envia via Cloud API (mock HTTP compartilhado) e grava a Message de saída", async () => {
    const { conta, conversa } = await criarContaEConversa("feliz");

    const { job } = await submeterJob(prisma, {
      tenantId: tenant.id,
      type: "whatsapp.enviar_mensagem",
      payload: { conversationId: conversa.id, texto: "resposta via job", senderType: "IA" },
      source: "teste",
      actorType: "AGENTE",
      actorLabel: "yalla",
    });

    const final = await processarJobAteConcluir(prisma, job.id, tenant.id, "worker-teste");
    expect(final.status).toBe("SUCCEEDED");

    const mensagem = await withTenant(prisma, tenant.id, (tx) => tx.message.findFirstOrThrow({ where: { conversationId: conversa.id, direction: "SAIDA" } }));
    expect(mensagem.conteudo).toBe("resposta via job");
    expect(mensagem.externalId).toMatch(/^wamid\.mock-/);

    const { count } = await contarChamadasMock(conta.phoneNumberId, TELEFONE_TESTE);
    expect(count).toBe(1);
  });
});

describe("whatsapp.enviar_mensagem — falha transitória vira retry, depois sucesso (T5 §22/§23)", () => {
  it("1ª tentativa falha (500), Job vai pra RETRY_WAIT; 2ª tentativa (retry manual do worker) sucede — mensagem gravada só uma vez", async () => {
    const { conta, conversa } = await criarContaEConversa("retry");

    const { job } = await submeterJob(prisma, {
      tenantId: tenant.id,
      type: "whatsapp.enviar_mensagem",
      payload: { conversationId: conversa.id, texto: `resposta com retry ${MOCK_FALHA_UMA_VEZ}`, senderType: "IA" },
      source: "teste",
      actorType: "AGENTE",
      actorLabel: "yalla",
    });

    await reivindicarUmaTentativa(prisma, job.id, "worker-teste");
    const aposFalha = await withTenant(prisma, tenant.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(aposFalha.status).toBe("RETRY_WAIT");

    await new Promise((r) => setTimeout(r, 2100)); // backoffBaseMs=2000 do job type real

    await reivindicarUmaTentativa(prisma, job.id, "worker-teste");

    const final = await withTenant(prisma, tenant.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("SUCCEEDED");

    const mensagens = await withTenant(prisma, tenant.id, (tx) => tx.message.findMany({ where: { conversationId: conversa.id, direction: "SAIDA" } }));
    expect(mensagens).toHaveLength(1); // nunca duplicou a mensagem gravada por conta do retry

    const { count } = await contarChamadasMock(conta.phoneNumberId, TELEFONE_TESTE);
    expect(count).toBe(2);
  }, 15000);
});

describe("whatsapp.enviar_mensagem — idempotência de submissão (webhook redelivery)", () => {
  it("mesma idempotencyKey (mesmo id de mensagem recebida da Meta) duas vezes: só um Job", async () => {
    const { conversa } = await criarContaEConversa("idem");
    const idempotencyKey = `yalla-reply-wamid-entrada-${Date.now()}`;

    const r1 = await submeterJob(prisma, { tenantId: tenant.id, type: "whatsapp.enviar_mensagem", payload: { conversationId: conversa.id, texto: "x", senderType: "IA" }, idempotencyKey, source: "teste", actorType: "AGENTE", actorLabel: "yalla" });
    const r2 = await submeterJob(prisma, { tenantId: tenant.id, type: "whatsapp.enviar_mensagem", payload: { conversationId: conversa.id, texto: "x", senderType: "IA" }, idempotencyKey, source: "teste", actorType: "AGENTE", actorLabel: "yalla" });

    expect(r1.duplicado).toBe(false);
    expect(r2.duplicado).toBe(true);
    expect(r2.job.id).toBe(r1.job.id);
  });
});

describe("whatsapp.enviar_mensagem — janela de 24h fechada é falha PERMANENTE (nunca retry inútil)", () => {
  it("erro 131026 da Meta vira FAILED imediatamente, sem tentar de novo", async () => {
    const { conta, conversa } = await criarContaEConversa("janela24h");

    const { job } = await submeterJob(prisma, {
      tenantId: tenant.id,
      type: "whatsapp.enviar_mensagem",
      payload: { conversationId: conversa.id, texto: `fora da janela ${MOCK_JANELA_FECHADA}`, senderType: "IA" },
      source: "teste",
      actorType: "AGENTE",
      actorLabel: "yalla",
    });

    const final = await processarJobAteConcluir(prisma, job.id, tenant.id, "worker-teste");
    expect(final.status).toBe("FAILED"); // não DEAD_LETTER — nunca tentou de novo pra começar
    expect(final.attempts).toBe(1);

    const { count } = await contarChamadasMock(conta.phoneNumberId, TELEFONE_TESTE);
    expect(count).toBe(1);
  });
});

describe("whatsapp.enviar_mensagem — timeout HTTP real via AbortSignal (T5-FIX §1)", () => {
  it("fetch que nunca responde é realmente abortado quando o timeout do job estoura — não fica pendurado, Execution vira TIMEOUT, retry segue a política normal", async () => {
    const { conta, conversa } = await criarContaEConversa("abort-real");

    const { job } = await submeterJob(prisma, {
      tenantId: tenant.id,
      type: "teste.whatsapp_timeout_curto",
      payload: { conversationId: conversa.id, texto: `vai travar o fetch ${MOCK_HANG}` },
      source: "teste",
      actorType: "AGENTE",
      actorLabel: "yalla",
    });

    const inicio = Date.now();
    await reivindicarUmaTentativa(prisma, job.id, "worker-teste");
    const duracao = Date.now() - inicio;

    // timeoutMs deste job type de teste é 150ms — se o abort não funcionasse
    // de verdade, o teste ficaria preso indefinidamente (o mock NUNCA
    // resolve sozinho, só quando abortado). Terminar rápido confirma que
    // o mesmo mecanismo real (`sendCloudText(..., ctx.signal)`) abortou.
    expect(duracao).toBeLessThan(2000);

    const exec = await withTenant(prisma, tenant.id, (tx) => tx.execution.findFirstOrThrow({ where: { jobId: job.id } }));
    expect(exec.status).toBe("TIMEOUT");

    const final = await withTenant(prisma, tenant.id, (tx) => tx.job.findUniqueOrThrow({ where: { id: job.id } }));
    expect(final.status).toBe("RETRY_WAIT"); // timeout é RETRYABLE — segue a política normal, nunca DEAD_LETTER na 1ª falha

    // nenhuma Message de saída foi gravada — o envio nunca completou
    const mensagens = await withTenant(prisma, tenant.id, (tx) => tx.message.findMany({ where: { conversationId: conversa.id, direction: "SAIDA" } }));
    expect(mensagens).toHaveLength(0);

    // prova do lado do servidor (não só do lado do cliente): a conexão HTTP
    // real foi encerrada por abort, não só o motor desistiu de esperar.
    const { aborted } = await contarChamadasMock(conta.phoneNumberId, TELEFONE_TESTE);
    expect(aborted).toBeGreaterThanOrEqual(1);
  }, 15000); // limite subido de 5s: reivindicarUmaTentativa pode legitimamente drenar jobs de outros arquivos concorrentes antes de chegar nesta (§5E) — o teste em si (duracao < 2000ms) continua provando o abort real
});
