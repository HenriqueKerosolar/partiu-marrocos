import { redirect } from "next/navigation";
import { prisma, listarAvaliacoesDoTenant } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { HelpButton } from "@/components/help-button";
import { AvaliacoesList } from "./avaliacoes-list";

export const dynamic = "force-dynamic";

export default async function AvaliacoesPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "avaliacoes.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "avaliacoes.manage");

  const avaliacoes = await listarAvaliacoesDoTenant(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Avaliações <HelpButton helpKey="avaliacoes.overview" /></h1>
        <p className="text-sm text-muted-foreground">Avaliações e depoimentos registrados pelos próprios clientes após a viagem concluir. Publicar um depoimento exige consentimento explícito já registrado.</p>
      </div>
      <AvaliacoesList avaliacoes={avaliacoes.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))} podeGerenciar={podeGerenciar} />
    </div>
  );
}
