// PM-CONV-04, Track B, §6B — inventário de TODA rota navegável final (as 19
// pré-existentes + as 5 novas deste macrobloco), cada uma com um helpKey
// único. "Rotas sem help key = 0" (§27) é verificado por teste
// (tests/unit/help.test.ts) contra este registro.
//
// Exceção declarada, não escondida (§27: "se alguma rota não puder ser
// coberta, explicar individualmente"): `/` (app/page.tsx) é um REDIRECT
// puro para `/dashboard` — nunca renderiza conteúdo pro usuário, então não
// é uma "página navegável" no sentido do comando (nada pra explicar a
// alguém que nunca a vê). Não tem helpKey.

export interface HelpRouteEntry {
  helpKey: string;
  rota: string;
  papel: string; // quem normalmente acessa esta rota
  origem: "PM-NIGHT-RUN-01" | "PM-NIGHT-RUN-02" | "PM-CONV-03" | "PM-CONV-04" | "PM-CONV-05" | "PM-CONV-10";
}

export const HELP_ROUTES: HelpRouteEntry[] = [
  { helpKey: "dashboard.overview", rota: "/dashboard", papel: "Todos os papéis", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "leads.list", rota: "/leads", papel: "Vendas, Atendimento, Administrador", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "leads.detail", rota: "/leads/[id]", papel: "Vendas, Atendimento, Administrador", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "inbox.overview", rota: "/inbox", papel: "Atendimento, Administrador", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "canais.whatsapp", rota: "/canais", papel: "Administrador", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "gates.overview", rota: "/gates", papel: "Quem tem gates.decide (normalmente Administrador)", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "custos.overview", rota: "/custos", papel: "Administrador", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "politica.overview", rota: "/politica-comercial", papel: "Administrador", origem: "PM-NIGHT-RUN-02" },
  { helpKey: "documentos.overview", rota: "/documentos", papel: "Vendas, Atendimento, Administrador", origem: "PM-NIGHT-RUN-02" },
  { helpKey: "viagens.list", rota: "/viagens", papel: "Vendas, Atendimento, Administrador", origem: "PM-NIGHT-RUN-02" },
  { helpKey: "viagens.detail", rota: "/viagens/[id]", papel: "Vendas, Atendimento, Administrador", origem: "PM-NIGHT-RUN-02" },
  { helpKey: "profissionais.overview", rota: "/profissionais", papel: "Vendas, Atendimento, Administrador", origem: "PM-CONV-03" },
  { helpKey: "fornecedores.overview", rota: "/fornecedores", papel: "Vendas, Atendimento, Administrador", origem: "PM-CONV-03" },
  { helpKey: "veiculos.overview", rota: "/veiculos", papel: "Vendas, Atendimento, Administrador", origem: "PM-CONV-03" },
  { helpKey: "jobs.overview", rota: "/jobs", papel: "Quem tem jobs.view (normalmente Administrador)", origem: "PM-NIGHT-RUN-02" },
  { helpKey: "auth.login", rota: "/login", papel: "Qualquer usuário não autenticado", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "auth.trocarSenha", rota: "/trocar-senha", papel: "Usuário no primeiro acesso ou após reset", origem: "PM-NIGHT-RUN-01" },
  { helpKey: "auth.selecionarEmpresa", rota: "/selecionar-empresa", papel: "Usuário com mais de um tenant", origem: "PM-NIGHT-RUN-01" },
  // PM-CONV-04 — rotas novas
  { helpKey: "checkin.overview", rota: "/checkin", papel: "Operação (quem tem checkin.execute/boarding.execute)", origem: "PM-CONV-04" },
  { helpKey: "parceiros.overview", rota: "/parceiros", papel: "Vendas, Administrador", origem: "PM-CONV-04" },
  { helpKey: "premiacoes.overview", rota: "/premiacoes", papel: "Administrador", origem: "PM-CONV-04" },
  { helpKey: "ouvidoria.list", rota: "/ouvidoria", papel: "Atendimento, Administrador", origem: "PM-CONV-04" },
  { helpKey: "ouvidoria.detail", rota: "/ouvidoria/[id]", papel: "Atendimento, Administrador", origem: "PM-CONV-04" },
  // PM-CONV-05 — rotas novas
  { helpKey: "operacoes.overview", rota: "/operacoes", papel: "Vendas, Atendimento, Administrador", origem: "PM-CONV-05" },
  // PM-CONV-10 — rotas novas
  { helpKey: "notificacoes.overview", rota: "/notificacoes", papel: "Todos os papéis", origem: "PM-CONV-10" },
  { helpKey: "avaliacoes.overview", rota: "/avaliacoes", papel: "Vendas, Atendimento, Administrador", origem: "PM-CONV-10" },
];

export const HELP_KEYS = HELP_ROUTES.map((r) => r.helpKey);
