/**
 * Marcadores reconhecidos pelo servidor HTTP compartilhado
 * (`tests/setup/whatsapp-mock-server.ts`, ver o comentário lá para o porquê
 * de existir um servidor real em vez de `vi.stubGlobal("fetch")` por
 * arquivo) — embutidos no `texto` do payload do job, então o comportamento
 * simulado viaja COM o job e independe de qual arquivo/thread acaba
 * executando-o.
 */
export const MOCK_FALHA_UMA_VEZ = "__mock_fail_once__";
export const MOCK_JANELA_FECHADA = "__mock_janela_fechada__";
export const MOCK_HANG = "__mock_hang__";

/** Lê o contador de chamadas (e de aborts) que o mock viu para um (phoneNumberId, to) — real fetch, sem stub. */
export async function contarChamadasMock(phoneNumberId: string, to: string): Promise<{ count: number; aborted: number }> {
  const base = process.env.WHATSAPP_GRAPH_BASE_URL;
  if (!base) throw new Error("WHATSAPP_GRAPH_BASE_URL não definido — o globalSetup do mock não rodou?");
  const chave = `${phoneNumberId}:${to}`;
  const res = await fetch(`${base}/__test__/count?key=${encodeURIComponent(chave)}`);
  return res.json();
}
