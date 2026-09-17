import { redirect } from "next/navigation";
import { prisma, listarProfessionals } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { ProfessionalForm } from "./form";
import { AlternarAtivoButton } from "./toggle-button";

export const dynamic = "force-dynamic";

export default async function ProfissionaisPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "profissionais.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "profissionais.manage");

  const profissionais = await listarProfessionals(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Profissionais <HelpButton helpKey="profissionais.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Guias e motoristas — cadastro único por pessoa. A mesma pessoa pode acumular os dois papéis ao ser atribuída a um grupo
          operacional, sem duplicar cadastro.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Profissionais ({profissionais.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {profissionais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado ainda.</p>}
          {profissionais.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {p.nome} <Badge variant={p.ativo ? "default" : "muted"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{[p.telefone, p.email, p.idiomas].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {podeGerenciar && <AlternarAtivoButton professionalId={p.id} ativo={p.ativo} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo profissional</CardTitle>
            <CardDescription>Papel (guia/motorista) é atribuído depois, ao vincular a um grupo operacional de uma viagem.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfessionalForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
