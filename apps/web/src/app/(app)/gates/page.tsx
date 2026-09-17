import { prisma, withTenant, listarGatesPendentes, formatarDataHora } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { GateDecisaoForm } from "./form";

export const dynamic = "force-dynamic";

const CATEGORIA_LABEL: Record<string, string> = {
  FINANCEIRO: "Financeiro",
  COMERCIAL: "Comercial",
  PUBLICACAO_EXTERNA: "Publicação externa",
  ORCAMENTO_PUBLICIDADE: "Orçamento de publicidade",
  EXCLUSAO_DADO: "Exclusão de dado",
  ACAO_PRIVILEGIADA: "Ação privilegiada",
  ACAO_IRREVERSIVEL: "Ação irreversível",
};

export default async function GatesPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "gates.view")) redirect("/dashboard");
  const podeDecidir = hasPermission(ctx, "gates.decide");

  const pendentes = await listarGatesPendentes(prisma, ctx.tenantId!);

  const decididosRecentes = await withTenant(prisma, ctx.tenantId!, (tx) =>
    tx.gate.findMany({
      where: { tenantId: ctx.tenantId!, status: { not: "PENDENTE" } },
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Aprovações <HelpButton helpKey="gates.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Ações de risco que o agente Yalla solicitou e precisam de decisão humana antes de acontecer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{pendentes.length} pendente(s)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pendentes.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <Badge variant="muted">{CATEGORIA_LABEL[g.categoria] ?? g.categoria}</Badge>
                <span className="text-xs text-muted-foreground">
                  solicitado por {g.solicitanteLabel ?? "sistema"} · expira em {formatarDataHora(new Date(g.expiresAt))}
                </span>
              </div>
              <p className="font-medium">{g.acaoProposta}</p>
              <p className="text-xs text-muted-foreground">{g.motivo}</p>
              {podeDecidir && <GateDecisaoForm gateId={g.id} />}
            </div>
          ))}
          {pendentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente.</p>}
        </CardContent>
      </Card>

      {decididosRecentes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Decisões recentes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {decididosRecentes.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{g.acaoProposta}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.decidedAt ? formatarDataHora(new Date(g.decidedAt)) : ""}
                  </p>
                </div>
                <Badge variant={g.status === "APROVADO" ? "default" : g.status === "EXPIRADO" ? "muted" : "destructive"}>{g.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
