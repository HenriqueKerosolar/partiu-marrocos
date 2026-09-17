"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enviarPropostaAction, verificarAprovacaoPropostaAction, aceitarPropostaAction, recusarPropostaAction } from "@/app/actions/proposals";
import { criarBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PropostaResumo = {
  id: string;
  versao: number;
  status: string;
  moeda: string;
  preco: number;
  roteiro: string | null;
  validade: string; // ISO
  condicoes: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "muted" | "destructive"> = {
  RASCUNHO: "muted",
  AGUARDANDO_APROVACAO: "destructive",
  ENVIADA: "default",
  ACEITA: "default",
  RECUSADA: "muted",
  EXPIRADA: "muted",
  SUBSTITUIDA: "muted",
};

export function PropostaCard({ leadId, proposta, temBooking }: { leadId: string; proposta: PropostaResumo; temBooking?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);

  function rodar(acao: () => Promise<{ ok?: boolean; error?: string; aguardandoAprovacao?: boolean }>) {
    startTransition(async () => {
      const r = await acao();
      if (r.error) setMensagem(r.error);
      else if (r.aguardandoAprovacao) setMensagem("Enviada para aprovação — precisa de um Gate COMERCIAL aprovado antes de ir ao cliente.");
      else setMensagem(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">v{proposta.versao}</span>
        <Badge variant={STATUS_VARIANT[proposta.status] ?? "muted"}>{proposta.status}</Badge>
        <span className="text-muted-foreground">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: proposta.moeda }).format(proposta.preco)}
        </span>
      </div>
      {proposta.roteiro && <p className="text-muted-foreground">{proposta.roteiro}</p>}
      <p className="text-xs text-muted-foreground">Válida até {new Date(proposta.validade).toLocaleDateString("pt-BR")}</p>

      <div className="mt-1 flex gap-2">
        {proposta.status === "RASCUNHO" && (
          <Button size="sm" disabled={pending} onClick={() => rodar(() => enviarPropostaAction(leadId, proposta.id))}>
            Enviar
          </Button>
        )}
        {proposta.status === "AGUARDANDO_APROVACAO" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => rodar(() => verificarAprovacaoPropostaAction(leadId, proposta.id))}>
            Verificar aprovação
          </Button>
        )}
        {proposta.status === "ENVIADA" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => rodar(() => aceitarPropostaAction(leadId, proposta.id))}>
              Marcar como aceita
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => rodar(() => recusarPropostaAction(leadId, proposta.id))}>
              Marcar como recusada
            </Button>
          </>
        )}
        {proposta.status === "ACEITA" && !temBooking && (
          <Button size="sm" disabled={pending} onClick={() => rodar(() => criarBookingAction(leadId, proposta.id))}>
            Criar reserva
          </Button>
        )}
      </div>
      {mensagem && <p className="text-xs text-muted-foreground">{mensagem}</p>}
    </div>
  );
}
