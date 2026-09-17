import { redirect } from "next/navigation";
import { prisma, listarSuppliers } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { SupplierForm } from "./form";
import { AlternarAtivoButton } from "./toggle-button";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "fornecedores.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "fornecedores.manage");

  const fornecedores = await listarSuppliers(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores <HelpButton helpKey="fornecedores.overview" /></h1>
        <p className="text-sm text-muted-foreground">Hotéis, restaurantes, agências locais e demais parceiros operacionais. Contas a pagar completas ficam para uma etapa futura.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Fornecedores ({fornecedores.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {fornecedores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>}
          {fornecedores.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {f.nome} <Badge variant={f.ativo ? "default" : "muted"}>{f.ativo ? "Ativo" : "Inativo"}</Badge>
                  {f.tipo && <Badge variant="muted">{f.tipo}</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{[f.cidade, f.contato, f.email].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {podeGerenciar && <AlternarAtivoButton supplierId={f.id} ativo={f.ativo} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo fornecedor</CardTitle>
            <CardDescription>Pode ser referenciado depois numa atividade de itinerário.</CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
