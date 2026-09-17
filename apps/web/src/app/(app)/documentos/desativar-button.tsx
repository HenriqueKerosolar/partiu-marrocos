"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { desativarRequisitoAction } from "@/app/actions/travel-documents";
import { Button } from "@/components/ui/button";

export function DesativarRequisitoButton({ requirementId }: { requirementId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await desativarRequisitoAction(requirementId);
          router.refresh();
        })
      }
    >
      Desativar
    </Button>
  );
}
