import { NextResponse } from "next/server";
import { prisma, withTenant, registrarAttributionTouch, temAtribuicao, type AttributionInput } from "@partiumarrocos/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Captura pública de lead — sem sessão, chamada pelo formulário de orçamento
 * do site público. Resolve diretamente o achado CRÍTICO da primeira auditoria
 * do Partiu Marrocos ("IMPORTANTE — perda de leads": o formulário atual só
 * monta uma mensagem e abre o WhatsApp, sem gravar nada antes — se o
 * visitante não concluir a conversa, a oportunidade é perdida).
 *
 * Fluxo pretendido no site público (fora deste repo — é HTML/JS estático):
 * 1. Visitante preenche o formulário.
 * 2. JS do site faz POST aqui, AGUARDA a resposta.
 * 3. Só depois abre/continua o WhatsApp — o lead já existe no CRM nesse
 *    ponto, mesmo que a conversa no WhatsApp nunca aconteça.
 *
 * `tenantSlug` identifica a empresa (é público por natureza — aparece na
 * própria URL/config do site, como o `phoneNumberId` do WhatsApp) — `Tenant`
 * não tem RLS (é o próprio registro de tenants, ver schema.prisma), então a
 * busca por slug não precisa de `withSystem`.
 *
 * Attribution (T6): campos de UTM/gclid/fbclid/landingPage/referrer são
 * opcionais — o formulário funciona normalmente sem eles. Gravados como
 * `AttributionTouch` (tipo CONVERSION) na MESMA transação que cria
 * Contact/Lead — nunca um lead sem atribuição por uma falha no meio do
 * caminho, nunca uma atribuição órfã sem lead.
 *
 * CORS: o site público roda em domínio separado (hoje HTML/JS estático,
 * hospedagem própria) — sem isso o navegador bloqueia o fetch. Mesmo padrão
 * já usado (e repetido) em outros produtos da casa pra endpoint público
 * cross-origin (KeroSolar CRM/Pizzaria/MultiCRM `api/public/webchat`):
 * helper `cors()` + `OPTIONS` + origem vinda de env var. Sem gate de
 * x-api-key aqui — o formulário é público por natureza (embutido em HTML
 * servido a qualquer visitante), uma chave no JS do site não protegeria
 * nada que o rate limit por IP já não cubra.
 */
const ALLOWED_ORIGIN = process.env.PUBLIC_SITE_ORIGIN || "*";

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`public-leads:${ip}`, 10, 10 * 60_000);
  if (!rl.allowed) {
    return cors(NextResponse.json({ error: "Muitas tentativas, aguarde um pouco." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }));
  }

  let body: {
    tenantSlug?: string; nome?: string; telefone?: string; email?: string; origem?: string; mensagem?: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string;
    gclid?: string; fbclid?: string; landingPage?: string; referrer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ error: "JSON inválido." }, { status: 400 }));
  }

  const tenantSlug = String(body.tenantSlug ?? "").trim();
  const nome = String(body.nome ?? "").trim();
  const telefoneRaw = String(body.telefone ?? "").trim();
  const email = String(body.email ?? "").trim();
  const origem = String(body.origem ?? "site").trim();
  const mensagem = String(body.mensagem ?? "").trim();

  // Attribution — nunca confiar cegamente no valor recebido (query string
  // pública); sanitização de tamanho/tipo acontece dentro de
  // registrarAttributionTouch, aqui só se normaliza pra string|undefined.
  const atribuicao: AttributionInput = {
    source: body.utmSource,
    medium: body.utmMedium,
    campaign: body.utmCampaign,
    content: body.utmContent,
    term: body.utmTerm,
    gclid: body.gclid,
    fbclid: body.fbclid,
    landingPage: body.landingPage,
    referrer: body.referrer,
  };

  if (!tenantSlug || !nome || !telefoneRaw) {
    return cors(NextResponse.json({ error: "Informe tenantSlug, nome e telefone." }, { status: 400 }));
  }
  if (nome.length > 200 || mensagem.length > 4000) {
    return cors(NextResponse.json({ error: "Campo excede o tamanho máximo." }, { status: 400 }));
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return cors(NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 }));

  const telefone = telefoneRaw.replace(/\D/g, "");
  if (telefone.length < 8) return cors(NextResponse.json({ error: "Telefone inválido." }, { status: 400 }));

  const leadId = await withTenant(prisma, tenant.id, async (tx) => {
    const pipeline = await tx.pipeline.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
    const primeiraEtapa = pipeline
      ? await tx.stage.findFirst({ where: { tenantId: tenant.id, pipelineId: pipeline.id }, orderBy: { ordem: "asc" } })
      : null;
    if (!pipeline || !primeiraEtapa) throw new Error("Tenant sem funil padrão configurado.");

    let contact = await tx.contact.findFirst({ where: { tenantId: tenant.id, telefone } });
    if (!contact) {
      contact = await tx.contact.create({
        data: { tenantId: tenant.id, nome, telefone, email: email || null, whatsappId: telefone, origem },
      });
    }

    const lead = await tx.lead.create({
      data: { tenantId: tenant.id, contactId: contact.id, pipelineId: pipeline.id, stageId: primeiraEtapa.id, origem },
    });

    if (mensagem) {
      await tx.note.create({ data: { tenantId: tenant.id, leadId: lead.id, conteudo: `Mensagem do formulário: ${mensagem}` } });
    }

    if (temAtribuicao(atribuicao)) {
      await registrarAttributionTouch(tx, { tenantId: tenant.id, contactId: contact.id, leadId: lead.id, ...atribuicao });
    }

    return lead.id;
  });

  return cors(NextResponse.json({ ok: true, leadId }, { status: 201 }));
}
