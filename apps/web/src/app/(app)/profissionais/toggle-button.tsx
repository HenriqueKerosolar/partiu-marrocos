"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAtivoProfessionalAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";

export function AlternarAtivoButton({ professionalId, ativo }: { professionalId: string; ativo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await alternarAtivoProfessionalAction(professionalId, !ativo);
          router.refresh();
        })
      }
    >
      {ativo ? "Desativar" : "Reativar"}
    </Button>
  );
}
