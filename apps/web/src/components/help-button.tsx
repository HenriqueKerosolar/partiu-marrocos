"use client";

import { useState, useTransition } from "react";
import { buscarAjudaAction, buscarAjudaPublicaAction } from "@/app/actions/help";
import type { HelpContent } from "@partiumarrocos/db";

/**
 * PM-CONV-04, Track B, §8B — Caixa de Ajuda NÃO INVASIVA: um botão "?"
 * pequeno que abre um popover flutuante (position: absolute, nunca
 * reorganiza a página, nunca aumenta permanentemente cards/headers).
 * Fecha ao clicar fora ou no X. Conteúdo vem de `resolverAjuda` (packages/
 * db/src/help) — nunca mostra a `helpKey` crua se não houver conteúdo.
 *
 * `publico`: usado nas páginas do site público (visitante sem sessão) —
 * chama `buscarAjudaPublicaAction` em vez de `buscarAjudaAction`
 * (`requireAuthContext` redirecionaria pro /login e quebraria o botão ali).
 */
export function HelpButton({ helpKey, publico = false, align = "left" }: { helpKey: string; publico?: boolean; align?: "left" | "right" }) {
  const [aberto, setAberto] = useState(false);
  const [conteudo, setConteudo] = useState<HelpContent | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setAberto(true);
    if (!conteudo) startTransition(async () => setConteudo(await (publico ? buscarAjudaPublicaAction(helpKey) : buscarAjudaAction(helpKey))));
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-label="Ajuda desta página"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/40 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        ?
      </button>
      {aberto && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-6 z-50 w-80 rounded-md border border-border bg-background p-3 text-xs shadow-lg`}>
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="font-medium">{conteudo?.titulo ?? (pending ? "Carregando..." : "Ajuda")}</p>
            <button type="button" onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar ajuda">
              ×
            </button>
          </div>
          {conteudo ? (
            <div className="flex flex-col gap-1 text-muted-foreground">
              <p>{conteudo.objetivo}</p>
              <p>
                <strong className="text-foreground">Quem usa:</strong> {conteudo.quemUsa}
              </p>
              {conteudo.campos && (
                <p>
                  <strong className="text-foreground">Campos:</strong> {conteudo.campos}
                </p>
              )}
              {conteudo.estados && (
                <p>
                  <strong className="text-foreground">Estados:</strong> {conteudo.estados}
                </p>
              )}
              {conteudo.acoes && (
                <p>
                  <strong className="text-foreground">Ações:</strong> {conteudo.acoes}
                </p>
              )}
              {conteudo.avisos && (
                <p>
                  <strong className="text-foreground">Aviso:</strong> {conteudo.avisos}
                </p>
              )}
            </div>
          ) : (
            !pending && <p className="text-muted-foreground">Ajuda ainda não disponível para esta página.</p>
          )}
        </div>
      )}
    </span>
  );
}
