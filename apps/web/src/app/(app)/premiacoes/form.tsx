"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarRewardCampaignAction } from "@/app/actions/partners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RewardCampaignForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          const r = await criarRewardCampaignAction(formData);
          setErro(r.error ?? null);
          if (r.ok) formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Meta de verão 2026" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="meta">Meta (nº de vendas)</Label>
          <Input id="meta" name="meta" type="number" min={1} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="valor">Valor do prêmio</Label>
          <Input id="valor" name="valor" type="number" step="0.01" min={0.01} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="moeda">Moeda</Label>
          <Input id="moeda" name="moeda" defaultValue="BRL" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dataInicio">Início</Label>
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dataFim">Fim</Label>
          <Input id="dataFim" name="dataFim" type="date" required />
        </div>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        Criar campanha
      </Button>
    </form>
  );
}
