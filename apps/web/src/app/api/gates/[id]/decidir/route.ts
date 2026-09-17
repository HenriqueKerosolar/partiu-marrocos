import { NextResponse } from "next/server";
import { prisma, decidirGate, type GateDecisao } from "@partiumarrocos/db";
import { getAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";

const DECISOES_VALIDAS: GateDecisao[] = ["APROVADO", "REJEITADO", "MODIFICADO"];

/**
 * Decide um Gate pendente (T1). Ação humana por sessão — nunca chamada pelo
 * próprio Yalla/agente (só quem tem `gates.decide` decide; o agente só
 * solicita, via `criarGate`). Objeto inexistente (ou de outro tenant, que dá
 * na mesma sob RLS) retorna 404 sem distinguir os dois casos — não vaza se
 * o gate existe em outro tenant.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!hasPermission(ctx, "gates.decide")) {
    return NextResponse.json({ error: "Sem permissão para decidir gates." }, { status: 403 });
  }

  let body: { decisao?: string; resultado?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.decisao || !DECISOES_VALIDAS.includes(body.decisao as GateDecisao)) {
    return NextResponse.json({ error: "decisao deve ser APROVADO, REJEITADO ou MODIFICADO." }, { status: 400 });
  }

  const resultado = await decidirGate(prisma, {
    tenantId: ctx.tenantId,
    gateId: params.id,
    decisao: body.decisao as GateDecisao,
    decisorId: ctx.user.id,
    resultado: body.resultado,
  });

  if (!resultado.ok) {
    if (resultado.motivo === "NAO_ENCONTRADO") return NextResponse.json({ error: "Gate não encontrado." }, { status: 404 });
    if (resultado.motivo === "JA_DECIDIDO") return NextResponse.json({ error: "Este gate já foi decidido." }, { status: 409 });
    if (resultado.motivo === "EXPIRADO") return NextResponse.json({ error: "Este gate expirou e não pode mais ser decidido." }, { status: 409 });
    // DECISOR_NAO_E_MEMBRO_DO_TENANT: não deveria acontecer aqui (ctx.user.id sempre é membro
    // do próprio ctx.tenantId pela sessão), mas mantém a mensagem honesta se algum dia acontecer.
    return NextResponse.json({ error: "Não foi possível decidir este gate." }, { status: 409 });
  }

  return NextResponse.json({ gate: resultado.gate });
}
