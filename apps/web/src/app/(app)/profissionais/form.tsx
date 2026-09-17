"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarProfessionalAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfessionalForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          await criarProfessionalAction(formData);
          formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Ahmed Benali" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="telefone">Telefone (opcional)</Label>
          <Input id="telefone" name="telefone" placeholder="+212 6..." />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">E-mail (opcional)</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="idiomas">Idiomas (opcional)</Label>
          <Input id="idiomas" name="idiomas" placeholder="pt, en, fr" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        Cadastrar profissional
      </Button>
    </form>
  );
}
