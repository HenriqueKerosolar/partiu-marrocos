import { notFound, redirect } from "next/navigation";
import { prisma, buscarTicket } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { TicketStatusControls } from "./status-controls";
import { ResponderForm } from "./responder-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ABERTO: "Aberto", EM_ANDAMENTO: "Em andamento", RESOLVIDO: "Resolvido", FECHADO: "Fechado" };

export default async function TicketDetalhePage({ params }: { params: { id: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "ouvidoria.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "ouvidoria.manage");

  const ticket = await buscarTicket(prisma, ctx.tenantId!, params.id);
  if (!ticket) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {ticket.protocolo} — {ticket.assunto} <HelpButton helpKey="ouvidoria.detail" />
        </h1>
        <p className="text-sm text-muted-foreground">
          {ticket.categoria} · {ticket.prioridade}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Badge>{STATUS_LABEL[ticket.status]}</Badge>
          {podeGerenciar && <TicketStatusControls ticketId={ticket.id} statusAtual={ticket.status} />}
          {ticket.avaliacaoNota && (
            <p className="text-sm text-muted-foreground">
              Avaliação do cliente: {"★".repeat(ticket.avaliacaoNota)}
              {ticket.avaliacaoComentario ? ` — "${ticket.avaliacaoComentario}"` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Mensagens ({ticket.mensagens.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ticket.mensagens.map((m) => (
            <div key={m.id} className="rounded-md border border-border p-2 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{m.autorTipo === "EQUIPE" ? "Equipe" : "Cliente"}</p>
              <p>{m.corpo}</p>
            </div>
          ))}
          {podeGerenciar && ticket.status !== "FECHADO" && <ResponderForm ticketId={ticket.id} />}
        </CardContent>
      </Card>
    </div>
  );
}
