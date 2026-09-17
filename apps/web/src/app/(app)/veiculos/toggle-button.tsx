"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAtivoTourVehicleAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";

export function AlternarAtivoButton({ veiculoId, ativo }: { veiculoId: string; ativo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await alternarAtivoTourVehicleAction(veiculoId, !ativo);
          router.refresh();
        })
      }
    >
      {ativo ? "Desativar" : "Reativar"}
    </Button>
  );
}
