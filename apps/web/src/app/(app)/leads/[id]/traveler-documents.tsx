"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverStatusDocumentoAction } from "@/app/actions/travel-documents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type DocumentStatus = "PENDENTE" | "ENVIADO" | "EM_ANALISE" | "APROVADO" | "REJEITADO" | "EXPIRADO";
export type TravelerDocumentResumo = { id: string; status: DocumentStatus; requirementNome: string; requirementObrigatorio: boolean; motivoRejeicao: string | null };

const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDENTE: "Pendente",
  ENVIADO: "Enviado",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  EXPIRADO: "Expirado",
};

const STATUS_VARIANT: Record<DocumentStatus, "default" | "muted" | "destructive"> = {
  PENDENTE: "muted",
  ENVIADO: "muted",
  EM_ANALISE: "muted",
  APROVADO: "default",
  REJEITADO: "destructive",
  EXPIRADO: "destructive",
};

export function TravelerDocuments({ leadId, documents }: { leadId: string; documents: TravelerDocumentResumo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejeicaoAberta, setRejeicaoAberta] = useState<string | null>(null);

  if (documents.length === 0) return null;

  return (
    <div className="ml-4 flex flex-col gap-1">
      {documents.map((d) => (
        <div key={d.id} className="flex flex-col gap-1 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">{d.requirementNome}{!d.requirementObrigatorio && " (opcional)"}:</span>
            <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge>
            {d.status === "PENDENTE" && (
              <button className="underline" disabled={pending} onClick={() => startTransition(async () => { await moverStatusDocumentoAction(leadId, d.id, "ENVIADO"); router.refresh(); })}>
                marcar enviado
              </button>
            )}
            {(d.status === "ENVIADO" || d.status === "EM_ANALISE") && (
              <>
                <button className="underline" disabled={pending} onClick={() => startTransition(async () => { await moverStatusDocumentoAction(leadId, d.id, "APROVADO"); router.refresh(); })}>
                  aprovar
                </button>
                <button className="underline" disabled={pending} onClick={() => setRejeicaoAberta(d.id)}>
                  rejeitar
                </button>
              </>
            )}
            {(d.status === "REJEITADO" || d.status === "EXPIRADO") && (
              <button className="underline" disabled={pending} onClick={() => startTransition(async () => { await moverStatusDocumentoAction(leadId, d.id, "ENVIADO"); router.refresh(); })}>
                marcar reenviado
              </button>
            )}
          </div>
          {d.motivoRejeicao && <p className="text-destructive">Motivo: {d.motivoRejeicao}</p>}
          {rejeicaoAberta === d.id && (
            <form
              className="flex flex-wrap items-center gap-1"
              action={(formData) =>
                startTransition(async () => {
                  await moverStatusDocumentoAction(leadId, d.id, "REJEITADO", formData);
                  setRejeicaoAberta(null);
                  router.refresh();
                })
              }
            >
              <Input name="motivoRejeicao" placeholder="Motivo da rejeição" required className="h-6 w-40 text-xs" />
              <Button type="submit" size="sm" className="h-6 px-2 text-xs" disabled={pending}>
                Confirmar
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setRejeicaoAberta(null)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
