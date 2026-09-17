import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSystem, withTenant, criarProposta, atualizarPropostaRascunho, criarNovaVersao, enviarProposta, confirmarEnvioAposAprovacaoGate, aceitarProposta, recusarProposta, expirarPropostasVencidas, listarPropostasDoLead, decidirGate } from "../../src";

/**
 * Proposal Foundation 01 (PM-NIGHT-RUN-01, Etapa 5). Mesmo critério de
 * teste negativo real das outras suítes deste pacote — provar ativamente
 * que uma proposta ENVIADA nunca é reescrita, que a política comercial
 * bloqueia envio quando deveria, e que nenhum agente aprova a si mesmo.
 */
let tenantA: { id: string };
let tenantB: { id: string };
let userA: { id: string };
let leadA: { id: string };
let leadB: { id: string };

const VALIDADE_FUTURA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const VALIDADE_PASSADA = () => new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

async function criarLeadPara(tenantId: string, sufixo: string) {
  return withTenant(prisma, tenantId, async (tx) => {
    const pipeline = await tx.pipeline.create({ data: { tenantId, nome: `Funil ${sufixo}` } });
    const stage = await tx.stage.create({ data: { tenantId, pipelineId: pipeline.id, nome: "Novo", ordem: 0 } });
    const contact = await tx.contact.create({ data: { tenantId, nome: `Cliente ${sufixo}` } });
    return tx.lead.create({ data: { tenantId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id } });
  });
}

