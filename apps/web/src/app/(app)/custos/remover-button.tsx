"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removerPoliticaCusto } from "@/app/actions/cost";
import { Button } from "@/components/ui/button";

export function RemoverPoliticaButton({ politicaId }: { politicaId: string }) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);

  async function onRemover() {
    if (!window.confirm("Remover esta política de custo? Consumo já registrado não é afetado.")) return;
    setRemovendo(true);
    try {
      await removerPoliticaCusto(politicaId);
      router.refresh();
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={removendo} onClick={onRemover} className="text-destructive">
      Remover
    </Button>
  );
}
