"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarTripAction } from "@/app/actions/trips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NovaTripForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          const r = await criarTripAction(formData);
          if (r.ok && r.tripId) {
            router.push(`/viagens/${r.tripId}`);
          } else {
            router.refresh();
          }
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="roteiro">Roteiro</Label>
          <Input id="roteiro" name="roteiro" placeholder="Ex.: Marraquexe + Deserto, 8 dias" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mercado">Mercado (opcional)</Label>
          <Input id="mercado" name="mercado" placeholder="Ex.: BR, PT" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dataInicio">Data de início</Label>
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dataFim">Data de fim</Label>
          <Input id="dataFim" name="dataFim" type="date" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" placeholder="Ex.: Africa/Casablanca" defaultValue="Africa/Casablanca" required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="observacoes">Observações (opcional)</Label>
        <Input id="observacoes" name="observacoes" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        Criar viagem
      </Button>
    </form>
  );
}
