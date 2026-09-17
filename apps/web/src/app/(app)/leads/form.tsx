"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarLead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NovoLeadForm({ stages }: { stages: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await criarLead(formData);
      if (res.error) {
        setErro(res.error);
        return;
      }
      e.currentTarget.reset();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" placeholder="5521999998888" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="origem">Origem</Label>
          <Input id="origem" name="origem" placeholder="instagram, site..." />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="valor">Valor estimado</Label>
          <Input id="valor" name="valor" type="number" step="0.01" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stageId">Etapa</Label>
          <select id="stageId" name="stageId" required className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Criar lead"}
      </Button>
    </form>
  );
}
