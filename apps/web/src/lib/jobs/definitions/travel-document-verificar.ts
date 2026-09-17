import { z } from "zod";
import { registrarJobType, withTenant, FalhaJob } from "@partiumarrocos/db";

/**
 * Prazos e alertas documentais (PM-NIGHT-RUN-02, Etapa 4, §31) — "usar Job
 * Engine para preparar: documento pendente; documento vencendo; prazo
 * próximo; pendência crítica." Mesmo padrão já comprovado em
 * `lead.repescar_elegibilidade` (PM-NIGHT-RUN-01): reavalia o estado NA
 * HORA de rodar (nunca confia na condição de quando foi agendado), sinaliza
 * via `Note` (tipo `PENDENCIA`) no Lead — NUNCA envia WhatsApp/mensagem
 * externa sozinho ("não enviar automaticamente WhatsApp sem política
 * adequada", §31). O sistema real de Notification fica pra Notifications
 * Foundation (Etapa 7) — este job só prepara o sinal interno.
 */

const payloadSchema = z.object({ travelerId: z.string().min(1) });

const DIAS_ALERTA_VENCIMENTO = 15; // documento aprovado vencendo dentro desse prazo já conta como "prazo próximo"

registrarJobType({
  type: "travel_document.verificar_pendencias",
  descricao: "Reavalia documentos pendentes/rejeitados/vencendo de um passageiro e sinaliza (Note) no Lead — nunca envia mensagem sozinho.",
  payloadSchema,
  timeoutMs: 10_000,
  maxAttempts: 3,
  backoffBaseMs: 5_000,
  backoffMaxMs: 60_000,
  priorityPadrao: -5, // mesma prioridade baixa de repescagem — nunca compete com mensagem de cliente
  handler: async (prisma, ctx, payload) => {
    return withTenant(prisma, ctx.tenantId, async (tx) => {
      const traveler = await tx.traveler.findUnique({ where: { id: payload.travelerId }, include: { booking: true } });
      if (!traveler) throw new FalhaJob("passageiro não encontrado", "PERMANENTE");

      const documentos = await tx.travelerDocument.findMany({
        where: { tenantId: ctx.tenantId, travelerId: traveler.id },
        include: { requirement: true },
      });

      const limiteVencimento = new Date(Date.now() + DIAS_ALERTA_VENCIMENTO * 24 * 60 * 60 * 1000);
      const pendentes = documentos.filter((d) => d.requirement.obrigatorio && (d.status === "PENDENTE" || d.status === "REJEITADO"));
      const vencendoEmBreve = documentos.filter((d) => d.status === "APROVADO" && d.validadeAte && d.validadeAte <= limiteVencimento);

      if (pendentes.length === 0 && vencendoEmBreve.length === 0) {
        return { sinalizado: false, motivo: "sem pendências documentais no momento em que o job rodou" };
      }

      const partes: string[] = [];
      if (pendentes.length > 0) partes.push(`pendente(s)/rejeitado(s): ${pendentes.map((d) => d.requirement.nome).join(", ")}`);
      if (vencendoEmBreve.length > 0) partes.push(`vencendo em até ${DIAS_ALERTA_VENCIMENTO} dias: ${vencendoEmBreve.map((d) => d.requirement.nome).join(", ")}`);

      await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: traveler.booking.leadId,
          tipo: "PENDENCIA",
          conteudo: `[Sistema · Documentação] Passageiro ${traveler.nome}: ${partes.join(" · ")}.`,
        },
      });

      return { sinalizado: true, pendentes: pendentes.length, vencendoEmBreve: vencendoEmBreve.length };
    });
  },
});
