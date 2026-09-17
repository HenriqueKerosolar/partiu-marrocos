"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GateDecisaoForm({ gateId }: { gateId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function decidir(decisao: "APROVADO" | "REJEITADO") {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/gates/${gateId}/decidir`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisao }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Falha ao decidir.");
        return;
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Button size="sm" disabled={enviando} onClick={() => decidir("APROVADO")}>
          Aprovar
        </Button>
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => decidir("REJEITADO")}>
          Rejeitar
        </Button>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
