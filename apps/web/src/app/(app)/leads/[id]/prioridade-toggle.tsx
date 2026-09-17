"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarPrioridadeLead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";

export function PrioridadeToggle({ leadId, prioridade }: { leadId: string; prioridade: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={prioridade ? "destructive" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await alternarPrioridadeLead(leadId, !prioridade);
          router.refresh();
        })
      }
    >
      {prioridade ? "Remover prioridade" : "Marcar prioridade"}
    </Button>
  );
}
