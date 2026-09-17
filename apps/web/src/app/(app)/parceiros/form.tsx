"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPartnerAction } from "@/app/actions/partners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PartnerForm() {
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
          const r = await criarPartnerAction(formData);
          setErro(r.error ?? null);
          if (r.ok) formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Agência Local Ltda" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="codigo">Código</Label>
          <Input id="codigo" name="codigo" placeholder="Ex.: PARC01" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tipo">Tipo (opcional)</Label>
          <Input id="tipo" name="tipo" placeholder="Ex.: agência, influenciador" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contato">Contato (opcional)</Label>
          <Input id="contato" name="contato" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">E-mail (opcional)</Label>
          <Input id="email" name="email" type="email" />
        </div>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        Cadastrar parceiro
      </Button>
    </form>
  );
}
