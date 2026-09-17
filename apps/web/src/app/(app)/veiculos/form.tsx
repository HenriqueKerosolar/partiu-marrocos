"use client";

import { useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { criarTourVehicleAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TourVehicleForm() {
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
          const r = await criarTourVehicleAction(formData);
          setErro(r.error ?? null);
          if (r.ok) formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Van 1" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacidade">Capacidade (passageiros)</Label>
          <Input id="capacidade" name="capacidade" type="number" min={1} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="placa">Placa (opcional)</Label>
          <Input id="placa" name="placa" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="categoria">Categoria (opcional)</Label>
          <Input id="categoria" name="categoria" placeholder="Ex.: van, ônibus" />
        </div>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        Cadastrar veículo
      </Button>
    </form>
  );
}
