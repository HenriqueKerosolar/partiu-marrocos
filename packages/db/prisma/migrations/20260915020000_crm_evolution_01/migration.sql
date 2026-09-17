-- CRM Evolution 01 (PM-NIGHT-RUN-01, Etapa 3) — puramente aditiva, defaults
-- seguros (prioridade=false, tarefas existentes viram GERAL, notas
-- existentes ficam com tipo=null). Nenhum dado existente é reescrito.

-- CreateEnum
CREATE TYPE "NoteTipo" AS ENUM ('OBSERVACAO', 'INTERESSE', 'INTENCAO', 'PREFERENCIA', 'INFERENCIA', 'PENDENCIA', 'STAGE_CHANGE', 'HANDOFF', 'REPESCAGEM');

-- CreateEnum
CREATE TYPE "TaskTipo" AS ENUM ('FOLLOWUP', 'GERAL');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "motivo_perda" TEXT,
ADD COLUMN     "prioridade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "tipo" "NoteTipo";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "tipo" "TaskTipo" NOT NULL DEFAULT 'GERAL';

