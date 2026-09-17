"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarTripGroupAction,
  atribuirProfissionalAction,
  removerProfissionalAction,
  vincularBookingAoGrupoAction,
  desvincularBookingDoGrupoAction,
  atualizarProgressoParadaAction,
} from "@/app/actions/operacao-turistica";
import { emitirCredencialAction } from "@/app/actions/checkin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveMap } from "@/components/maps/live-map";

type Papel = "GUIA" | "MOTORISTA";
type ProgressoStatus = "PLANEJADA" | "ATUAL" | "CONCLUIDA" | "PULADA";

type Grupo = {
  id: string;
  nome: string;
  veiculo: { id: string; nome: string; capacidade: number };
  profissionais: { professionalId: string; papel: Papel; professional: { nome: string } }[];
  bookings: { id: string; leadId: string; travelerCount: number; travelers: { id: string; nome: string }[] }[];
  progresso: { tripActivityId: string; status: ProgressoStatus }[];
};

type Veiculo = { id: string; nome: string; capacidade: number };
type Profissional = { id: string; nome: string };
type BookingDisponivel = { id: string; leadId: string; travelerCount: number };
type Atividade = { id: string; nome: string; diaTitulo: string };

const PROGRESSO_LABEL: Record<ProgressoStatus, string> = { PLANEJADA: "Planejada", ATUAL: "Atual", CONCLUIDA: "Concluída", PULADA: "Pulada" };

