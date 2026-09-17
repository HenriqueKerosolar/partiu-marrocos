"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAtivoSupplierAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";

export function AlternarAtivoButton({ supplierId, ativo }: { supplierId: string; ativo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await alternarAtivoSupplierAction(supplierId, !ativo);
          router.refresh();
        })
      }
    >
      {ativo ? "Desativar" : "Reativar"}
    </Button>
  );
}
