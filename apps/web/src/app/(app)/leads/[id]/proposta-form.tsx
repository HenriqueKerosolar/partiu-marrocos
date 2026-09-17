"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPropostaAction } from "@/app/actions/proposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PropostaForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        Nova proposta
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      action={(formData) =>
        startTransition(async () => {
          const r = await criarPropostaAction(leadId, formData);
          if (r.error) {
            setErro(r.error);
            return;
          }
          setErro(null);
          setAberto(false);
          formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="preco">Preço</Label>
          <Input id="preco" name="preco" type="number" step="0.01" min="0" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="moeda">Moeda</Label>
          <Input id="moeda" name="moeda" defaultValue="BRL" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="precoReferencia">Preço de referência (opcional)</Label>
          <Input id="precoReferencia" name="precoReferencia" type="number" step="0.01" min="0" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="custos">Custos (opcional)</Label>
          <Input id="custos" name="custos" type="number" step="0.01" min="0" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="quantidadePassageiros">Passageiros</Label>
          <Input id="quantidadePassageiros" name="quantidadePassageiros" type="number" min="1" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="validade">Válida até</Label>
          <Input id="validade" name="validade" type="date" required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="roteiro">Roteiro</Label>
        <Input id="roteiro" name="roteiro" placeholder="Ex.: Marraquexe + deserto, 8 dias" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="condicoes">Condições comerciais</Label>
        <Input id="condicoes" name="condicoes" placeholder="Ex.: 30% de sinal, saldo 15 dias antes" />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="condicaoExcepcional" className="h-3.5 w-3.5" /> Condição comercial excepcional
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="compromissoExternoSensivel" className="h-3.5 w-3.5" /> Compromisso externo sensível
        </label>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Salvar rascunho
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
