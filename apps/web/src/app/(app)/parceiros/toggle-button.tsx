"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAtivoPartnerAction } from "@/app/actions/partners";
import { Button } from "@/components/ui/button";

export function AlternarAtivoButton({ partnerId, ativo }: { partnerId: string; ativo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await alternarAtivoPartnerAction(partnerId, !ativo);
          router.refresh();
        })
      }
    >
      {ativo ? "Desativar" : "Reativar"}
    </Button>
  );
}
