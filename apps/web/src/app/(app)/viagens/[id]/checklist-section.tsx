"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarItemChecklistAction, alternarItemChecklistAction } from "@/app/actions/trips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Categoria = "DOCUMENTOS" | "PAGAMENTO" | "FORNECEDORES" | "TRANSPORTE" | "HOSPEDAGEM" | "ATIVIDADES" | "TRANSFER" | "OUTRO";
type Item = { id: string; categoria: Categoria; titulo: string; concluido: boolean };

const CATEGORIAS: Categoria[] = ["DOCUMENTOS", "PAGAMENTO", "FORNECEDORES", "TRANSPORTE", "HOSPEDAGEM", "ATIVIDADES", "TRANSFER", "OUTRO"];

export function ChecklistSection({ tripId, itens, podeGerenciar }: { tripId: string; itens: Item[]; podeGerenciar: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Checklist operacional ({itens.filter((i) => i.concluido).length}/{itens.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item de checklist ainda.</p>}
        {itens.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={i.concluido}
              disabled={pending || !podeGerenciar}
              onChange={(e) =>
                startTransition(async () => {
                  await alternarItemChecklistAction(tripId, i.id, e.target.checked);
                  router.refresh();
                })
              }
              className="h-4 w-4"
            />
            <span className={i.concluido ? "text-muted-foreground line-through" : ""}>{i.titulo}</span>
            <Badge variant="muted">{i.categoria}</Badge>
          </label>
        ))}

        {podeGerenciar &&
          (!mostrarForm ? (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setMostrarForm(true)}>
              Adicionar item
            </Button>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(formData) =>
                startTransition(async () => {
                  await criarItemChecklistAction(tripId, formData);
                  setMostrarForm(false);
                  router.refresh();
                })
              }
            >
              <select name="categoria" className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue="OUTRO">
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input name="titulo" placeholder="Título do item" required className="h-8 w-48 text-xs" />
              <Button type="submit" size="sm" disabled={pending}>
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarForm(false)}>
                Cancelar
              </Button>
            </form>
          ))}
      </CardContent>
    </Card>
  );
}