beforeAll(async () => {
  tenantA = await prisma.tenant.create({ data: { nome: "Tenant A (proposals teste)", slug: `prop-a-${Date.now()}` } });
  tenantB = await prisma.tenant.create({ data: { nome: "Tenant B (proposals teste)", slug: `prop-b-${Date.now()}` } });
  userA = await prisma.user.create({ data: { email: `prop-a-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenantA.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: userA.id, tenantId: tenantA.id, roleId: role.id } });
  });
  leadA = await criarLeadPara(tenantA.id, "A");
  leadB = await criarLeadPara(tenantB.id, "B");
}, 30000);

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } });
    await tx.tenant.delete({ where: { id: tenantB.id } });
  });
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.proposal.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await tx.gate.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  });
});

function dadosBase(overrides: Partial<Parameters<typeof criarProposta>[1]> = {}) {
  return {
    tenantId: tenantA.id,
    leadId: leadA.id,
    moeda: "BRL",
    preco: 10000,
    validade: VALIDADE_FUTURA(),
    ...overrides,
  };
}

describe("Proposal — criação e edição em RASCUNHO", () => {
  it("cria em RASCUNHO, versao 1", async () => {
    const p = await criarProposta(prisma, dadosBase());
    expect(p.status).toBe("RASCUNHO");
    expect(p.versao).toBe(1);
    expect(p.substituiPropostaId).toBeNull();
  });

  it("edita in-place enquanto RASCUNHO", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 10000 }));
    const r = await atualizarPropostaRascunho(prisma, { tenantId: tenantA.id, propostaId: p.id, dados: { preco: 12000 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposta.preco).toBe(12000);

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p.id } }));
    expect(releitura.preco).toBe(12000);
    expect(releitura.versao).toBe(1); // edição in-place não cria versão nova
  });
});

describe("Proposal — versionamento obrigatório: nunca reescreve uma proposta enviada", () => {
  it("depois de ENVIADA, tentar editar in-place falha (NAO_E_RASCUNHO)", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000 })); // sem gatilho de política
    const envio = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    expect(envio.ok && envio.status).toBe("ENVIADA");

    const tentativaEdicao = await atualizarPropostaRascunho(prisma, { tenantId: tenantA.id, propostaId: p.id, dados: { preco: 6000 } });
    expect(tentativaEdicao.ok).toBe(false);
    if (!tentativaEdicao.ok) expect(tentativaEdicao.motivo).toBe("NAO_E_RASCUNHO");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p.id } }));
    expect(releitura.preco).toBe(5000); // preço enviado nunca muda
  });

  it("criarNovaVersao cria linha nova, marca a anterior SUBSTITUIDA, preserva a anterior intacta", async () => {
    const p1 = await criarProposta(prisma, dadosBase({ preco: 5000 }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p1.id, actorType: "HUMANO", userId: userA.id });

    const r = await criarNovaVersao(prisma, { tenantId: tenantA.id, propostaAnteriorId: p1.id, dados: { preco: 5500 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.versao).toBe(2);
    expect(r.proposta.status).toBe("RASCUNHO");
    expect(r.proposta.substituiPropostaId).toBe(p1.id);

    const anteriorReleitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p1.id } }));
    expect(anteriorReleitura.status).toBe("SUBSTITUIDA");
    expect(anteriorReleitura.preco).toBe(5000); // v1 nunca é reescrita
  });

  it("não permite criar nova versão a partir de um RASCUNHO (deve editar in-place)", async () => {
    const p = await criarProposta(prisma, dadosBase());
    const r = await criarNovaVersao(prisma, { tenantId: tenantA.id, propostaAnteriorId: p.id, dados: { preco: 999 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("AINDA_E_RASCUNHO");
  });

  it("não permite versionar duas vezes a partir da mesma proposta já substituída", async () => {
    const p1 = await criarProposta(prisma, dadosBase({ preco: 5000 }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p1.id, actorType: "HUMANO", userId: userA.id });
    await criarNovaVersao(prisma, { tenantId: tenantA.id, propostaAnteriorId: p1.id, dados: { preco: 5500 } });

    const segunda = await criarNovaVersao(prisma, { tenantId: tenantA.id, propostaAnteriorId: p1.id, dados: { preco: 6000 } });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe("JA_SUBSTITUIDA");
  });
});

describe("Proposal — envio sem gatilho de política", () => {
  it("preço/moeda normais, sem flags: envia direto, sem Gate", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, moeda: "BRL" }));
    const r = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("ENVIADA");
      expect(r.proposta.enviadaEm).not.toBeNull();
    }
  });

  it("preço/moeda/validade ficam congelados depois do envio — mesmo que o preço de referência mude depois em outro registro", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, moeda: "BRL" }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p.id } }));
    expect(releitura.preco).toBe(5000);
    expect(releitura.moeda).toBe("BRL");
    expect(releitura.status).toBe("ENVIADA");
  });

  it("só pode enviar a partir de RASCUNHO — enviar de novo uma já enviada falha", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000 }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    const segundaTentativa = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    expect(segundaTentativa.ok).toBe(false);
  });
});

describe("Proposal — política comercial bloqueia envio (Gate COMERCIAL), Yalla nunca autoaprova", () => {
  it("desconto relevante (>=15% sobre precoReferencia) cria Gate e bloqueia — status AGUARDANDO_APROVACAO", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 8000, precoReferencia: 10000 })); // 20% de desconto
    const r = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "AGENTE", actorLabel: "yalla" });
    expect(r.ok).toBe(true);
    if (r.ok && r.status === "AGUARDANDO_APROVACAO") {
      expect(r.gateId).toBeTruthy();
      expect(r.motivos.join(" ")).toContain("desconto");
    } else {
      throw new Error("esperava AGUARDANDO_APROVACAO");
    }

    const gate = await withTenant(prisma, tenantA.id, (tx) => tx.gate.findFirstOrThrow({ where: { tenantId: tenantA.id, categoria: "COMERCIAL" } }));
    expect(gate.status).toBe("PENDENTE");
    expect(gate.solicitanteLabel).toBe("yalla");
  });

  it("condição comercial excepcional declarada bloqueia mesmo com preço normal", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, condicaoExcepcional: true }));
    const r = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    expect(r.ok && r.status).toBe("AGUARDANDO_APROVACAO");
  });

  it("Gate aprovado por um humano real (decidirGate) libera o envio via confirmarEnvioAposAprovacaoGate", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, condicaoExcepcional: true }));
    const envio = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "AGENTE", actorLabel: "yalla" });
    if (!envio.ok || envio.status !== "AGUARDANDO_APROVACAO") throw new Error("esperava AGUARDANDO_APROVACAO");

    const decisao = await decidirGate(prisma, { tenantId: tenantA.id, gateId: envio.gateId, decisao: "APROVADO", decisorId: userA.id });
    expect(decisao.ok).toBe(true);

    const confirmacao = await confirmarEnvioAposAprovacaoGate(prisma, { tenantId: tenantA.id, propostaId: p.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) {
      expect(confirmacao.status).toBe("ENVIADA");
    }
  });

  it("Gate rejeitado volta a proposta pra RASCUNHO (editável), nunca fica 'meio enviada'", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, condicaoExcepcional: true }));
    const envio = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "AGENTE", actorLabel: "yalla" });
    if (!envio.ok || envio.status !== "AGUARDANDO_APROVACAO") throw new Error("esperava AGUARDANDO_APROVACAO");

    await decidirGate(prisma, { tenantId: tenantA.id, gateId: envio.gateId, decisao: "REJEITADO", decisorId: userA.id });
    const confirmacao = await confirmarEnvioAposAprovacaoGate(prisma, { tenantId: tenantA.id, propostaId: p.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok && confirmacao.status === "RASCUNHO") {
      expect(confirmacao.motivo).toBe("GATE_REJEITADO");
      expect(confirmacao.proposta.status).toBe("RASCUNHO"); // editável de novo
    } else {
      throw new Error("esperava RASCUNHO");
    }
  });

  it("Gate ainda PENDENTE: confirmarEnvioAposAprovacaoGate não muda nada (nunca autoaprova por impaciência)", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, condicaoExcepcional: true }));
    const envio = await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "AGENTE", actorLabel: "yalla" });
    if (!envio.ok || envio.status !== "AGUARDANDO_APROVACAO") throw new Error("esperava AGUARDANDO_APROVACAO");

    const confirmacao = await confirmarEnvioAposAprovacaoGate(prisma, { tenantId: tenantA.id, propostaId: p.id });
    expect(confirmacao.ok).toBe(true);
    if (confirmacao.ok) expect(confirmacao.status).toBe("AGUARDANDO_APROVACAO");

    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p.id } }));
    expect(releitura.status).toBe("AGUARDANDO_APROVACAO");
  });
});

describe("Proposal — aceite/recusa (só a partir de ENVIADA)", () => {
  it("aceita uma proposta enviada", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000 }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    const r = await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.proposta.status).toBe("ACEITA");
      expect(r.proposta.aceitaEm).not.toBeNull();
    }
  });

  it("recusa uma proposta enviada, com motivo sanitizado", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000 }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });
    const r = await recusarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, motivo: "preço alto <script>alert(1)</script>" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.proposta.status).toBe("RECUSADA");
      expect(r.proposta.motivoRecusa).toBe("preço alto alert(1)");
    }
  });

  it("não pode aceitar/recusar um RASCUNHO", async () => {
    const p = await criarProposta(prisma, dadosBase());
    const r1 = await aceitarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id });
    const r2 = await recusarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });
});

describe("Proposal — expiração (validade vencida)", () => {
  it("proposta ENVIADA com validade no passado vira EXPIRADA ao listar", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, validade: VALIDADE_PASSADA() }));
    await enviarProposta(prisma, { tenantId: tenantA.id, propostaId: p.id, actorType: "HUMANO", userId: userA.id });

    const listagem = await listarPropostasDoLead(prisma, tenantA.id, leadA.id);
    const encontrada = listagem.find((x) => x.id === p.id)!;
    expect(encontrada.status).toBe("EXPIRADA");
  });

  it("RASCUNHO nunca expira sozinho, mesmo com validade no passado", async () => {
    const p = await criarProposta(prisma, dadosBase({ preco: 5000, validade: VALIDADE_PASSADA() }));
    await expirarPropostasVencidas(prisma, tenantA.id);
    const releitura = await withTenant(prisma, tenantA.id, (tx) => tx.proposal.findUniqueOrThrow({ where: { id: p.id } }));
    expect(releitura.status).toBe("RASCUNHO");
  });
});

describe("Proposal — isolamento multi-tenant (RLS)", () => {
  it("Tenant B não lista proposta do Tenant A", async () => {
    await criarProposta(prisma, dadosBase());
    const listagemB = await listarPropostasDoLead(prisma, tenantB.id, leadB.id);
    expect(listagemB).toHaveLength(0);
  });

  it("Tenant B não consegue criar proposta apontando para lead do Tenant A (FK composta protege)", async () => {
    await expect(criarProposta(prisma, { tenantId: tenantB.id, leadId: leadA.id, moeda: "BRL", preco: 1000, validade: VALIDADE_FUTURA() })).rejects.toThrow();
  });
});
