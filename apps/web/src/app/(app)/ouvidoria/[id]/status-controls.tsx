"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverStatusTicketAction } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

type Status = "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO" | "FECHADO";

const PROXIMOS: Record<Status, { status: Status; label: string }[]> = {
  ABERTO: [
    { status: "EM_ANDAMENTO", label: "Em andamento" },
    { status: "RESOLVIDO", label: "Resolvido" },
    { status: "FECHADO", label: "Fechado" },
  ],
  EM_ANDAMENTO: [
    { status: "RESOLVIDO", label: "Resolvido" },
    { status: "FECHADO", label: "Fechado" },
  ],
  RESOLVIDO: [
    { status: "FECHADO", label: "Fechado" },
    { status: "EM_ANDAMENTO", label: "Reabrir" },
  ],
  FECHADO: [],
};

export function TicketStatusControls({ ticketId, statusAtual }: { ticketId: string; statusAtual: Status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {PROXIMOS[statusAtual].map((p) => (
        <Button
          key={p.status}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await moverStatusTicketAction(ticketId, p.status);
              router.refresh();
            })
          }
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
