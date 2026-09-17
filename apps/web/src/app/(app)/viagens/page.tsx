import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, listarTripsDoTenant, formatarDataHora } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { NovaTripForm } from "./form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PLANEJAMENTO: "Planejamento",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "muted" | "destructive"> = {
  PLANEJAMENTO: "muted",
  CONFIRMADA: "default",
  EM_ANDAMENTO: "default",
  CONCLUIDA: "default",
  CANCELADA: "destructive",
};

export default async function ViagensPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "trips.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "trips.manage");

  const trips = await listarTripsDoTenant(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Viagens (operação) <HelpButton helpKey="viagens.list" /></h1>
        <p className="text-sm text-muted-foreground">
          Execução operacional de uma partida — distinto da reserva comercial (Booking). Uma viagem pode reunir
          várias reservas da mesma partida.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Viagens ({trips.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {trips.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma viagem criada ainda.</p>}
          {trips.map((t) => (
            <Link key={t.id} href={`/viagens/${t.id}`} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {t.roteiro ?? "(sem roteiro definido)"} <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarDataHora(t.dataInicio, undefined, { dateStyle: "short", timeZone: t.timezone })} – {formatarDataHora(t.dataFim, undefined, { dateStyle: "short", timeZone: t.timezone })} · {t.bookings.length} reserva(s)
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Nova viagem</CardTitle>
            <CardDescription>Roteiro e mercado são texto livre — o motor não presume nenhum destino específico.</CardDescription>
          </CardHeader>
          <CardContent>
            <NovaTripForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
