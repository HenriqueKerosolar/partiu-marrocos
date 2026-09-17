import { prisma, withTenant, obterDashboardExecutivo, formatarMoeda } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "leads.view")) {
    return <p className="text-sm text-muted-foreground">Você não tem permissão para ver leads.</p>;
  }

  const [leads, contatos, abertos] = await withTenant(prisma, ctx.tenantId!, (tx) =>
    Promise.all([
      tx.lead.count(),
      tx.contact.count(),
      tx.lead.count({ where: { status: "ABERTO" } }),
    ]),
  );

  const podeVerOperacao = hasPermission(ctx, "trips.view");
  const podeVerFinanceiro = hasPermission(ctx, "payments.view");
  const podeVerAutomacao = hasPermission(ctx, "cost.view");
  const precisaExecutivo = podeVerOperacao || podeVerFinanceiro || podeVerAutomacao;
  const executivo = precisaExecutivo ? await obterDashboardExecutivo(prisma, ctx.tenantId!) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel <HelpButton helpKey="dashboard.overview" /></h1>
        <p className="text-sm text-muted-foreground">Visão geral do funil comercial.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Leads no funil</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{leads}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Leads em aberto</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{abertos}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Contatos cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{contatos}</CardContent>
        </Card>
      </div>

      {podeVerOperacao && executivo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Operação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Viagens ativas</p>
              <p className="text-2xl font-semibold">{executivo.operacao.viagensAtivas}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ocupação</p>
              <p className="text-2xl font-semibold">{executivo.operacao.ocupacaoPercentual === null ? "—" : `${executivo.operacao.ocupacaoPercentual}%`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Check-in / Embarcados</p>
              <p className="text-2xl font-semibold">
                {executivo.operacao.checkinsRealizados} / {executivo.operacao.embarcados}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">No-show</p>
              <p className="text-2xl font-semibold">{executivo.operacao.noShow}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Veículos ativos</p>
              <p className="text-2xl font-semibold">{executivo.operacao.veiculosAtivos}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Profissionais ativos</p>
              <p className="text-2xl font-semibold">{executivo.operacao.profissionaisAtivos}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reservas (total)</p>
              <p className="text-2xl font-semibold">{executivo.bookings.total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Passageiros (total)</p>
              <p className="text-2xl font-semibold">{executivo.bookings.passageiros}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {podeVerFinanceiro && executivo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                {executivo.financeiro.recebido.length === 0 ? <p>—</p> : executivo.financeiro.recebido.map((v) => <p key={v.moeda}>{formatarMoeda(v.valor, v.moeda)}</p>)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">A receber</p>
                {executivo.financeiro.aReceber.length === 0 ? <p>—</p> : executivo.financeiro.aReceber.map((v) => <p key={v.moeda}>{formatarMoeda(v.valor, v.moeda)}</p>)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comissão paga</p>
                {executivo.financeiro.comissaoPaga.length === 0 ? <p>—</p> : executivo.financeiro.comissaoPaga.map((v) => <p key={v.moeda}>{formatarMoeda(v.valor, v.moeda)}</p>)}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Margem {executivo.financeiro.margem.amostras > 0 ? `(${executivo.financeiro.margem.amostras} reserva(s) com custo informado)` : "(nenhuma reserva com custo informado ainda)"}
              </p>
              {executivo.financeiro.margem.porMoeda.length === 0 ? <p>—</p> : executivo.financeiro.margem.porMoeda.map((v) => <p key={v.moeda}>{formatarMoeda(v.valor, v.moeda)}</p>)}
            </div>
          </CardContent>
        </Card>
      )}

      {podeVerAutomacao && executivo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">IA / Automação (Yalla, este mês)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              <Badge variant="muted">{executivo.automacao.chamadasYallaMes} chamada(s)</Badge>
            </p>
            {executivo.automacao.chamadasYallaMes === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma chamada do Yalla registrada este mês — sem evento real, sem métrica de custo mostrada.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Custo estimado em USD: {executivo.automacao.custoYallaMesUsd === null ? "sem eventos em USD neste mês" : `$${executivo.automacao.custoYallaMesUsd.toFixed(4)}`}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
