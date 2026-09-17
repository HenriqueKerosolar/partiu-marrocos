"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarPoliticaComercialAction } from "@/app/actions/commercial-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PoliticaComercialForm({ limitesAtuais }: { limitesAtuais: { desconto: number; mudancaPreco: number; margem: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) =>
        startTransition(async () => {
          const r = await atualizarPoliticaComercialAction(formData);
          setErro(r.error ?? null);
          setSalvo(!r.error);
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="limiteDescontoRelevante">Desconto relevante (%)</Label>
          <Input id="limiteDescontoRelevante" name="limiteDescontoRelevante" type="number" step="0.1" min="0" max="100" defaultValue={limitesAtuais.desconto} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="limiteMudancaPrecoExcepcional">Mudança de preço excepcional (%)</Label>
          <Input id="limiteMudancaPrecoExcepcional" name="limiteMudancaPrecoExcepcional" type="number" step="0.1" min="0" max="100" defaultValue={limitesAtuais.mudancaPreco} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="limiteMargemMinima">Margem mínima (%)</Label>
          <Input id="limiteMargemMinima" name="limiteMargemMinima" type="number" step="0.1" min="0" max="100" defaultValue={limitesAtuais.margem} />
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {salvo && <p className="text-sm text-muted-foreground">Política atualizada.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        Salvar
      </Button>
    </form>
  );
}
