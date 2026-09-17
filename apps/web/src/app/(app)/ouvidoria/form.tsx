"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirTicketAction } from "@/app/actions/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NovoTicketForm() {
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
          const r = await abrirTicketAction(formData);
          setErro(r.error ?? null);
          if (r.ok && r.ticketId) {
            router.push(`/ouvidoria/${r.ticketId}`);
            return;
          }
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="assunto">Assunto</Label>
          <Input id="assunto" name="assunto" placeholder="Ex.: Atraso no embarque" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="categoria">Categoria</Label>
          <select id="categoria" name="categoria" className="h-9 rounded-md border border-input bg-background px-2 text-sm" defaultValue="DUVIDA">
            <option value="RECLAMACAO">Reclamação</option>
            <option value="ELOGIO">Elogio</option>
            <option value="DUVIDA">Dúvida</option>
            <option value="SOLICITACAO">Solicitação</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mensagemInicial">Mensagem</Label>
        <textarea id="mensagemInicial" name="mensagemInicial" required rows={3} className="rounded-md border border-input bg-background p-2 text-sm" />
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        Abrir ticket
      </Button>
    </form>
  );
}
