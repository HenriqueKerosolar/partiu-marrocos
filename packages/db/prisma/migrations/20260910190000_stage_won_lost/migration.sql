-- AlterTable
ALTER TABLE "stages" ADD COLUMN     "is_lost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_won" BOOLEAN NOT NULL DEFAULT false;

