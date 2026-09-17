import { prisma, contarJobsPorStatus, listarJobsRecentes, obterSaudeFila, formatarDataHora, type JobStatus } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help-button";
import { CancelarJobButton, ReenviarJobButton } from "./acoes-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<JobStatus, string> = {
  PENDING: "Pendente (dependência)",
  READY: "Pronto",
  RUNNING: "Executando",
  BLOCKED: "Bloqueado (Gate)",
  RETRY_WAIT: "Aguardando retry",
  SUCCEEDED: "Concluído",
  FAILED: "Falhou",
  DEAD_LETTER: "Falha definitiva",
  CANCELLED: "Cancelado",
};

const STATUS_VARIANT: Record<JobStatus, "default" | "muted" | "destructive"> = {
  PENDING: "muted",
  READY: "muted",
  RUNNING: "default",
  BLOCKED: "destructive",
  RETRY_WAIT: "muted",
  SUCCEEDED: "default",
  FAILED: "destructive",
  DEAD_LETTER: "destructive",
  CANCELLED: "muted",
};

/** ms → "Xs"/"Xmin"/"Xh", pra leitura rápida na UI. */
function formatarDuracao(ms: number): string {
  const segundos = Math.floor(ms / 1000);
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos}min`;
  return `${Math.floor(minutos / 60)}h`;
}

export default async function JobsPage() {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "jobs.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "jobs.manage");

  const [contagem, recentes, saude] = await Promise.all([
    contarJobsPorStatus(prisma, ctx.tenantId!),
    listarJobsRecentes(prisma, ctx.tenantId!, 50),
    obterSaudeFila(prisma),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Jobs <HelpButton helpKey="jobs.overview" /></h1>
        <p className="text-sm text-muted-foreground">
          Fila de execução assíncrona (T5) — WhatsApp, follow-ups e outras ações em background. Requer o worker
          rodando (<code className="text-xs">pnpm --filter web worker</code>) para processar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Saúde da fila</CardTitle>
          <CardDescription>Contagem global (todos os tenants) — um worker parado afeta todo mundo, não só este tenant.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {saude.nenhumWorkerAtivo ? (
            <p className="font-medium text-destructive">
              Nenhum worker ativo detectado{saude.workers.length > 0 ? " (o(s) registrado(s) está(ão) sem heartbeat recente)" : ""} — jobs não estão sendo processados.
            </p>
          ) : (
            <p className="font-medium">
              {saude.workers.filter((w) => w.ativo).length} worker(s) ativo(s).
            </p>
          )}
          {saude.workers.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {saude.workers.map((w) => (
                <li key={w.workerId} className="flex items-center gap-2">
                  <Badge variant={w.ativo ? "default" : "destructive"}>{w.ativo ? "ativo" : "possivelmente parado"}</Badge>
                  <span>
                    {w.workerId} · {w.jobsProcessados} job(s) processados · último heartbeat há {formatarDuracao(Date.now() - w.lastHeartbeatAt.getTime())}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {saude.readyMaisAntigoIdadeMs !== null && (
            <p className={saude.readyMaisAntigoIdadeMs > 60_000 ? "text-destructive" : "text-muted-foreground"}>
              Job pronto mais antigo esperando há {formatarDuracao(saude.readyMaisAntigoIdadeMs)}
              {saude.readyMaisAntigoIdadeMs > 60_000 ? " — fila pode estar acumulando." : "."}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        {(Object.keys(STATUS_LABEL) as JobStatus[]).map((status) => (
          <Card key={status}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{contagem[status]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Jobs recentes ({recentes.length})</CardTitle>
          <CardDescription>Ordenados por última atualização.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recentes.map((job) => (
            <div key={job.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{job.type}</span>
                  <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  tentativa {job.attempts}/{job.maxAttempts} · prioridade {job.priority} · atualizado em {formatarDataHora(job.updatedAt)}
                </p>
                {job.lastError && <p className="text-xs text-destructive">{job.lastError}</p>}
              </div>
              {podeGerenciar && (
                <div className="flex gap-1">
                  {(job.status === "FAILED" || job.status === "DEAD_LETTER") && <ReenviarJobButton jobId={job.id} />}
                  {job.status !== "SUCCEEDED" && job.status !== "FAILED" && job.status !== "DEAD_LETTER" && job.status !== "CANCELLED" && <CancelarJobButton jobId={job.id} />}
                </div>
              )}
            </div>
          ))}
          {recentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum job ainda.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
