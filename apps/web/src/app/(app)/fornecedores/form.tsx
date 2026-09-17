"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSupplierAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SupplierForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          await criarSupplierAction(formData);
          formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Riad Marrakech Centro" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tipo">Tipo (opcional)</Label>
          <Input id="tipo" name="tipo" placeholder="Ex.: hotel, restaurante" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cidade">Cidade (opcional)</Label>
          <Input id="cidade" name="cidade" />
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
      <Button type="submit" disabled={pending} className="w-fit">
        Cadastrar fornecedor
      </Button>
    </form>
  );
}
