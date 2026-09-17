"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverBookingStatusAction, adicionarTravelerAction, removerTravelerAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PaymentList, type PaymentStatus as PaymentStatusUi } from "./payment-list";
import { CommissionList } from "./commission-list";
import { TravelerDocuments, type TravelerDocumentResumo } from "./traveler-documents";
import { TripLink } from "./trip-link";
import { TravelerCareSection, type TravelerCareResumo } from "./traveler-care-section";

type BookingStatus = "AGUARDANDO_PAGAMENTO" | "PAGAMENTO_PARCIAL" | "PAGO" | "AGUARDANDO_DOCUMENTOS" | "CONFIRMADA" | "EM_OPERACAO" | "CONCLUIDA" | "CANCELADA";

// Espelha packages/db/src/booking.ts::TRANSICOES_VALIDAS — duplicado de
// propósito (só pra rótulo/próximos-botões na UI; a validação real e a
// única fonte de verdade continuam no server action → módulo de domínio).
// Client component nunca importa `@partiumarrocos/db` diretamente (evita
// puxar o Prisma Client pro bundle do navegador).
const PROXIMOS_STATUS: Record<BookingStatus, BookingStatus[]> = {
  AGUARDANDO_PAGAMENTO: ["PAGAMENTO_PARCIAL", "PAGO", "CANCELADA"],
  PAGAMENTO_PARCIAL: ["PAGO", "CANCELADA"],
  PAGO: ["AGUARDANDO_DOCUMENTOS", "CONFIRMADA", "CANCELADA"],
  AGUARDANDO_DOCUMENTOS: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EM_OPERACAO", "CANCELADA"],
  EM_OPERACAO: ["CONCLUIDA"],
  CONCLUIDA: [],
  CANCELADA: [],
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGAMENTO_PARCIAL: "Pagamento parcial",
  PAGO: "Pago",
  AGUARDANDO_DOCUMENTOS: "Aguardando documentos",
  CONFIRMADA: "Confirmada",
  EM_OPERACAO: "Em operação",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const STATUS_VARIANT: Record<BookingStatus, "default" | "muted" | "destructive"> = {
  AGUARDANDO_PAGAMENTO: "muted",
  PAGAMENTO_PARCIAL: "muted",
  PAGO: "default",
  AGUARDANDO_DOCUMENTOS: "muted",
  CONFIRMADA: "default",
  EM_OPERACAO: "default",
  CONCLUIDA: "default",
  CANCELADA: "destructive",
};

type Traveler = { id: string; nome: string; tipo: string; documents: TravelerDocumentResumo[]; care: TravelerCareResumo | null };
type PaymentResumo = { id: string; status: PaymentStatusUi; valor: number; moeda: string; vencimento: string | null; gateId: string | null };
type CommissionResumo = { id: string; status: "PREVISTA" | "CONFIRMADA" | "PAGA" | "CANCELADA"; valor: number; moeda: string; percentual: number | null; gateId: string | null };

export function BookingCard({
  leadId,
  booking,
  podeVerComissoes = true,
  podeVerDocumentos = true,
  podeVerViagens = true,
  tripsDisponiveis = [],
  podeVerDadosSensiveis = false,
  podeGerenciarDadosSensiveis = false,
}: {
  leadId: string;
  podeVerComissoes?: boolean;
  podeVerDocumentos?: boolean;
  podeVerViagens?: boolean;
  podeVerDadosSensiveis?: boolean;
  podeGerenciarDadosSensiveis?: boolean;
  tripsDisponiveis?: { id: string; roteiro: string | null; dataInicio: string }[];
  booking: {
    id: string;
    status: BookingStatus;
    moeda: string;
    preco: number;
    travelers: Traveler[];
    payments: PaymentResumo[];
    commissions: CommissionResumo[];
    responsavelId: string | null;
    responsavelLabel: string | null;
    trip: { id: string; roteiro: string | null } | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function mudarStatus(novoStatus: BookingStatus) {
    startTransition(async () => {
      const r = await moverBookingStatusAction(leadId, booking.id, novoStatus);
      setErro(r.error ?? null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">Reserva</span>
        <Badge variant={STATUS_VARIANT[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
        <span className="text-muted-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: booking.moeda }).format(booking.preco)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROXIMOS_STATUS[booking.status].map((s) => (
          <Button key={s} size="sm" variant={s === "CANCELADA" ? "outline" : "default"} disabled={pending} onClick={() => mudarStatus(s)}>
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {podeVerViagens && <TripLink leadId={leadId} bookingId={booking.id} tripAtual={booking.trip} tripsDisponiveis={tripsDisponiveis} />}

      <div className="mt-1 flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">Passageiros ({booking.travelers.length})</p>
        {booking.travelers.map((t) => (
          <div key={t.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span>{t.nome}</span>
              <Badge variant="muted">{t.tipo}</Badge>
              <button
                className="text-muted-foreground underline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await removerTravelerAction(leadId, t.id);
                    router.refresh();
                  })
                }
              >
                remover
              </button>
            </div>
            {podeVerDocumentos && <TravelerDocuments leadId={leadId} documents={t.documents} />}
            {podeVerDadosSensiveis && <TravelerCareSection leadId={leadId} travelerId={t.id} care={t.care} podeGerenciar={podeGerenciarDadosSensiveis} />}
          </div>
        ))}
        {!mostrarForm ? (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setMostrarForm(true)}>
            Adicionar passageiro
          </Button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            action={(formData) =>
              startTransition(async () => {
                await adicionarTravelerAction(leadId, booking.id, formData);
                setMostrarForm(false);
                router.refresh();
              })
            }
          >
            <Input name="nome" placeholder="Nome do passageiro" required className="h-8 w-48 text-xs" />
            <select name="tipo" className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue="ADULTO">
              <option value="ADULTO">Adulto</option>
              <option value="CRIANCA">Criança</option>
              <option value="BEBE">Bebê</option>
            </select>
            <Button type="submit" size="sm" disabled={pending}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarForm(false)}>
              Cancelar
            </Button>
          </form>
        )}
      </div>

      <PaymentList leadId={leadId} bookingId={booking.id} bookingMoeda={booking.moeda} payments={booking.payments} />
      {podeVerComissoes && (
        <CommissionList leadId={leadId} bookingId={booking.id} beneficiarioId={booking.responsavelId} beneficiarioLabel={booking.responsavelLabel} commissions={booking.commissions} />
      )}
    </div>
  );
}
