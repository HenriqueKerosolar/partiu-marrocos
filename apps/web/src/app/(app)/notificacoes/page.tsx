import { prisma, listarNotificacoesDoUsuario } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { HelpButton } from "@/components/help-button";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

/**
 * PM-CONV-10 — Notifications Foundation. Sempre "minhas notificações" —
 * nunca um parâmetro de usuário, nunca uma tela de administração de
 * notificações de terceiros (mesmo princípio de toda ação "minhas coisas"
 * do produto).
 */
export default async function NotificacoesPage() {
  const ctx = await requireAuthContext();
  const notificacoes = await listarNotificacoesDoUsuario(prisma, ctx.tenantId!, ctx.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Notificações <HelpButton helpKey="notificacoes.overview" /></h1>
        <p className="text-sm text-muted-foreground">Avisos sobre eventos relevantes das suas reservas e tarefas — pagamento recebido, entre outros conforme forem cabeados.</p>
      </div>
      <NotificationList notificacoes={notificacoes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))} />
    </div>
  );
}
