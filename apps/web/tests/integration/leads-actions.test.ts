import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSystem, withTenant } from "@partiumarrocos/db";

/**
 * CRM Evolution 01 (PM-NIGHT-RUN-01, Etapa 3) — server actions de
 * `app/actions/leads.ts`: prioridade, motivo de perda e conclusão de
 * tarefa. `motivoPerda` só é gravado ao mover para uma etapa terminal de
 * perda, e nunca é apagado por uma chamada sem motivo numa etapa
 * não-terminal (comportamento documentado no próprio comentário da
 * função) — é exatamente esse contrato que esta suíte prova.
 */
const mockRequireAuthContext = vi.fn();
vi.mock("@/lib/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/session")>();
  return { ...actual, requireAuthContext: () => mockRequireAuthContext() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { moverLeadEtapa, alternarPrioridadeLead, alternarTaskConcluida } = await import("@/app/actions/leads");

let tenant: { id: string };
let admin: { id: string; email: string };
let pipeline: { id: string };
let stageAberta: { id: string };
let stagePerdido: { id: string };
let contact: { id: string };

function ctx(chaves: string[]) {
  return { sessionId: "s1", user: { id: admin.id, email: admin.email, mustChangePassword: false }, tenantId: tenant.id, role: null, permissions: new Set(chaves) };
}

beforeAll(async () => {
  tenant = await prisma.tenant.create({ data: { nome: "Tenant (leads actions teste)", slug: `leads-actions-${Date.now()}` } });
  admin = await prisma.user.create({ data: { email: `leads-actions-${Date.now()}@teste.local`, passwordHash: "x", mustChangePassword: false } });
  await withSystem(prisma, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, nome: "Admin" } });
    await tx.membership.create({ data: { userId: admin.id, tenantId: tenant.id, roleId: role.id } });
  });
  await withTenant(prisma, tenant.id, async (tx) => {
    pipeline = await tx.pipeline.create({ data: { tenantId: tenant.id, nome: "Funil teste" } });
    stageAberta = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Em conversa", ordem: 0 } });
    stagePerdido = await tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Perdido", ordem: 1, isLost: true } });
    contact = await tx.contact.create({ data: { tenantId: tenant.id, nome: "Cliente ações" } });
  });
}, 30000);

afterAll(async () => {
  await withSystem(prisma, (tx) => tx.tenant.delete({ where: { id: tenant.id } }));
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  mockRequireAuthContext.mockReset();
  await withSystem(prisma, async (tx) => {
    await tx.note.deleteMany({ where: { tenantId: tenant.id } });
    await tx.task.deleteMany({ where: { tenantId: tenant.id } });
    await tx.lead.deleteMany({ where: { tenantId: tenant.id } });
  });
});

async function criarLeadDireto(overrides: { motivoPerda?: string } = {}) {
  return withTenant(prisma, tenant.id, (tx) =>
    tx.lead.create({ data: { tenantId: tenant.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stageAberta.id, motivoPerda: overrides.motivoPerda } }),
  );
}

describe("moverLeadEtapa — motivo de perda", () => {
  it("mover para etapa terminal de perda com motivo: grava motivoPerda e status PERDIDO", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const lead = await criarLeadDireto();

    const r = await moverLeadEtapa(lead.id, stagePerdido.id, "cliente achou o preço alto");
    expect(r.ok).toBe(true);

    const final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.status).toBe("PERDIDO");
    expect(final.motivoPerda).toBe("cliente achou o preço alto");
  });

  it("mover para etapa terminal de perda SEM motivo: status PERDIDO, motivoPerda fica null (não inventa texto)", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const lead = await criarLeadDireto();

    await moverLeadEtapa(lead.id, stagePerdido.id);
    const final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.status).toBe("PERDIDO");
    expect(final.motivoPerda).toBeNull();
  });

  it("motivo com HTML/script é sanitizado antes de gravar", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const lead = await criarLeadDireto();

    await moverLeadEtapa(lead.id, stagePerdido.id, "preço alto <script>alert(1)</script>");
    const final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.motivoPerda).toBe("preço alto alert(1)");
  });

  it("mover para etapa NÃO-terminal sem motivo nunca apaga um motivoPerda já registrado", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const outraEtapaAberta = await withTenant(prisma, tenant.id, (tx) => tx.stage.create({ data: { tenantId: tenant.id, pipelineId: pipeline.id, nome: "Reaberto", ordem: 2 } }));
    const lead = await criarLeadDireto({ motivoPerda: "motivo antigo registrado manualmente" });

    await moverLeadEtapa(lead.id, outraEtapaAberta.id);
    const final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.status).toBe("ABERTO");
    expect(final.motivoPerda).toBe("motivo antigo registrado manualmente"); // preservado, nunca limpo silenciosamente
  });

  it("sem permissão leads.manage: lança (RBAC), lead não é alterado", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx([]));
    const lead = await criarLeadDireto();
    await expect(moverLeadEtapa(lead.id, stagePerdido.id, "tentativa sem permissão")).rejects.toThrow();
  });
});

describe("alternarPrioridadeLead", () => {
  it("liga e desliga a flag de prioridade", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const lead = await criarLeadDireto();

    await alternarPrioridadeLead(lead.id, true);
    let final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.prioridade).toBe(true);

    await alternarPrioridadeLead(lead.id, false);
    final = await withTenant(prisma, tenant.id, (tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    expect(final.prioridade).toBe(false);
  });
});

describe("alternarTaskConcluida", () => {
  it("marca e desmarca uma tarefa como concluída", async () => {
    mockRequireAuthContext.mockResolvedValue(ctx(["leads.manage"]));
    const lead = await criarLeadDireto();
    const task = await withTenant(prisma, tenant.id, (tx) => tx.task.create({ data: { tenantId: tenant.id, leadId: lead.id, titulo: "follow-up teste" } }));

    await alternarTaskConcluida(task.id, true);
    let final = await withTenant(prisma, tenant.id, (tx) => tx.task.findUniqueOrThrow({ where: { id: task.id } }));
    expect(final.concluida).toBe(true);

    await alternarTaskConcluida(task.id, false);
    final = await withTenant(prisma, tenant.id, (tx) => tx.task.findUniqueOrThrow({ where: { id: task.id } }));
    expect(final.concluida).toBe(false);
  });
});
