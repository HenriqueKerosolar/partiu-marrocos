import { obterMinhaViagemAction } from "@/app/actions/passageiro";
import { formatarDataHora } from "@partiumarrocos/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvaliacaoForm } from "./avaliacao-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AGENDADO: "Agendado",
  CHECKIN_REALIZADO: "Check-in feito",
  EMBARCADO: "Embarcado",
  NO_SHOW: "Não compareceu",
  CANCELADO: "Cancelado",
};

/**
 * PM-CONV-05, Track B — área do passageiro. Página pública (sem login),
 * acesso via ?token=<credencial> — mesmo link que aparece em "Abrir em
 * /checkin" na página da viagem, agora também serve como o "cartão de
 * embarque digital" do próprio passageiro.
 */
export default async function MinhaViagemPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token?.trim() ?? "";

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Minha viagem</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Acesse pelo link que sua agência te enviou.</CardContent>
        </Card>
      </div>
    );
  }

  const r = await obterMinhaViagemAction(token);

  if (!r.ok || !r.contexto) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Minha viagem</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{r.error}</CardContent>
        </Card>
      </div>
    );
  }

  const { contexto } = r;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Olá, {contexto.travelerNome}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-lg font-medium">{contexto.roteiro ?? "Sua viagem"}</p>
          {contexto.dataInicio && contexto.dataFim && (
            <p className="text-muted-foreground">
              {formatarDataHora(new Date(contexto.dataInicio), undefined, { dateStyle: "short" })} – {formatarDataHora(new Date(contexto.dataFim), undefined, { dateStyle: "short" })}
            </p>
          )}
          <Badge className="w-fit">{STATUS_LABEL[contexto.statusCheckIn] ?? contexto.statusCheckIn}</Badge>
        </CardContent>
      </Card>

      {contexto.podeAvaliar && <AvaliacaoForm token={token} />}

      {(contexto.paradaAtual || contexto.proximaParada) && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4 text-sm">
            {contexto.paradaAtual && (
              <p>
                <span className="text-xs text-muted-foreground">Agora:</span> <span className="font-medium">{contexto.paradaAtual.nome}</span>
                {contexto.paradaAtual.local ? ` — ${contexto.paradaAtual.local}` : ""}
              </p>
            )}
            {contexto.proximaParada && (
              <p className="text-muted-foreground">
                <span className="text-xs">Próxima:</span> {contexto.proximaParada.nome}
                {contexto.proximaParada.local ? ` — ${contexto.proximaParada.local}` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {contexto.crew.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Sua equipe</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {contexto.crew.map((c, i) => (
              <p key={i}>
                {c.nome} — {c.papel === "GUIA" ? "Guia" : "Motorista"}
                {c.telefone ? ` · ${c.telefone}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {contexto.itinerario.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Roteiro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {contexto.itinerario.map((dia) => (
              <div key={dia.numeroDia}>
                <p className="font-medium">
                  Dia {dia.numeroDia}
                  {dia.diaTitulo ? ` — ${dia.diaTitulo}` : ""}
                </p>
                {dia.atividades.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem atividades divulgadas ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
                    {dia.atividades.map((a, i) => (
                      <li key={i} className="list-disc">
                        {a.horaInicio ? `${a.horaInicio} — ` : ""}
                        {a.nome}
                        {a.local ? ` (${a.local})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
