import { redirect } from "next/navigation";
import { prisma, listarTourVehicles } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { TourVehicleForm } from "./form";
import { AlternarAtivoButton } from "./toggle-button";

export const dynamic = "force-dynamic";

export default async function VeiculosPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "veiculos.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "veiculos.manage");

  const veiculos = await listarTourVehicles(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Veículos <HelpButton helpKey="veiculos.overview" /></h1>
        <p className="text-sm text-muted-foreground">Recursos de operação turística (ônibus, van, carro) — não é o domínio de telemetria/OBD2, que vive em projeto separado.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Veículos ({veiculos.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {veiculos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado ainda.</p>}
          {veiculos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {v.nome} <Badge variant={v.ativo ? "default" : "muted"}>{v.ativo ? "Ativo" : "Inativo"}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Capacidade: {v.capacidade} {[v.placa, v.categoria].filter(Boolean).length > 0 ? `· ${[v.placa, v.categoria].filter(Boolean).join(" · ")}` : ""}
                </p>
              </div>
              {podeGerenciar && <AlternarAtivoButton veiculoId={v.id} ativo={v.ativo} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo veículo</CardTitle>
            <CardDescription>Usado ao montar um grupo operacional numa viagem — a capacidade limita quantos passageiros o grupo comporta.</CardDescription>
          </CardHeader>
          <CardContent>
            <TourVehicleForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
