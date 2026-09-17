import "server-only";
import { prisma, withTenant } from "@partiumarrocos/db";

interface RecordAuditInput {
  tenantId: string;
  userId?: string | null;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  resultado: "SUCESSO" | "FALHA";
  detalhe?: Record<string, unknown>;
}

/** audit_logs tem RLS — grava sempre dentro do contexto do próprio tenant do evento. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await withTenant(prisma, input.tenantId, (tx) =>
    tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        acao: input.acao,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        resultado: input.resultado,
        detalhe: input.detalhe as never,
      },
    }),
  );
}
