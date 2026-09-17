"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agendarRepescagemLeadAction } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";

/** Botão de conveniência — dispara o MESMO mecanismo que a tool `lead.agendar_repescagem` do Yalla: só enfileira uma reavaliação futura, nunca decide nem envia nada agora. */
export function AgendarRepescagemButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feito, setFeito] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || feito}
      onClick={() =>
        startTransition(async () => {
          await agendarRepescagemLeadAction(leadId);
          setFeito(true);
          router.refresh();
        })
      }
    >
      {feito ? "Repescagem agendada" : "Agendar repescagem"}
    </Button>
  );
}
