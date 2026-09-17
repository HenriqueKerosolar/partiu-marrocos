import { redirect } from "next/navigation";
import { prisma, listarRequisitos } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { RequisitoForm } from "./form";
import { DesativarRequisitoButton } from "./desativar-button";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "documentos.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "documentos.manage");

  const requisitos = await listarRequisitos(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Requisitos documentais <HelpButton helpKey="documentos.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Catálogo do que cada passageiro precisa entregar (ex.: &quot;Passaporte válido&quot;). Ao adicionar um
          passageiro numa reserva, uma pendência é criada automaticamente para cada requisito ativo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Requisitos ativos ({requisitos.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {requisitos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum requisito configurado ainda.</p>}
          {requisitos.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {r.nome} <Badge variant={r.obrigatorio ? "destructive" : "muted"}>{r.obrigatorio ? "Obrigatório" : "Opcional"}</Badge>
                </p>
                {r.descricao && <p className="text-xs text-muted-foreground">{r.descricao}</p>}
              </div>
              {podeGerenciar && <DesativarRequisitoButton requirementId={r.id} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo requisito</CardTitle>
            <CardDescription>Passageiros já existentes não são afetados retroativamente — só novos passageiros adicionados depois disso recebem essa pendência automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequisitoForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
