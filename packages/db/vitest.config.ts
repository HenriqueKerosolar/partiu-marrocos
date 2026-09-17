import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "node:path";

// .env vive na raiz do monorepo, não neste pacote.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Mesma razão de apps/web/vitest.config.ts (PM-CONV-06, §5E): testes de
    // integração fazem várias idas reais ao Postgres em sequência — sob
    // execução paralela de arquivos, o default de 5s do Vitest já foi visto
    // estourar por tempo real de trabalho legítimo, não por bug.
    testTimeout: 15000,
  },
});
