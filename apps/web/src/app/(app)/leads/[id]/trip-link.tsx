"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { vincularBookingATripAction, desvincularBookingDaTripAction } from "@/app/actions/trips";
import { Button } from "@/components/ui/button";

type TripDisponivel = { id: string; roteiro: string | null; dataInicio: string };

export function TripLink({
  leadId,
  bookingId,
  tripAtual,
  tripsDisponiveis,
}: {
  leadId: string;
  bookingId: string;
  tripAtual: { id: string; roteiro: string | null } | null;
  tripsDisponiveis: TripDisponivel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selecionado, setSelecionado] = useState("");

  if (tripAtual) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Viagem:</span>
        <Link href={`/viagens/${tripAtual.id}`} className="underline">
          {tripAtual.roteiro ?? "(sem roteiro)"}
        </Link>
        <button
          className="text-muted-foreground underline"
          disabled={pending}
          onClick={() => startTransition(async () => { await desvincularBookingDaTripAction(leadId, bookingId); router.refresh(); })}
        >
          desvincular
        </button>
      </div>
    );
  }

  if (tripsDisponiveis.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} className="h-7 rounded-md border border-input bg-background px-1 text-xs">
        <option value="">Vincular a uma viagem...</option>
        {tripsDisponiveis.map((t) => (
          <option key={t.id} value={t.id}>
            {t.roteiro ?? "(sem roteiro)"} — {new Date(t.dataInicio).toLocaleDateString("pt-BR")}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={pending || !selecionado}
        onClick={() => startTransition(async () => { await vincularBookingATripAction(leadId, bookingId, selecionado); router.refresh(); })}
      >
        Vincular
      </Button>
    </div>
  );
}
