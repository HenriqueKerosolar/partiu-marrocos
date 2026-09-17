"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverLeadEtapa } from "@/app/actions/leads";

export function MoverEtapaSelect({
  leadId,
  etapaAtualId,
  etapas,
}: {
  leadId: string;
  etapaAtualId: string;
  etapas: { id: string; nome: string; isLost?: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={etapaAtualId}
      disabled={pending}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      onChange={(e) => {
        const novoStageId = e.target.value;
        const novaEtapa = etapas.find((et) => et.id === novoStageId);
        // Etapa terminal de perda: pede o motivo antes de gravar (Lead.motivoPerda
        // — CRM Evolution 01). Cancelar o prompt cancela a troca de etapa.
        let motivoPerda: string | undefined;
        if (novaEtapa?.isLost) {
          const resposta = window.prompt(`Motivo de perda para mover para "${novaEtapa.nome}" (opcional):`);
          if (resposta === null) {
            e.target.value = etapaAtualId;
            return;
          }
          motivoPerda = resposta;
        }
        startTransition(async () => {
          await moverLeadEtapa(leadId, novoStageId, motivoPerda);
          router.refresh();
        });
      }}
    >
      {etapas.map((et) => (
        <option key={et.id} value={et.id}>
          {et.nome}
        </option>
      ))}
    </select>
  );
}
