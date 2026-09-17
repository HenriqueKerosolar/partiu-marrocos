"use client";

import { useState, useTransition } from "react";
import { registrarAvaliacaoAction } from "@/app/actions/passageiro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * PM-CONV-10 — formulário de avaliação pós-viagem, direto na área do
 * passageiro (mesma credencial, nunca um segundo link/token). Consentimento
 * pra usar como depoimento é um checkbox SEPARADO da nota — nunca marcado
 * por padrão, nunca implícito por só enviar a avaliação.
 */
export function AvaliacaoForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (enviado) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Obrigado pela sua avaliação!</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Como foi a sua viagem?</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Nota ${n}`}
              aria-pressed={nota === n}
              onClick={() => setNota(n)}
              className={`h-9 w-9 rounded-md border text-sm ${nota !== null && n <= nota ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Conte como foi (opcional)"
          className="min-h-20 rounded-md border border-border bg-background p-2 text-sm"
        />
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} className="mt-0.5" />
          Autorizo a agência a usar meu comentário como depoimento público (a decisão de publicar continua sendo da agência).
        </label>
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <Button
          size="sm"
          className="w-fit"
          disabled={pending || nota === null}
          onClick={() =>
            startTransition(async () => {
              if (nota === null) return;
              const r = await registrarAvaliacaoAction(token, nota, comentario, autoriza);
              if (r.error) setErro(r.error);
              else setEnviado(true);
            })
          }
        >
          Enviar avaliação
        </Button>
      </CardContent>
    </Card>
  );
}
