import Link from "next/link";
import { prisma, contarNaoLidas } from "@partiumarrocos/db";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuthContext();
  const naoLidas = await contarNaoLidas(prisma, ctx.tenantId!, ctx.user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm font-semibold">Partiu Marrocos</p>
            <p className="text-xs text-muted-foreground">{ctx.role?.nome}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {hasPermission(ctx, "leads.view") && (
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                Painel
              </Link>
            )}
            {hasPermission(ctx, "leads.view") && (
              <Link href="/leads" className="text-muted-foreground hover:text-foreground">
                Leads
              </Link>
            )}
            {hasPermission(ctx, "atendimento.view") && (
              <Link href="/inbox" className="text-muted-foreground hover:text-foreground">
                Inbox
              </Link>
            )}
            {hasPermission(ctx, "whatsapp.manage") && (
              <Link href="/canais" className="text-muted-foreground hover:text-foreground">
                Canais
              </Link>
            )}
            {hasPermission(ctx, "gates.view") && (
              <Link href="/gates" className="text-muted-foreground hover:text-foreground">
                Aprovações
              </Link>
            )}
            {hasPermission(ctx, "cost.view") && (
              <Link href="/custos" className="text-muted-foreground hover:text-foreground">
                Custos
              </Link>
            )}
            {hasPermission(ctx, "politica_comercial.view") && (
              <Link href="/politica-comercial" className="text-muted-foreground hover:text-foreground">
                Política comercial
              </Link>
            )}
            {hasPermission(ctx, "documentos.view") && (
              <Link href="/documentos" className="text-muted-foreground hover:text-foreground">
                Documentos
              </Link>
            )}
            {hasPermission(ctx, "trips.view") && (
              <Link href="/viagens" className="text-muted-foreground hover:text-foreground">
                Viagens
              </Link>
            )}
            {hasPermission(ctx, "profissionais.view") && (
              <Link href="/profissionais" className="text-muted-foreground hover:text-foreground">
                Profissionais
              </Link>
            )}
            {hasPermission(ctx, "fornecedores.view") && (
              <Link href="/fornecedores" className="text-muted-foreground hover:text-foreground">
                Fornecedores
              </Link>
            )}
            {hasPermission(ctx, "veiculos.view") && (
              <Link href="/veiculos" className="text-muted-foreground hover:text-foreground">
                Veículos
              </Link>
            )}
            {hasPermission(ctx, "checkin.view") && (
              <Link href="/checkin" className="text-muted-foreground hover:text-foreground">
                Check-in
              </Link>
            )}
            {hasPermission(ctx, "operacoes.view") && (
              <Link href="/operacoes" className="text-muted-foreground hover:text-foreground">
                Central de Operações
              </Link>
            )}
            {hasPermission(ctx, "parceiros.view") && (
              <Link href="/parceiros" className="text-muted-foreground hover:text-foreground">
                Parceiros
              </Link>
            )}
            {hasPermission(ctx, "premiacoes.view") && (
              <Link href="/premiacoes" className="text-muted-foreground hover:text-foreground">
                Premiações
              </Link>
            )}
            {hasPermission(ctx, "ouvidoria.view") && (
              <Link href="/ouvidoria" className="text-muted-foreground hover:text-foreground">
                Ouvidoria
              </Link>
            )}
            {hasPermission(ctx, "jobs.view") && (
              <Link href="/jobs" className="text-muted-foreground hover:text-foreground">
                Jobs
              </Link>
            )}
            {hasPermission(ctx, "avaliacoes.view") && (
              <Link href="/avaliacoes" className="text-muted-foreground hover:text-foreground">
                Avaliações
              </Link>
            )}
            <Link href="/notificacoes" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              Notificações
              {naoLidas > 0 && <Badge>{naoLidas}</Badge>}
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
