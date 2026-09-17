"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarRequisitoAction } from "@/app/actions/travel-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RequisitoForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          await criarRequisitoAction(formData);
          formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Passaporte válido" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="descricao">Descrição (opcional)</Label>
          <Input id="descricao" name="descricao" placeholder="Ex.: válido por pelo menos 6 meses" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="obrigatorio" defaultChecked className="h-4 w-4" /> Obrigatório
      </label>
      <Button type="submit" disabled={pending} className="w-fit">
        Criar requisito
      </Button>
    </form>
  );
}
