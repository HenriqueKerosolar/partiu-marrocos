import Link from "next/link";
import { prisma, withTenant, formatarMoeda } from "@partiumarrocos/db";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpButton } from "@/components/help-button";
import { NovoLeadForm } from "./form";
import { MoverEtapaSelect } from "./mover-etapa";
import { LeadsFiltro } from "./filtro";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: { q?: string; responsavel?: string; origem?: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "leads.view")) redirect("/dashboard");
  const podeGerenciar = hasPermission(ctx, "leads.manage");

  const q = searchParams.q?.trim() ?? "";
  const responsavelId = searchParams.responsavel?.trim() ?? "";
  const origem = searchParams.origem?.trim() ?? "";

  const { pipeline, leadsPorEtapa, responsaveis, origens } = await withTenant(prisma, ctx.tenantId!, async (tx) => {
    const pipeline = await tx.pipeline.findFirst({
      where: { tenantId: ctx.tenantId!, isDefault: true },
      include: { stages: { orderBy: { ordem: "asc" } } },
    });
    if (!pipeline) return { pipeline: null, leadsPorEtapa: new Map(), responsaveis: [], origens: [] };

    const leads = await tx.lead.findMany({
      where: {
        tenantId: ctx.tenantId!,
        pipelineId: pipeline.id,
        ...(responsavelId ? { responsavelId } : {}),
        ...(origem ? { origem } : {}),
        ...(q ? { contact: { is: { OR: [{ nome: { contains: q, mode: "insensitive" } }, { telefone: { contains: q } }] } } } : {}),
      },
      include: {
        contact: true,
        responsavel: true,
        // T6 — só o suficiente pra um badge discreto no card, sem tela nova.
        attributionTouches: { orderBy: { capturedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    const leadsPorEtapa = new Map<string, typeof leads>();
    for (const stage of pipeline.stages) leadsPorEtapa.set(stage.id, []);
    for (const lead of leads) leadsPorEtapa.get(lead.stageId)?.push(lead);

    const [responsaveis, origensRaw] = await Promise.all([
      tx.user.findMany({ where: { memberships: { some: { tenantId: ctx.tenantId! } } }, select: { id: true, email: true } }),
      tx.lead.findMany({ where: { tenantId: ctx.tenantId!, pipelineId: pipeline.id, origem: { not: null } }, select: { origem: true }, distinct: ["origem"] }),
    ]);
    const origens = origensRaw.map((o) => o.origem!).filter(Boolean);

    return { pipeline, leadsPorEtapa, responsaveis, origens };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads <HelpButton helpKey="leads.list" /></h1>
          <p className="text-sm text-muted-foreground">{pipeline?.nome ?? "Nenhum funil configurado"}</p>
        </div>
      </div>

      {pipeline && <LeadsFiltro responsaveis={responsaveis} origens={origens} valores={{ q, responsavel: responsavelId, origem }} />}

      {podeGerenciar && pipeline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Novo lead</CardTitle>
          </CardHeader>
          <CardContent>
            <NovoLeadForm stages={pipeline.stages.map((s) => ({ id: s.id, nome: s.nome }))} />
          </CardContent>
        </Card>
      )}

      {pipeline && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {pipeline.stages.map((stage) => {
            const leads = leadsPorEtapa.get(stage.id) ?? [];
            return (
              <div key={stage.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{stage.nome}</h2>
                  <span className="text-xs text-muted-foreground">{leads.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {leads.map((lead) => (
                    <Card key={lead.id}>
                      <CardContent className="flex flex-col gap-2 p-3">
                        <Link href={`/leads/${lead.id}`} className="flex flex-col gap-1 hover:underline">
                          <p className="flex items-center gap-1 text-sm font-medium">
                            {lead.prioridade && <span title="Prioridade">🔴</span>}
                            {lead.contact.nome}
                          </p>
                          {lead.contact.telefone && <p className="text-xs text-muted-foreground">{lead.contact.telefone}</p>}
                        </Link>
                        {lead.valor != null && (
                          <p className="text-xs text-muted-foreground">
                            {formatarMoeda(lead.valor, lead.moeda ?? "BRL")}
                          </p>
                        )}
                        {lead.responsavel && <p className="text-xs text-muted-foreground">Resp.: {lead.responsavel.email}</p>}
                        {lead.attributionTouches[0] && (lead.attributionTouches[0].source || lead.attributionTouches[0].campaign) && (
                          <p className="text-xs text-muted-foreground">
                            via {[lead.attributionTouches[0].source, lead.attributionTouches[0].campaign].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {podeGerenciar && (
                          <MoverEtapaSelect
                            leadId={lead.id}
                            etapaAtualId={stage.id}
                            etapas={pipeline.stages.map((s) => ({ id: s.id, nome: s.nome, isLost: s.isLost }))}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {leads.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nenhum lead nesta etapa.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
