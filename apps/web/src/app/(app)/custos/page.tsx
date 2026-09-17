import { prisma, withTenant, listarPoliticas, obterConsumoAtual, periodoChaveAtual } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { NovaPoliticaForm } from "./form";
import { RemoverPoliticaButton } from "./remover-button";

export const dynamic = "force-dynamic";

const ESCOPO_LABEL: Record<string, string> = {
  TENANT: "Todo o tenant",
  PROVIDER: "Provider",
  MODEL: "Model",
  CAPABILITY: "Capability",
  AGENT: "Agente",
};

const PERIODO_LABEL: Record<string, string> = {
  POR_CHAMADA: "Por chamada",
  DIARIO: "Diário",
  MENSAL: "Mensal",
};

export default async function CustosPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "cost.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "cost.manage");

  const [politicas, consumo, usages] = await Promise.all([
    listarPoliticas(prisma, ctx.tenantId!),
    obterConsumoAtual(prisma, ctx.tenantId!, "USD"),
    withTenant(prisma, ctx.tenantId!, (tx) => tx.costUsage.findMany({ where: { tenantId: ctx.tenantId! } })),
  ]);

  const agora = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Custos <HelpButton helpKey="custos.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Controle de custo técnico/IA (T2) — não é o financeiro comercial do Partiu: aqui é só o teto técnico que o
          Yalla/integrações não devem ultrapassar sem decisão humana.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Consumo hoje (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">${consumo.hoje.toFixed(6)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Consumo este mês (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">${consumo.mes.toFixed(6)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Políticas de limite ({politicas.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {politicas.map((p) => {
            const periodoChave = periodoChaveAtual(p.periodo, agora);
            const usage = periodoChave ? usages.find((u) => u.escopo === p.escopo && u.escopoValor === p.escopoValor && p.periodo === u.periodo && u.periodoChave === periodoChave) : null;
            const acumulado = usage?.acumulado ?? null;
            const percentual = acumulado !== null ? (p.limite.isZero() ? 100 : acumulado.div(p.limite).mul(100).toNumber()) : null;
            const status = percentual === null ? null : percentual >= 100 ? "estourado" : percentual >= p.alertaPercentual.toNumber() ? "alerta" : "ok";

            return (
              <div key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {ESCOPO_LABEL[p.escopo] ?? p.escopo}
                    {p.escopoValor ? ` — ${p.escopoValor}` : ""} · {PERIODO_LABEL[p.periodo] ?? p.periodo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Limite: {p.moeda} {p.limite.toString()} · Alerta em {p.alertaPercentual.toString()}%
                    {acumulado !== null && ` · Consumido: ${p.moeda} ${acumulado.toString()} (${percentual!.toFixed(1)}%)`}
                    {!p.ativo && " · Inativa"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status && (
                    <Badge variant={status === "estourado" ? "destructive" : status === "alerta" ? "default" : "muted"}>
                      {status === "estourado" ? "Bloqueado" : status === "alerta" ? "Alerta" : "Normal"}
                    </Badge>
                  )}
                  {podeGerenciar && <RemoverPoliticaButton politicaId={p.id} />}
                </div>
              </div>
            );
          })}
          {politicas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma política configurada — sem limite, todo consumo é permitido.</p>}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Nova política</CardTitle>
            <CardDescription>
              Define um teto de custo técnico. Escopo &quot;Todo o tenant&quot; não precisa de valor; os demais exigem o
              nome exato (ex.: provider=&quot;anthropic&quot;, agente=&quot;yalla&quot;).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NovaPoliticaForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
