import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    environment: "node",
    // PM-CONV-06, §5E — os testes de Job Engine que drenam a fila global
    // (tests/helpers/job-queue.ts) legitimamente processam jobs de OUTROS
    // arquivos de teste concorrentes antes de chegar na própria job, sob
    // execução paralela real — o default de 5s do Vitest é curto demais
    // pra isso mesmo sem nada errado. Não é encobrir bug nenhum: é dar
    // margem real pro trabalho real que a fila global compartilhada exige.
    testTimeout: 15000,
    // PM-CONV-06, §5E — Bug #4: sobe UMA VEZ, no processo orquestrador, antes
    // de qualquer worker do Vitest existir — ver o comentário completo em
    // tests/setup/whatsapp-mock-server.ts (substitui vi.stubGlobal("fetch")
    // por arquivo, que não protege contra outro arquivo executar o MESMO job
    // de verdade sob a fila global compartilhada).
    globalSetup: ["./tests/setup/whatsapp-mock-server.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Fora do bundler da Next, "server-only" lançaria sempre (ver
      // tests/mocks/server-only-empty.ts) — necessário para testar módulos
      // como lib/ai/yalla.ts e lib/session.ts diretamente no Vitest.
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only-empty.ts"),
    },
  },
});
