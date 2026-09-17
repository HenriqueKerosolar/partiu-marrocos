import http from "node:http";
import type { AddressInfo } from "node:net";
import { MOCK_FALHA_UMA_VEZ, MOCK_JANELA_FECHADA, MOCK_HANG } from "../helpers/whatsapp-mock";

/**
 * PM-CONV-06, §5E — Bug #4 real, encontrado por diagnóstico direto (não
 * suposição): rodar `job-whatsapp-resend.test.ts` sozinho passava 8/8 vezes
 * em loop; rodado junto da suíte completa, falhava ~3/10 vezes. Causa raiz:
 * `vi.stubGlobal("fetch", ...)` só existe dentro do processo/thread do
 * PRÓPRIO arquivo de teste (Vitest isola globals por arquivo). Mas a fila
 * do Job Engine é global de verdade (confirmado por leitura de engine.ts —
 * `reivindicarProximoJob` não filtra por tipo/tenant, por design de
 * produção) — então um job `whatsapp.enviar_mensagem` submetido por ESTE
 * arquivo podia ser reivindicado e EXECUTADO pelo drain loop de OUTRO
 * arquivo de teste rodando em paralelo, cujo `fetch` real (não mockado)
 * fazia uma chamada de verdade pra Graph API da Meta com credenciais falsas
 * — não intercedida pelo `fetchMock` local do arquivo que submeteu o job,
 * daí os asserts de `toHaveBeenCalledTimes`/status ficarem imprevisíveis.
 *
 * Correção real (não um workaround de reduzir paralelismo de volta):
 * substituir o mock POR PROCESSO por um mock COMPARTILHADO de verdade — um
 * servidor HTTP real, único para toda a execução do Vitest (`globalSetup`
 * roda uma vez, ANTES de qualquer worker subir, no processo orquestrador),
 * alcançável por socket TCP real de qualquer thread/processo que os workers
 * do Vitest usarem. O comportamento (sucesso/falha transitória/janela
 * fechada/nunca responder) agora é decidido pelo CONTEÚDO do payload que
 * viaja com o próprio Job (nunca por estado local de um processo específico)
 * — então não importa mais qual arquivo acaba executando o job, o resultado
 * é sempre o mesmo, determinístico.
 */

const chamadasPorChave = new Map<string, number>();
const abortsPorChave = new Map<string, number>();

function chaveDoDestino(phoneNumberId: string, to: string): string {
  return `${phoneNumberId}:${to}`;
}

export default async function setup(): Promise<() => Promise<void>> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/__test__/count") {
      const chave = url.searchParams.get("key") ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ count: chamadasPorChave.get(chave) ?? 0, aborted: abortsPorChave.get(chave) ?? 0 }));
      return;
    }

    // POST /:phoneNumberId/messages — único endpoint que os testes atuais exercitam.
    const partes = url.pathname.split("/").filter(Boolean);
    if (req.method !== "POST" || partes.length !== 2 || partes[1] !== "messages") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rota não simulada pelo mock" } }));
      return;
    }
    const phoneNumberId = partes[0]!;

    let corpo = "";
    let respondido = false;
    // `res.on("close")` é o sinal robusto (funciona em qualquer versão
    // recente do Node): dispara sempre que a conexão subjacente fecha,
    // respondida ou não — se fechou ANTES de `res.end()` ser chamado, foi
    // o cliente quem encerrou (abort real do `fetch`), nunca o servidor.
    res.on("close", () => {
      if (respondido) return;
      const to = extrairTo(corpo);
      if (to) {
        const chave = chaveDoDestino(phoneNumberId, to);
        abortsPorChave.set(chave, (abortsPorChave.get(chave) ?? 0) + 1);
      }
    });
    function responder(status: number, corpoResposta: unknown): void {
      respondido = true;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(corpoResposta));
    }

    req.on("data", (chunk) => (corpo += chunk));
    req.on("end", () => {
      let payload: { to?: string; text?: { body?: string } };
      try {
        payload = JSON.parse(corpo);
      } catch {
        responder(400, { error: { message: "corpo inválido" } });
        return;
      }
      const to = payload.to ?? "";
      const texto = payload.text?.body ?? "";
      const chave = chaveDoDestino(phoneNumberId, to);
      const chamadaAtual = (chamadasPorChave.get(chave) ?? 0) + 1;
      chamadasPorChave.set(chave, chamadaAtual);

      if (texto.includes(MOCK_HANG)) {
        // nunca responde por conta própria — só o abort real do cliente
        // (AbortSignal propagado até este `fetch`) encerra a conexão.
        return;
      }

      if (texto.includes(MOCK_JANELA_FECHADA)) {
        responder(400, { error: { code: 131026, message: "janela fechada" } });
        return;
      }

      if (texto.includes(MOCK_FALHA_UMA_VEZ) && chamadaAtual === 1) {
        responder(500, { error: { message: "instabilidade transitória (simulada)" } });
        return;
      }

      responder(200, { messages: [{ id: `wamid.mock-${chave}-${chamadaAtual}` }] });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.WHATSAPP_GRAPH_BASE_URL = `http://127.0.0.1:${port}`;

  return async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  };
}

function extrairTo(corpoParcial: string): string | null {
  const m = /"to"\s*:\s*"([^"]+)"/.exec(corpoParcial);
  return m ? m[1]! : null;
}
