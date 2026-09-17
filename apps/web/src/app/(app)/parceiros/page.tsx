import { redirect } from "next/navigation";
import { prisma, listarPartners } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { PartnerForm } from "./form";
import { AlternarAtivoButton } from "./toggle-button";

export const dynamic = "force-dynamic";

export default async function ParceirosPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "parceiros.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "parceiros.manage");

  const parceiros = await listarPartners(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Parceiros <HelpButton helpKey="parceiros.overview" /></h1>
        <p className="text-sm text-muted-foreground">Pessoas ou empresas externas que indicam clientes e recebem comissão por isso — sempre externo, distinto do vendedor interno de uma reserva.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Parceiros ({parceiros.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {parceiros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum parceiro cadastrado ainda.</p>}
          {parceiros.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {p.nome} <Badge variant={p.ativo ? "default" : "muted"}>{p.ativo ? "Ativo" : "Inativo"}</Badge> <Badge variant="muted">{p.codigo}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{[p.tipo, p.contato, p.email].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {podeGerenciar && <AlternarAtivoButton partnerId={p.id} ativo={p.ativo} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo parceiro</CardTitle>
            <CardDescription>O código é o identificador público que o parceiro usa para indicar clientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <PartnerForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
