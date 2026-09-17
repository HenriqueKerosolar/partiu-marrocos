import { prisma, withTenant } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { ContaWhatsappForm } from "./form";
import { ConfigIAForm } from "./ia-form";

export const dynamic = "force-dynamic";

export default async function CanaisPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "whatsapp.manage")) redirect("/dashboard");

  const { contas, tenant } = await withTenant(prisma, ctx.tenantId!, async (tx) => ({
    contas: await tx.whatsappAccount.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { createdAt: "asc" } }),
    tenant: await tx.tenant.findUnique({ where: { id: ctx.tenantId! } }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Canais <HelpButton helpKey="canais.whatsapp" /></h1>
        <p className="text-sm text-muted-foreground">
          Cadastre a conta do WhatsApp Cloud API (Meta) deste tenant. Cada empresa tem a sua própria conta — nada é
          compartilhado entre tenants.
        </p>
      </div>

      {contas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Contas cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {contas.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">phone_number_id: {c.phoneNumberId}</p>
                </div>
                <Badge variant={c.connectedAt ? "default" : "muted"}>{c.connectedAt ? "Configurada" : "Pendente"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nova conta WhatsApp Cloud API</CardTitle>
          <CardDescription>
            Dados vêm do painel Meta for Developers (App do WhatsApp Business). O webhook desta instalação é{" "}
            <code>/api/webhooks/whatsapp</code> — configure-o na Meta com o mesmo Verify Token informado aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContaWhatsappForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agente Yalla (resposta automática por IA)</CardTitle>
          <CardDescription>
            {tenant?.aiProvider
              ? `Ligado — respondendo automaticamente via ${tenant.aiProvider}. Chave nunca é exibida de novo depois de salva.`
              : "Desligado. Sem chave configurada, o atendimento continua manual (tela Inbox)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigIAForm
            ligado={!!tenant?.aiProvider}
            temChave={!!tenant?.aiApiKeySecretRef}
            providerAtual={tenant?.aiProvider ?? undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