export function GruposSection({
  tripId,
  grupos,
  veiculosDisponiveis,
  profissionaisDisponiveis,
  bookingsSemGrupo,
  atividades,
  podeGerenciar,
  podeEmitirCredencial,
  podeVerMapa,
}: {
  tripId: string;
  grupos: Grupo[];
  veiculosDisponiveis: Veiculo[];
  profissionaisDisponiveis: Profissional[];
  bookingsSemGrupo: BookingDisponivel[];
  atividades: Atividade[];
  podeGerenciar: boolean;
  podeEmitirCredencial: boolean;
  podeVerMapa: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novoGrupoForm, setNovoGrupoForm] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [crewForm, setCrewForm] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState<string | null>(null);
  const [tokenGerado, setTokenGerado] = useState<{ travelerNome: string; token: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Grupos operacionais ({grupos.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo operacional criado ainda.</p>}
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        {tokenGerado && (
          <div className="flex flex-col gap-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
            <p>
              Credencial de <strong>{tokenGerado.travelerNome}</strong> — mostre este código ao passageiro (só aparece uma vez):
            </p>
            <code className="break-all rounded bg-muted px-2 py-1">{tokenGerado.token}</code>
            <a href={`/checkin?token=${tokenGerado.token}`} className="w-fit text-primary underline">
              Abrir em /checkin (uso da equipe)
            </a>
            <a href={`/minha-viagem?token=${tokenGerado.token}`} target="_blank" rel="noreferrer" className="w-fit text-primary underline">
              Link para enviar ao passageiro (Minha viagem)
            </a>
            <button className="w-fit text-muted-foreground underline" onClick={() => setTokenGerado(null)}>
              fechar
            </button>
          </div>
        )}

        {grupos.map((g) => {
          const ocupacao = g.bookings.reduce((soma, b) => soma + b.travelerCount, 0);
          return (
            <div key={g.id} className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {g.nome} <Badge variant="muted">{g.veiculo.nome}</Badge>
                </p>
                <span className="text-xs text-muted-foreground">
                  {ocupacao}/{g.veiculo.capacidade} passageiros
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Crew</p>
                {g.profissionais.length === 0 && <p className="text-xs text-muted-foreground">Nenhum profissional atribuído.</p>}
                {g.profissionais.map((p) => (
                  <div key={`${p.professionalId}-${p.papel}`} className="flex items-center gap-2 text-xs">
                    <span>{p.professional.nome}</span>
                    <Badge variant="muted">{p.papel === "GUIA" ? "Guia" : "Motorista"}</Badge>
                    {podeGerenciar && (
                      <button
                        className="text-muted-foreground underline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await removerProfissionalAction(tripId, g.id, p.professionalId, p.papel);
                            setErro(r.error ?? null);
                            router.refresh();
                          })
                        }
                      >
                        remover
                      </button>
                    )}
                  </div>
                ))}
                {podeGerenciar &&
                  (crewForm === g.id ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      action={(formData) =>
                        startTransition(async () => {
                          const r = await atribuirProfissionalAction(tripId, g.id, formData);
                          setErro(r.error ?? null);
                          if (r.ok) setCrewForm(null);
                          router.refresh();
                        })
                      }
                    >
                      <select name="professionalId" className="h-7 rounded-md border border-input bg-background px-1 text-xs" required defaultValue="">
                        <option value="" disabled>
                          Profissional...
                        </option>
                        {profissionaisDisponiveis.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                      <select name="papel" className="h-7 rounded-md border border-input bg-background px-1 text-xs" defaultValue="GUIA">
                        <option value="GUIA">Guia</option>
                        <option value="MOTORISTA">Motorista</option>
                      </select>
                      <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                        Atribuir
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCrewForm(null)}>
                        Cancelar
                      </Button>
                    </form>
                  ) : (
                    <Button size="sm" variant="outline" className="w-fit text-xs" onClick={() => setCrewForm(g.id)}>
                      Atribuir profissional
                    </Button>
                  ))}
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Reservas no grupo</p>
                {g.bookings.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma reserva vinculada ainda.</p>}
                {g.bookings.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs">
                    <span>{b.travelerCount} passageiro(s)</span>
                    {podeGerenciar && (
                      <button
                        className="text-muted-foreground underline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await desvincularBookingDoGrupoAction(tripId, b.id);
                            router.refresh();
                          })
                        }
                      >
                        desvincular
                      </button>
                    )}
                  </div>
                ))}
                {podeGerenciar && bookingsSemGrupo.length > 0 && (
                  bookingForm === g.id ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      action={(formData) =>
                        startTransition(async () => {
                          const r = await vincularBookingAoGrupoAction(tripId, g.id, formData);
                          setErro(r.error ?? null);
                          if (r.ok) setBookingForm(null);
                          router.refresh();
                        })
                      }
                    >
                      <select name="bookingId" className="h-7 rounded-md border border-input bg-background px-1 text-xs" required defaultValue="">
                        <option value="" disabled>
                          Reserva...
                        </option>
                        {bookingsSemGrupo.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.travelerCount} passageiro(s) — {b.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                        Vincular
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setBookingForm(null)}>
                        Cancelar
                      </Button>
                    </form>
                  ) : (
                    <Button size="sm" variant="outline" className="w-fit text-xs" onClick={() => setBookingForm(g.id)}>
                      Vincular reserva
                    </Button>
                  )
                )}
              </div>

              {podeEmitirCredencial && g.bookings.some((b) => b.travelers.length > 0) && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Credenciais (check-in)</p>
                  {g.bookings.flatMap((b) => b.travelers).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span>{t.nome}</span>
                      <button
                        className="text-muted-foreground underline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await emitirCredencialAction(tripId, g.id, t.id);
                            if (r.error) setErro(r.error);
                            else if (r.token) setTokenGerado({ travelerNome: t.nome, token: r.token });
                            router.refresh();
                          })
                        }
                      >
                        gerar credencial
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {podeVerMapa && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Mapa ao vivo</p>
                  <LiveMap tripGroupId={g.id} />
                </div>
              )}

              {atividades.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Progresso de paradas</p>
                  {atividades.map((a) => {
                    const status = g.progresso.find((p) => p.tripActivityId === a.id)?.status ?? "PLANEJADA";
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <span>
                          {a.diaTitulo} · {a.nome}
                        </span>
                        <Badge variant={status === "ATUAL" ? "default" : "muted"}>{PROGRESSO_LABEL[status]}</Badge>
                        {podeGerenciar && (
                          <select
                            className="h-6 rounded-md border border-input bg-background px-1 text-xs"
                            value={status}
                            disabled={pending}
                            onChange={(e) =>
                              startTransition(async () => {
                                await atualizarProgressoParadaAction(tripId, g.id, a.id, e.target.value as ProgressoStatus);
                                router.refresh();
                              })
                            }
                          >
                            {(Object.keys(PROGRESSO_LABEL) as ProgressoStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {PROGRESSO_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {podeGerenciar &&
          (novoGrupoForm ? (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(formData) =>
                startTransition(async () => {
                  const r = await criarTripGroupAction(tripId, formData);
                  setErro(r.error ?? null);
                  if (r.ok) setNovoGrupoForm(false);
                  router.refresh();
                })
              }
            >
              <Input name="nome" placeholder="Nome do grupo (ex.: Van 1)" required className="h-8 w-48 text-xs" />
              <select name="veiculoId" className="h-8 rounded-md border border-input bg-background px-1 text-xs" required defaultValue="">
                <option value="" disabled>
                  Veículo...
                </option>
                {veiculosDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} (cap. {v.capacidade})
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={pending}>
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setNovoGrupoForm(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setNovoGrupoForm(true)}>
              Adicionar grupo operacional
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
