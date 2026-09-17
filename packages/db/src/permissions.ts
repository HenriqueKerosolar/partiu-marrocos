/**
 * Catálogo de permissões e papéis padrão do Partiu Marrocos.
 *
 * O catálogo de permissões (`chave`) é global — vale para todos os tenants.
 * Os papéis (`DEFAULT_ROLES`) são o conjunto que todo tenant novo recebe no
 * cadastro; cada tenant pode depois renomear/reconfigurar (Role é por
 * tenant), mas o catálogo de permissões em si não muda por tenant.
 *
 * Mecanismo herdado do CongáOne (Role/Permission/RolePermission); catálogo é
 * novo, específico do domínio de CRM de turismo — não reaproveitar o
 * catálogo religioso do CongáOne nem o catálogo de fábrica do fabricaease.
 *
 * Escopo desta leva: fundação (usuários/tenant/papéis) + CRM básico (leads,
 * pipeline, atendimento). Financeiro multi-moeda/fiscal e automações de IA
 * ainda não existem — não inventar chaves aqui para funcionalidade que ainda
 * não foi construída (ver DOCUMENTO-DE-FUNDACAO-PARTIU-MARROCOS.md).
 */

export const PERMISSIONS = [
  { chave: "tenant.manage", descricao: "Editar configurações e identidade do tenant" },
  { chave: "papeis.manage", descricao: "Gerenciar papéis e permissões do tenant" },
  { chave: "auditoria.view", descricao: "Ver o log de auditoria do tenant" },
  { chave: "leads.view", descricao: "Ver leads e contatos" },
  { chave: "leads.manage", descricao: "Criar/editar leads e contatos" },
  { chave: "pipeline.manage", descricao: "Configurar funis e etapas" },
  { chave: "atendimento.view", descricao: "Ver conversas/mensagens" },
  { chave: "atendimento.manage", descricao: "Responder conversas, transferir para humano" },
  { chave: "whatsapp.manage", descricao: "Configurar contas do WhatsApp Cloud API (contém segredos)" },
  { chave: "gates.view", descricao: "Ver gates (pedidos de aprovação de ação de risco)" },
  { chave: "gates.request", descricao: "Solicitar um gate (uso interno — o agente Yalla usa esta via, não um usuário)" },
  { chave: "gates.decide", descricao: "Aprovar, rejeitar ou modificar um gate pendente" },
  { chave: "cost.view", descricao: "Ver consumo, políticas e limites de custo técnico/IA" },
  { chave: "cost.manage", descricao: "Configurar políticas e limites de custo técnico/IA" },
  { chave: "jobs.view", descricao: "Ver a fila de jobs em background (WhatsApp, follow-ups, etc.)" },
  { chave: "jobs.manage", descricao: "Cancelar ou reenviar manualmente um job" },
  { chave: "propostas.view", descricao: "Ver propostas comerciais de um lead" },
  { chave: "propostas.manage", descricao: "Criar, editar, enviar, aceitar ou recusar propostas comerciais" },
  { chave: "bookings.view", descricao: "Ver reservas/bookings e passageiros" },
  { chave: "bookings.manage", descricao: "Criar bookings a partir de proposta aceita, alterar status, gerenciar passageiros" },
  { chave: "payments.view", descricao: "Ver pagamentos de uma reserva" },
  { chave: "payments.manage", descricao: "Criar cobranças, registrar resultado de pagamento (modo manual/offline)" },
  { chave: "payments.refund", descricao: "Solicitar estorno/reembolso de um pagamento (ação sensível — exige Gate)" },
  { chave: "politica_comercial.view", descricao: "Ver os limiares de política comercial (desconto/margem/mudança de preço) do tenant" },
  { chave: "politica_comercial.manage", descricao: "Configurar os limiares de política comercial do tenant" },
  { chave: "comissoes.view", descricao: "Ver comissões de venda" },
  { chave: "comissoes.manage", descricao: "Criar, confirmar ou cancelar comissões" },
  { chave: "comissoes.pagar", descricao: "Solicitar pagamento de uma comissão (ação sensível — exige Gate)" },
  { chave: "documentos.view", descricao: "Ver requisitos e documentos de passageiros" },
  { chave: "documentos.manage", descricao: "Configurar requisitos, registrar envio, aprovar/rejeitar documentos de passageiros" },
  { chave: "trips.view", descricao: "Ver partidas/operações de viagem, itinerário e checklist operacional" },
  { chave: "trips.manage", descricao: "Criar/gerenciar partidas, vincular reservas, itinerário e checklist operacional" },
  { chave: "profissionais.view", descricao: "Ver guias e motoristas cadastrados" },
  { chave: "profissionais.manage", descricao: "Cadastrar/editar guias e motoristas" },
  { chave: "fornecedores.view", descricao: "Ver fornecedores turísticos cadastrados" },
  { chave: "fornecedores.manage", descricao: "Cadastrar/editar fornecedores turísticos" },
  { chave: "veiculos.view", descricao: "Ver veículos de operação turística cadastrados" },
  { chave: "veiculos.manage", descricao: "Cadastrar/editar veículos de operação turística" },
  { chave: "grupos_operacionais.view", descricao: "Ver grupos operacionais (crew, veículo, reservas, progresso de parada)" },
  { chave: "grupos_operacionais.manage", descricao: "Criar/gerenciar grupos operacionais, atribuir crew/veículo, atualizar progresso" },
  { chave: "passageiros.dados_sensiveis.view", descricao: "Ver dados de atendimento/saúde de passageiro (restrito)" },
  { chave: "passageiros.dados_sensiveis.manage", descricao: "Registrar dados de atendimento/saúde de passageiro (restrito, exige consentimento)" },
  // PM-CONV-04, Track A (§15A do comando: nomenclatura explícita)
  { chave: "checkin.view", descricao: "Ver credenciais e status de check-in de passageiros" },
  { chave: "checkin.execute", descricao: "Emitir/revogar credencial e confirmar check-in" },
  { chave: "boarding.view", descricao: "Ver status de embarque" },
  { chave: "boarding.execute", descricao: "Confirmar embarque e registrar no-show" },
  // PM-CONV-04, Track C
  { chave: "parceiros.view", descricao: "Ver parceiros externos cadastrados" },
  { chave: "parceiros.manage", descricao: "Cadastrar/editar parceiros externos" },
  { chave: "premiacoes.view", descricao: "Ver campanhas de premiação e solicitações" },
  { chave: "premiacoes.manage", descricao: "Criar campanhas, aprovar e solicitar pagamento de premiação (ação sensível — exige Gate)" },
  // PM-CONV-04, Track D
  { chave: "ouvidoria.view", descricao: "Ver tickets de ouvidoria/suporte" },
  { chave: "ouvidoria.manage", descricao: "Abrir, responder e mudar status de tickets de ouvidoria/suporte" },
  // PM-CONV-05, Track A — gps.track é do profissional em campo (a própria
  // pessoa sendo rastreada, via papel "Operação"); gps.view é de quem
  // acompanha o mapa (staff de escritório na Central de Operações).
  { chave: "gps.view", descricao: "Ver mapa/localização ao vivo da operação" },
  { chave: "gps.track", descricao: "Iniciar/finalizar o próprio rastreamento de localização (guia/motorista em campo)" },
  // PM-CONV-05, Track C
  { chave: "operacoes.view", descricao: "Ver a Central de Operações (viagens ativas, check-in, embarque, mapa, alertas)" },
  // PM-CONV-05, Track B
  { chave: "ocorrencias.view", descricao: "Ver ocorrências operacionais registradas por guias/motoristas" },
  { chave: "ocorrencias.registrar", descricao: "Registrar uma ocorrência operacional (guia/motorista em campo)" },
  // PM-CONV-10 — Post-Trip Foundation. avaliacoes.manage é decisão de
  // publicar/despublicar um depoimento (mesmo já com consentimento do
  // cliente) — decisão editorial/de marketing, não operacional comum,
  // mesma lógica de premiacoes.manage (Administrador por padrão).
  { chave: "avaliacoes.view", descricao: "Ver avaliações/depoimentos de clientes pós-viagem" },
  { chave: "avaliacoes.manage", descricao: "Publicar ou despublicar um depoimento (exige consentimento do cliente já registrado)" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["chave"];

export interface DefaultRoleDef {
  nome: string;
  descricao: string;
  permissoes: PermissionKey[];
}

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.chave);

export const DEFAULT_ROLES: DefaultRoleDef[] = [
  {
    nome: "Administrador",
    descricao: "Acesso total ao tenant.",
    permissoes: [...ALL_PERMISSION_KEYS],
  },
  {
    nome: "Vendas",
    descricao: "Funil comercial e atendimento ao cliente.",
    // gates.decide fica só com Administrador por padrão — decisão de risco de
    // negócio (financeiro/irreversível/etc.) exige aprovação de quem tem
    // autoridade pra isso; ajustável depois por tenant (Role é configurável).
    // payments.refund/comissoes.pagar/politica_comercial.* ficam só com
    // Administrador por padrão — mesma lógica de gates.decide: mover
    // dinheiro (de volta, ou pra fora) e mudar a política de aprovação do
    // tenant são decisões de risco, mesmo que a aprovação final também
    // exija um Gate separado. Vendas não gerencia a própria comissão
    // (conflito de interesse) — só visualiza.
    // profissionais/fornecedores/veiculos/grupos_operacionais ficam com
    // Vendas (mesma lógica de trips.manage — operação da viagem já vendida).
    // passageiros.dados_sensiveis.* fica só com Administrador (mesmo
    // raciocínio de payments.refund: dado sensível/LGPD, não é operação
    // comercial comum).
    // PM-CONV-04: checkin.*/boarding.* NÃO entram aqui de propósito (§15A do
    // comando: "Atendimento/Vendas: não receber permissão operacional
    // automaticamente sem justificativa" — check-in/embarque fica só com
    // Administrador nesta rodada, igual premiacoes.manage, que é Gate-
    // sensível como payments.refund/comissoes.pagar).
    permissoes: [
      "leads.view", "leads.manage", "atendimento.view", "atendimento.manage", "gates.view", "propostas.view", "propostas.manage",
      "bookings.view", "bookings.manage", "payments.view", "payments.manage", "comissoes.view", "documentos.view", "documentos.manage",
      "trips.view", "trips.manage", "profissionais.view", "profissionais.manage", "fornecedores.view", "fornecedores.manage",
      "veiculos.view", "veiculos.manage", "grupos_operacionais.view", "grupos_operacionais.manage",
      "parceiros.view", "parceiros.manage", "premiacoes.view", "gps.view", "operacoes.view", "ocorrencias.view", "avaliacoes.view",
    ],
  },
  {
    nome: "Atendimento",
    descricao: "Responde conversas, sem editar o funil.",
    permissoes: [
      "leads.view", "atendimento.view", "atendimento.manage", "gates.view", "propostas.view", "bookings.view", "payments.view",
      "documentos.view", "trips.view", "profissionais.view", "fornecedores.view", "veiculos.view", "grupos_operacionais.view",
      "parceiros.view", "ouvidoria.view", "ouvidoria.manage", "gps.view", "operacoes.view", "ocorrencias.view", "avaliacoes.view",
    ],
  },
  {
    // PM-CONV-05, Track A/B — papel novo, distinto de Vendas/Atendimento: é
    // a pessoa em campo (guia/motorista), logada via Professional.userId,
    // não um funcionário de escritório. Só o necessário pra operação do
    // próprio grupo — nunca acesso comercial/financeiro/administrativo.
    nome: "Operação",
    descricao: "Guia/motorista em campo — check-in, embarque e rastreamento da própria operação.",
    permissoes: [
      "trips.view", "grupos_operacionais.view", "checkin.view", "checkin.execute", "boarding.view", "boarding.execute", "gps.track",
      "ocorrencias.view", "ocorrencias.registrar",
    ],
  },
];
