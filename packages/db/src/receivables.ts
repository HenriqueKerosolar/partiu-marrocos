import type { PrismaClient } from "@prisma/client";
import { withTenant } from "./tenant-db";

/**
 * "Contas a receber" (PM-NIGHT-RUN-02, Etapa 3, §19) — DELIBERADAMENTE não
 * é uma tabela nova. `Receivable` (obrigação financeira) e `Payment`
 * (liquidação/tentativa de liquidação) são conceitos diferentes segundo o
 * comando, mas um `Payment` em `PENDENTE`/`PROCESSANDO`/
 * `PARCIALMENTE_PAGO` já É estruturalmente "uma obrigação financeira ainda
 * não totalmente liquidada" — criar uma tabela `Receivable` paralela
 * duplicaria exatamente esse dado (mesmo valor/vencimento/booking) com
 * risco real de divergência entre as duas fontes.
 *
 * Esta função entrega a CAPACIDADE pedida ("Booking/Payment deve permitir
 * gerar contas a receber") como uma consulta computada sobre os dados que
 * já existem — nenhuma duplicação, nenhuma tabela nova, mesma garantia de
 * RLS/tenant isolation que a query subjacente já tem.
 */
export interface ContaAReceber {
  paymentId: string;
  bookingId: string;
  leadId: string;
  valor: number;
  moeda: string;
  vencimento: Date | null;
  diasParaVencer: number | null; // negativo = já venceu
  status: "PENDENTE" | "PROCESSANDO" | "PARCIALMENTE_PAGO";
}

export interface FiltroContasAReceber {
  vencendoAte?: Date;
  apenasVencidas?: boolean;
}

export async function listarContasAReceber(prisma: PrismaClient, tenantId: string, filtro: FiltroContasAReceber = {}): Promise<ContaAReceber[]> {
  return withTenant(prisma, tenantId, async (tx) => {
    const agora = new Date();
    const pagamentos = await tx.payment.findMany({
      where: {
        tenantId,
        status: { in: ["PENDENTE", "PROCESSANDO", "PARCIALMENTE_PAGO"] },
        ...(filtro.vencendoAte ? { vencimento: { lte: filtro.vencendoAte } } : {}),
        ...(filtro.apenasVencidas ? { vencimento: { lt: agora } } : {}),
      },
      include: { booking: { select: { leadId: true } } },
      orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }],
    });

    return pagamentos.map((p) => ({
      paymentId: p.id,
      bookingId: p.bookingId,
      leadId: p.booking.leadId,
      valor: p.valor,
      moeda: p.moeda,
      vencimento: p.vencimento,
      diasParaVencer: p.vencimento ? Math.ceil((p.vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000)) : null,
      status: p.status as "PENDENTE" | "PROCESSANDO" | "PARCIALMENTE_PAGO",
    }));
  });
}
