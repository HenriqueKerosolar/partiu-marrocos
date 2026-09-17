import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma, listarTickets } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { NovoTicketForm } from "./form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ABERTO: "Aberto", EM_ANDAMENTO: "Em andamento", RESOLVIDO: "Resolvido", FECHADO: "Fechado" };
const STATUS_VARIANT: Record<string, "default" | "muted" | "destructive"> = { ABERTO: "destructive", EM_ANDAMENTO: "default", RESOLVIDO: "muted", FECHADO: "muted" };

export default async function OuvidoriaPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "ouvidoria.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "ouvidoria.manage");

  const tickets = await listarTickets(prisma, ctx.tenantId!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ouvidoria <HelpButton helpKey="ouvidoria.list" /></h1>
        <p className="text-sm text-muted-foreground">Reclamações, elogios, dúvidas e solicitações pós-venda — distinto do Inbox (atendimento em tempo real).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Tickets ({tickets.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ticket registrado ainda.</p>}
          {tickets.map((t) => (
            <Link key={t.id} href={`/ouvidoria/${t.id}`} className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted/50">
              <div>
                <p className="font-medium">
                  {t.protocolo} — {t.assunto} <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{t.categoria} · {t.prioridade}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {podeGerenciar && (
        <Card>
          <CardHeader>
            <CardTitle>Novo ticket</CardTitle>
            <CardDescription>Um protocolo é gerado automaticamente ao abrir.</CardDescription>
          </CardHeader>
          <CardContent>
            <NovoTicketForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
