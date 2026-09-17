import { withSystem, reivindicarProximoJob, executarJobReivindicado } from "@partiumarrocos/db";

// apps/web não tem @prisma/client como dependência direta (só via
// @partiumarrocos/db) — tipos derivados estruturalmente das próprias
// funções já importadas, em vez de importar o pacote Prisma aqui.
type PrismaLike = Parameters<typeof reivindicarProximoJob>[0];
type JobRow = NonNullable<Awaited<ReturnType<typeof reivindicarProximoJob>>>;

/**
 * PM-CONV-06, Track E (§5E) — investigado: `reivindicarProximoJob` reivindica
 * a próxima job PRONTA de toda a fila, cross-tenant, por design (T5 — é
 * exatamente o comportamento correto de um pool de workers real disputando
 * uma fila global e justa via `FOR UPDATE SKIP LOCKED`). NÃO é um bug do
 * motor — confirmado por leitura direta de `packages/db/src/jobs/engine.ts`.
 *
 * O bug real era de ISOLAMENTO DE TESTE: vários arquivos deste pacote
 * (`job-lead-repescar`, `job-travel-document-verificar`, `job-whatsapp-resend`)
 * rodam como arquivos Vitest paralelos contra o MESMO Postgres, cada um
 * assumindo (errado) que "a próxima job reivindicada é sempre a minha" —
 * uma suposição que só vale com acesso exclusivo à fila, o que a suíte
 * paralela normal nunca garante (nem deveria: a fila cross-tenant é
 * intencional).
 *
 * Correção real (não workaround): em vez de reivindicar uma vez e comparar
 * o id, este helper drena a fila (reivindicando e executando o que vier,
 * exatamente como um worker de produção faria) até que a PRÓPRIA job
 * (identificada pelo id, relida do banco a cada iteração) saia de
 * READY/RETRY_WAIT. Executar uma job de outro arquivo de teste não corrompe
 * nada — cada job só é reivindicada por UM chamador (`SKIP LOCKED`), os
 * handlers já são idempotentes (mesma garantia que produção exige), e o
 * outro teste, ao rodar o mesmo drain, simplesmente vai encontrar sua job
 * já concluída (ou vai processá-la ele mesmo, se chegar primeiro).
 */
// Únicos status REALMENTE terminais (nunca mais mudam) — PENDING/READY/
// RUNNING/BLOCKED/RETRY_WAIT são todos "ainda em andamento". Achado real
// nesta correção: um primeiro rascunho deste helper tratava "!== READY &&
// !== RETRY_WAIT" como "terminou", o que retorna cedo demais quando a
// própria job está RUNNING — reivindicada por OUTRO arquivo de teste
// concorrente (thread separada do Vitest) bem no instante em que este loop
// relê a linha. Corrigido para only sair em status genuinamente terminal.
const STATUS_TERMINAIS = new Set(["SUCCEEDED", "FAILED", "DEAD_LETTER", "CANCELLED"]);

export async function processarJobAteConcluir(prisma: PrismaLike, jobId: string, tenantId: string, workerId: string, maxIteracoes = 60): Promise<JobRow> {
  for (let i = 0; i < maxIteracoes; i++) {
    const atual = await withSystem(prisma, (tx) => tx.job.findUniqueOrThrow({ where: { id: jobId } }));
    if (STATUS_TERMINAIS.has(atual.status)) return atual;

    const claimed = await reivindicarProximoJob(prisma, workerId);
    if (!claimed) {
      // Fila momentaneamente vazia (outro worker pode estar com a lease da
      // minha job neste instante) — espera curto e reavalia, nunca falha aqui.
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    await executarJobReivindicado(prisma, claimed, workerId);
  }

  throw new Error(`job ${jobId} (tenant ${tenantId}) não concluiu depois de ${maxIteracoes} iterações de drain — possível job travada na fila`);
}

/**
 * Variante de UMA tentativa só: reivindica (e executa) o que a fila global
 * devolver até a job específica (`jobId`) ter concluído mais UMA tentativa
 * — não só reivindicado. Não basta comparar `claimed.id === jobId` (um
 * worker de OUTRO arquivo de teste, rodando concorrentemente, pode
 * reivindicar e executar a MINHA job antes que este loop chegue nela) — e
 * também não basta olhar só `Job.attempts` subir: esse contador é
 * incrementado no MOMENTO DO CLAIM (`engine.ts`, `attempts:
 * proximaTentativa` dentro do mesmo update que muda o status pra RUNNING),
 * ANTES da execução em si terminar. Um rascunho anterior deste helper saía
 * cedo demais só com `attempts` subir, capturando a job ainda em RUNNING
 * (achado real, corrigido: exige também que o status não seja mais
 * RUNNING).
 */
export async function reivindicarUmaTentativa(prisma: PrismaLike, jobId: string, workerId: string, maxIteracoes = 60): Promise<void> {
  const inicial = await withSystem(prisma, (tx) => tx.job.findUniqueOrThrow({ where: { id: jobId } }));
  const attemptsAntes = inicial.attempts;
  if (STATUS_TERMINAIS.has(inicial.status)) return;

  for (let i = 0; i < maxIteracoes; i++) {
    const claimed = await reivindicarProximoJob(prisma, workerId);
    if (claimed) await executarJobReivindicado(prisma, claimed, workerId);

    const atual = await withSystem(prisma, (tx) => tx.job.findUniqueOrThrow({ where: { id: jobId } }));
    if (STATUS_TERMINAIS.has(atual.status)) return;
    if (atual.attempts > attemptsAntes && atual.status !== "RUNNING") return;

    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job ${jobId} não registrou nova tentativa depois de ${maxIteracoes} iterações — possível job travada na fila`);
}
