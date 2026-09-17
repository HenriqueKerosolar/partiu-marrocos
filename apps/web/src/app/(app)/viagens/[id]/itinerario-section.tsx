"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarDiaItinerarioAction, criarAtividadeAction } from "@/app/actions/trips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Atividade = { id: string; nome: string; local: string | null; horaInicio: string | null; visivelParaViajante: boolean };
type Dia = { id: string; numeroDia: number; data: string; titulo: string | null; atividades: Atividade[] };

export function ItinerarioSection({ tripId, itinerario, podeGerenciar }: { tripId: string; itinerario: Dia[]; podeGerenciar: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diaForm, setDiaForm] = useState(false);
  const [atividadeForm, setAtividadeForm] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Itinerário ({itinerario.length} dia(s))</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {itinerario.length === 0 && <p className="text-sm text-muted-foreground">Nenhum dia de itinerário criado ainda.</p>}
        {itinerario.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium">
              Dia {d.numeroDia} — {new Date(d.data).toLocaleDateString("pt-BR")} {d.titulo && `· ${d.titulo}`}
            </p>
            <div className="flex flex-col gap-1">
              {d.atividades.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  {a.horaInicio && <span className="text-muted-foreground">{a.horaInicio}</span>}
                  <span>{a.nome}</span>
                  {a.local && <span className="text-muted-foreground">— {a.local}</span>}
                  {!a.visivelParaViajante && <Badge variant="muted">interno</Badge>}
                </div>
              ))}
            </div>
            {podeGerenciar &&
              (atividadeForm === d.id ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  action={(formData) =>
                    startTransition(async () => {
                      await criarAtividadeAction(tripId, d.id, formData);
                      setAtividadeForm(null);
                      router.refresh();
                    })
                  }
                >
                  <Input name="nome" placeholder="Atividade" required className="h-7 w-40 text-xs" />
                  <Input name="horaInicio" placeholder="Hora (ex.: 09:00)" className="h-7 w-28 text-xs" />
                  <Input name="local" placeholder="Local" className="h-7 w-32 text-xs" />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" name="visivelParaViajante" defaultChecked className="h-3 w-3" /> visível ao viajante
                  </label>
                  <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                    Salvar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAtividadeForm(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <Button size="sm" variant="outline" className="w-fit text-xs" onClick={() => setAtividadeForm(d.id)}>
                  Adicionar atividade
                </Button>
              ))}
          </div>
        ))}

        {podeGerenciar &&
          (diaForm ? (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(formData) =>
                startTransition(async () => {
                  await criarDiaItinerarioAction(tripId, formData);
                  setDiaForm(false);
                  router.refresh();
                })
              }
            >
              <Input name="numeroDia" type="number" min="1" placeholder="Nº do dia" required className="h-8 w-24 text-xs" />
              <Input name="data" type="date" required className="h-8 text-xs" />
              <Input name="titulo" placeholder="Título (opcional)" className="h-8 w-40 text-xs" />
              <Button type="submit" size="sm" disabled={pending}>
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDiaForm(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setDiaForm(true)}>
              Adicionar dia
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
