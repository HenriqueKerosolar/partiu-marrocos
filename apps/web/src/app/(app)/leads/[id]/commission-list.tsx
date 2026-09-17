"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarComissaoAction, confirmarComissaoAction, cancelarComissaoAction, solicitarPagamentoComissaoAction, verificarPagamentoComissaoAction } from "@/app/actions/commissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type CommissionStatus = "PREVISTA" | "CONFIRMADA" | "PAGA" | "CANCELADA";
type Commission = { id: string; status: CommissionStatus; valor: number; moeda: string; percentual: number | null; gateId: string | null };

const STATUS_LABEL: Record<CommissionStatus, string> = { PREVISTA: "Prevista", CONFIRMADA: "Confirmada", PAGA: "Paga", CANCELADA: "Cancelada" };
const STATUS_VARIANT: Record<CommissionStatus, "default" | "muted" | "destructive"> = { PREVISTA: "muted", CONFIRMADA: "default", PAGA: "default", CANCELADA: "destructive" };

function moeda(valor: number, moedaCod: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moedaCod }).format(valor);
}

export function CommissionList({
  leadId,
  bookingId,
  beneficiarioId,
  beneficiarioLabel,
  commissions,
}: {
  leadId: string;
  bookingId: string;
  beneficiarioId: string | null;
  beneficiarioLabel: string | null;
  commissions: Commission[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
      <p className="text-xs font-medium text-muted-foreground">Comissões ({commissions.length})</p>
      {commissions.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded border border-border/60 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
            <span className="font-medium">{moeda(c.valor, c.moeda)}</span>
            {c.percentual != null && <span className="text-muted-foreground">({(c.percentual * 100).toFixed(1)}%)</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {c.status === "PREVISTA" && (
              <>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => startTransition(async () => { await confirmarComissaoAction(leadId, c.id); router.refresh(); })}>
                  Confirmar
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => startTransition(async () => { await cancelarComissaoAction(leadId, c.id); router.refresh(); })}>
                  Cancelar
                </Button>
              </>
            )}
            {c.status === "CONFIRMADA" && !c.gateId && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPagamentoAberto(c.id)}>
                Solicitar pagamento
              </Button>
            )}
            {c.gateId && c.status === "CONFIRMADA" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await verificarPagamentoComissaoAction(leadId, c.id);
                    setMensagem(r.status === "GATE_PENDENTE" ? "Pagamento ainda aguardando aprovação do Gate." : r.status === "GATE_NEGADO" ? "Gate do pagamento foi rejeitado/expirado." : null);
                    router.refresh();
                  })
                }
              >
                Verificar pagamento
              </Button>
            )}
          </div>
          {pagamentoAberto === c.id && (
            <form
              className="mt-1 flex flex-wrap items-end gap-2"
              action={(formData) =>
                startTransition(async () => {
                  const r = await solicitarPagamentoComissaoAction(leadId, c.id, formData);
                  setMensagem(r.error ?? "Pagamento solicitado — precisa de um Gate FINANCEIRO aprovado antes de ser aplicado.");
                  setPagamentoAberto(null);
                  router.refresh();
                })
              }
            >
              <Input name="motivo" placeholder="Motivo/justificativa" required className="h-7 w-48 text-xs" />
              <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                Confirmar solicitação
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPagamentoAberto(null)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      ))}

      {mensagem && <p className="text-xs text-muted-foreground">{mensagem}</p>}

      {!beneficiarioId ? (
        <p className="text-xs text-muted-foreground">Reserva sem responsável definido — atribua um responsável para poder registrar comissão.</p>
      ) : !mostrarForm ? (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setMostrarForm(true)}>
          Nova comissão (para {beneficiarioLabel})
        </Button>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          action={(formData) =>
            startTransition(async () => {
              await criarComissaoAction(leadId, bookingId, beneficiarioId, formData);
              setMostrarForm(false);
              router.refresh();
            })
          }
        >
          <Input name="valor" type="number" step="0.01" min="0" placeholder="Valor" required className="h-8 w-24 text-xs" />
          <Input name="moeda" defaultValue="BRL" className="h-8 w-16 text-xs" />
          <Input name="percentual" type="number" step="0.1" min="0" max="100" placeholder="% (opcional)" className="h-8 w-28 text-xs" />
          <Input name="baseCalculo" type="number" step="0.01" min="0" placeholder="Base de cálculo" className="h-8 w-32 text-xs" />
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
