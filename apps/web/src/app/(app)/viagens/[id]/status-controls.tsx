"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverStatusTripAction } from "@/app/actions/trips";
import { Button } from "@/components/ui/button";

type TripStatus = "PLANEJAMENTO" | "CONFIRMADA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";

const PROXIMOS_STATUS: Record<TripStatus, TripStatus[]> = {
  PLANEJAMENTO: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["CONCLUIDA"],
  CONCLUIDA: [],
  CANCELADA: [],
};

const STATUS_LABEL: Record<TripStatus, string> = {
  PLANEJAMENTO: "Planejamento",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export function TripStatusControls({ tripId, statusAtual }: { tripId: string; statusAtual: TripStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const proximos = PROXIMOS_STATUS[statusAtual];
  if (proximos.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {proximos.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "CANCELADA" ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await moverStatusTripAction(tripId, s);
              router.refresh();
            })
          }
        >
          {STATUS_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}
