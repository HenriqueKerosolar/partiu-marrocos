import { prisma, withTenant } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { RespostaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "atendimento.view")) redirect("/dashboard");
  const podeResponder = hasPermission(ctx, "atendimento.manage");

  const { conversas, selecionada } = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const conversas = await tx.conversation.findMany({
      where: { tenantId: ctx.tenantId! },
      include: { contact: true },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
    });

    const idSelecionado = searchParams.c || conversas[0]?.id;
    const selecionada = idSelecionado
      ? await tx.conversation.findUnique({
          where: { id: idSelecionado },
          include: { contact: true, messages: { orderBy: { createdAt: "asc" } } },
        })
      : null;

    return { conversas, selecionada };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox <HelpButton helpKey="inbox.overview" /></h1>
        <p className="text-sm text-muted-foreground">Conversas de WhatsApp e outros canais.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{conversas.length} conversa(s)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {conversas.map((c) => (
              <a
                key={c.id}
                href={`/inbox?c=${c.id}`}
                className={`flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted ${c.id === selecionada?.id ? "bg-muted" : ""}`}
              >
                <span className="font-medium">{c.contact.nome}</span>
                <Badge variant="muted">{c.channel}</Badge>
              </a>
            ))}
            {conversas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              {selecionada ? selecionada.contact.nome : "Selecione uma conversa"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {selecionada && (
              <>
                <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                  {selecionada.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-md p-2 text-sm ${m.direction === "SAIDA" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"}`}
                    >
                      {m.conteudo}
                    </div>
                  ))}
                  {selecionada.messages.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                  )}
                </div>
                {podeResponder && selecionada.channel === "WHATSAPP" && <RespostaForm conversationId={selecionada.id} />}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
