"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarPoliticaCusto } from "@/app/actions/cost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NovaPoliticaForm() {
  const router = useRouter();
  const [escopo, setEscopo] = useState("TENANT");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await salvarPoliticaCusto(formData);
      if (res.error) {
        setErro(res.error);
        return;
      }
      e.currentTarget.reset();
      setEscopo("TENANT");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="escopo">Escopo</Label>
          <select
            id="escopo"
            name="escopo"
            value={escopo}
            onChange={(e) => setEscopo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="TENANT">Todo o tenant</option>
            <option value="PROVIDER">Provider (ex.: anthropic)</option>
            <option value="MODEL">Model</option>
            <option value="CAPABILITY">Capability</option>
            <option value="AGENT">Agente (ex.: yalla)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="escopoValor">Valor do escopo</Label>
          <Input id="escopoValor" name="escopoValor" placeholder={escopo === "TENANT" ? "não se aplica" : "ex.: anthropic"} disabled={escopo === "TENANT"} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo">Período</Label>
          <select id="periodo" name="periodo" defaultValue="DIARIO" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="POR_CHAMADA">Por chamada</option>
            <option value="DIARIO">Diário</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="limite">Limite</Label>
          <Input id="limite" name="limite" type="number" step="any" min="0" placeholder="ex.: 10" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="moeda">Moeda</Label>
          <Input id="moeda" name="moeda" defaultValue="USD" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alertaPercentual">Alerta em (%)</Label>
          <Input id="alertaPercentual" name="alertaPercentual" type="number" step="any" min="0" max="100" defaultValue="80" />
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Salvar política"}
      </Button>
    </form>
  );
}
