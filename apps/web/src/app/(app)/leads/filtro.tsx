"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LeadsFiltro({
  responsaveis,
  origens,
  valores,
}: {
  responsaveis: { id: string; email: string }[];
  origens: string[];
  valores: { q: string; responsavel: string; origem: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(valores.q);
  const [responsavel, setResponsavel] = useState(valores.responsavel);
  const [origem, setOrigem] = useState(valores.origem);

  function aplicar() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (responsavel) params.set("responsavel", responsavel);
    if (origem) params.set("origem", origem);
    router.push(`/leads${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const temFiltro = !!(valores.q || valores.responsavel || valores.origem);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Buscar (nome ou telefone)</label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aplicar()}
          placeholder="Ex.: Maria, 5521..."
          className="h-9 w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Responsável</label>
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Todos</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.email}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Origem</label>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Todas</option>
          {origens.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <Button size="sm" onClick={aplicar}>
        Filtrar
      </Button>
      {temFiltro && (
        <Button size="sm" variant="outline" onClick={() => router.push("/leads")}>
          Limpar
        </Button>
      )}
    </div>
  );
}
