"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPaymentAction, registrarResultadoPaymentAction, solicitarEstornoAction, verificarEstornoAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type PaymentStatus = "PENDENTE" | "PROCESSANDO" | "PAGO" | "PARCIALMENTE_PAGO" | "FALHOU" | "CANCELADO" | "REEMBOLSADO" | "PARCIALMENTE_REEMBOLSADO";

type Payment = {
  id: string;
  status: PaymentStatus;
  valor: number;
  moeda: string;
  vencimento: string | null; // ISO
  gateId: string | null;
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Processando",
  PAGO: "Pago",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
  REEMBOLSADO: "Reembolsado",
  PARCIALMENTE_REEMBOLSADO: "Parcialmente reembolsado",
};

const STATUS_VARIANT: Record<PaymentStatus, "default" | "muted" | "destructive"> = {
  PENDENTE: "muted",
  PROCESSANDO: "muted",
  PAGO: "default",
  PARCIALMENTE_PAGO: "default",
  FALHOU: "destructive",
  CANCELADO: "muted",
  REEMBOLSADO: "destructive",
  PARCIALMENTE_REEMBOLSADO: "destructive",
};

function moeda(valor: number, moedaCod: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moedaCod }).format(valor);
}

export function PaymentList({ leadId, bookingId, bookingMoeda, payments }: { leadId: string; bookingId: string; bookingMoeda: string; payments: Payment[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [estornoAberto, setEstornoAberto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <p className="text-xs font-medium text-muted-foreground">Pagamentos ({payments.length}) — modo manual/offline, nenhum gateway integrado</p>
      {payments.map((p) => (
        <div key={p.id} className="flex flex-col gap-1 rounded border border-border/60 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
            <span className="font-medium">{moeda(p.valor, p.moeda)}</span>
            {p.vencimento && <span className="text-muted-foreground">venc. {new Date(p.vencimento).toLocaleDateString("pt-BR")}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {(p.status === "PENDENTE" || p.status === "PROCESSANDO") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await registrarResultadoPaymentAction(leadId, p.id, "PAGO");
                      router.refresh();
                    })
                  }
                >
                  Marcar como pago
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await registrarResultadoPaymentAction(leadId, p.id, "FALHOU");
                      router.refresh();
                    })
                  }
                >
                  Marcar como falhou
                </Button>
              </>
            )}
            {(p.status === "PAGO" || p.status === "PARCIALMENTE_PAGO") && !p.gateId && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEstornoAberto(p.id)}>
                Solicitar estorno
              </Button>
            )}
            {p.gateId && (p.status === "PAGO" || p.status === "PARCIALMENTE_PAGO") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await verificarEstornoAction(leadId, p.id);
                    setMensagem(r.status === "GATE_PENDENTE" ? "Estorno ainda aguardando aprovação do Gate." : r.status === "GATE_NEGADO" ? "Gate do estorno foi rejeitado/expirado." : null);
                    router.refresh();
                  })
                }
              >
                Verificar estorno
              </Button>
            )}
          </div>
          {estornoAberto === p.id && (
            <form
              className="mt-1 flex flex-wrap items-end gap-2"
              action={(formData) =>
                startTransition(async () => {
                  const r = await solicitarEstornoAction(leadId, p.id, formData);
                  setMensagem(r.error ?? "Estorno solicitado — precisa de um Gate FINANCEIRO aprovado antes de ser aplicado.");
                  setEstornoAberto(null);
                  router.refresh();
                })
              }
            >
              <Input name="valorEstorno" type="number" step="0.01" min="0" placeholder="Valor" required className="h-7 w-24 text-xs" />
              <Input name="motivo" placeholder="Motivo" required className="h-7 w-40 text-xs" />
              <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                Confirmar solicitação
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEstornoAberto(null)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      ))}

      {mensagem && <p className="text-xs text-muted-foreground">{mensagem}</p>}

      {!mostrarForm ? (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setMostrarForm(true)}>
          Nova cobrança
        </Button>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          action={(formData) =>
            startTransition(async () => {
              await criarPaymentAction(leadId, bookingId, formData);
              setMostrarForm(false);
              router.refresh();
            })
          }
        >
          <Input name="valor" type="number" step="0.01" min="0" placeholder="Valor" required className="h-8 w-24 text-xs" />
          {/* PM-CONV-08 — achado real: "BRL" fixo aqui deixava fácil criar um Payment
              em moeda diferente da Proposal do Booking (a soma em sincronizarStatusPagamentoBooking/
              resumoPagamentoBooking não filtra por moeda) — default agora é sempre a moeda real da reserva. */}
          <Input name="moeda" defaultValue={bookingMoeda} className="h-8 w-16 text-xs" />
          <Input name="vencimento" type="date" className="h-8 text-xs" />
          <Input name="method" placeholder="Forma (pix, cartão...)" className="h-8 w-36 text-xs" />
          <Button type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarForm(false)}>
            Cancelar
          </Button>
        </form>
      )}
    </div>
  );
}
