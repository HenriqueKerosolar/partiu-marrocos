"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarTravelerCareAction } from "@/app/actions/operacao-turistica";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type TravelerCareResumo = { dieta: string | null; condicoes: string | null; medicamentos: string | null; frequencia: string | null; consentimento: boolean };

/**
 * PM-CONV-03, §8 — dado sensível: colapsado por padrão, nunca aparece na
 * listagem normal do passageiro. Exige `passageiros.dados_sensiveis.view`
 * pra sequer renderizar (controlado pelo componente pai) e `.manage` +
 * checkbox de consentimento pra gravar qualquer campo.
 */
export function TravelerCareSection({ leadId, travelerId, care, podeGerenciar }: { leadId: string; travelerId: string; care: TravelerCareResumo | null; podeGerenciar: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const temInfo = !!(care?.dieta || care?.condicoes || care?.medicamentos || care?.frequencia);

  return (
    <div className="text-xs">
      <button className="text-muted-foreground underline" onClick={() => setAberto((v) => !v)}>
        dados de atendimento {temInfo && <Badge variant="muted">preenchido</Badge>}
      </button>
      {aberto && (
        <div className="mt-1 flex flex-col gap-1 rounded-md border border-dashed border-border p-2">
          {!podeGerenciar ? (
            <>
              <p>Dieta: {care?.dieta || "—"}</p>
              <p>Condições: {care?.condicoes || "—"}</p>
              <p>Medicamentos: {care?.medicamentos || "—"}</p>
              <p>Frequência: {care?.frequencia || "—"}</p>
            </>
          ) : (
            <form
              className="flex flex-col gap-1"
              action={(formData) =>
                startTransition(async () => {
                  const r = await registrarTravelerCareAction(leadId, travelerId, formData);
                  setErro(r.error ?? null);
                  router.refresh();
                })
              }
            >
              <input name="dieta" defaultValue={care?.dieta ?? ""} placeholder="Dieta" className="h-6 rounded border border-input bg-background px-1 text-xs" />
              <input name="condicoes" defaultValue={care?.condicoes ?? ""} placeholder="Condições" className="h-6 rounded border border-input bg-background px-1 text-xs" />
              <input name="medicamentos" defaultValue={care?.medicamentos ?? ""} placeholder="Medicamentos" className="h-6 rounded border border-input bg-background px-1 text-xs" />
              <input name="frequencia" defaultValue={care?.frequencia ?? ""} placeholder="Frequência" className="h-6 rounded border border-input bg-background px-1 text-xs" />
              <label className="flex items-center gap-1 text-muted-foreground">
                <input type="checkbox" name="consentimento" defaultChecked={care?.consentimento} className="h-3 w-3" /> passageiro/responsável consentiu o registro desta informação
              </label>
              {erro && <p className="text-destructive">{erro}</p>}
              <Button type="submit" size="sm" className="h-6 w-fit px-2 text-xs" disabled={pending}>
                Salvar
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
