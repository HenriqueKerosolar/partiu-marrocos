import { redirect } from "next/navigation";
import { prisma, obterLimitesComerciais } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HelpButton } from "@/components/help-button";
import { PoliticaComercialForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PoliticaComercialPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "politica_comercial.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "politica_comercial.manage");

  const limites = await obterLimitesComerciais(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Política comercial <HelpButton helpKey="politica.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Limiares que decidem quando o envio de uma proposta precisa de aprovação (Gate comercial) antes de ir ao
          cliente. Sem configuração própria, o tenant usa os valores padrão da fundação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Limiares atuais</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Desconto relevante (sobre preço de referência):</span>{" "}
            <span className="font-medium">{(limites.limiteDescontoRelevante * 100).toFixed(1)}%</span>
          </p>
          <p>
            <span className="text-muted-foreground">Mudança de preço excepcional (entre versões):</span>{" "}
            <span className="font-medium">{(limites.limiteMudancaPrecoExcepcional * 100).toFixed(1)}%</span>
          </p>
          <p>
            <span className="text-muted-foreground">Margem mínima aceitável:</span>{" "}
            <span className="font-medium">{(limites.limiteMargemMinima * 100).toFixed(1)}%</span>
          </p>
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Atualizar limiares</CardTitle>
            <CardDescription>Valores em porcentagem (ex.: 15 para 15%). Deixe em branco para não alterar um campo.</CardDescription>
          </CardHeader>
          <CardContent>
            <PoliticaComercialForm limitesAtuais={{ desconto: limites.limiteDescontoRelevante * 100, mudancaPreco: limites.limiteMudancaPrecoExcepcional * 100, margem: limites.limiteMargemMinima * 100 }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
