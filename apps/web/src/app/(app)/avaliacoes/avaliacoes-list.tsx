"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicarDepoimentoAction, despublicarDepoimentoAction } from "@/app/actions/avaliacoes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AvaliacaoItem = {
  id: string;
  nota: number;
  comentario: string | null;
  depoimentoAutorizado: boolean;
  depoimentoPublicado: boolean;
  createdAt: string; // ISO
  roteiro: string | null;
  travelerNomes: string[];
};

export function AvaliacoesList({ avaliacoes, podeGerenciar }: { avaliacoes: AvaliacaoItem[]; podeGerenciar: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (avaliacoes.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>;

  return (
    <div className="flex flex-col gap-2">
      {avaliacoes.map((a) => (
        <div key={a.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {"★".repeat(a.nota)}
              {"☆".repeat(5 - a.nota)} — {a.roteiro ?? "Viagem sem roteiro definido"}
            </p>
            <div className="flex items-center gap-2">
              {a.depoimentoAutorizado ? <Badge variant="default">Consentiu depoimento</Badge> : <Badge variant="muted">Sem consentimento</Badge>}
              {a.depoimentoPublicado && <Badge variant="default">Publicado</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{a.travelerNomes.join(", ") || "Passageiro"} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}</p>
          {a.comentario && <p>{a.comentario}</p>}
          {podeGerenciar && a.depoimentoAutorizado && (
            <div>
              {a.depoimentoPublicado ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await despublicarDepoimentoAction(a.id);
                      router.refresh();
                    })
                  }
                >
                  Despublicar depoimento
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await publicarDepoimentoAction(a.id);
                      router.refresh();
                    })
                  }
                >
                  Publicar como depoimento
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
