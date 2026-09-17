import { put } from "@vercel/blob";

/**
 * Hospedagem pública de mídia de tradução (áudio baixado do WhatsApp, áudio
 * sintetizado por TTS, anexos do chat) — `sendCloudMedia` (Cloud API da
 * Meta) só aceita mídia por URL pública, não por upload direto.
 *
 * Em produção (Vercel), o SDK autentica sozinho via OIDC + BLOB_STORE_ID
 * (nenhuma das duas precisa ser passada aqui — o runtime da Vercel já injeta
 * as duas). Em dev local não existe token OIDC; se `BLOB_READ_WRITE_TOKEN`
 * não estiver definido no `.env`, isso falha explicitamente (nunca salva
 * localmente por engano) — pegue o token em Vercel > Storage >
 * partiu-marrocos-blob > .env.local, se precisar testar upload fora da
 * Vercel.
 */
export async function subirMidia(pathname: string, conteudo: Buffer, contentType: string): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const { url } = await put(pathname, conteudo, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    ...(token ? { token } : {}),
  });
  return url;
}
