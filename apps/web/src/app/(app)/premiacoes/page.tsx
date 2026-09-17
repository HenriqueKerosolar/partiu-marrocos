import { redirect } from "next/navigation";
import { prisma, listarRewardCampaigns, formatarMoeda } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { RewardCampaignForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PremiacoesPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "premiacoes.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "premiacoes.manage");

  const campanhas = await listarRewardCampaigns(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Premiações <HelpButton helpKey="premiacoes.overview" /></h1>
        <p className="text-sm text-muted-foreground">Campanhas de premiação por meta de vendas para parceiros — distintas de comissão por venda individual. Pagamento sempre passa por aprovação.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Campanhas ({campanhas.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {campanhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>}
          {campanhas.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {c.nome} <Badge variant={c.ativo ? "default" : "muted"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Meta: {c.meta} vendas · Prêmio: {formatarMoeda(c.valor, c.moeda)} · {new Date(c.dataInicio).toLocaleDateString("pt-BR")} – {new Date(c.dataFim).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Nova campanha</CardTitle>
            <CardDescription>Um parceiro pode solicitar a premiação quando atingir a meta de vendas confirmadas dentro da janela de datas.</CardDescription>
          </CardHeader>
          <CardContent>
            <RewardCampaignForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
