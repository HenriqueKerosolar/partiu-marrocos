import { PrismaClient } from "@prisma/client";
import { withTenant } from "./tenant-db";

const prisma = new PrismaClient();

const TENANT_SLUG = "partiu-marrocos";

/**
 * Lote inicial real da Base de Conhecimento da Yalla — não é a meta completa
 * de 1.000+ formulações da especificação original (ver plano aprovado desta
 * sessão), é um lote pequeno mas real cobrindo os 4 answerType, com fonte
 * verificada via WebSearch em 2026-09-18 pra toda entrada OFFICIAL_DYNAMIC
 * (nunca escrito de memória — é exatamente a categoria de maior risco de
 * alucinação). `intervaloRevisaoDias` reflete o quão rápido cada assunto
 * pode mudar (regra de visto muda pouco; ainda assim, revisão periódica).
 */
const HOJE = new Date("2026-09-18T00:00:00Z");

interface EntradaSeed {
  categoria: string;
  subcategoria?: string;
  intencao: string;
  answerType: "STATIC_KNOWLEDGE" | "OFFICIAL_DYNAMIC" | "TRIP_DYNAMIC" | "REALTIME_CONTEXT";
  riskLevel?: "BAIXO" | "MEDIO" | "ALTO";
  pergunta: string;
  variantes: string[];
  keywords: string[];
  respostaBase?: string;
  fonteTipo?: string;
  fonte?: string;
  ultimaVerificacao?: Date;
  intervaloRevisaoDias?: number;
  requerTool?: boolean;
  toolId?: string;
  politicaEscalonamento?: string;
  fallback?: string;
}

const ENTRADAS: EntradaSeed[] = [
  // ── Documentação (OFFICIAL_DYNAMIC — fonte real, gov.br/MRE) ──────────
  {
    categoria: "documentacao",
    subcategoria: "visto",
    intencao: "visto_brasileiro_marrocos",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "ALTO",
    pergunta: "Preciso de visto para entrar no Marrocos sendo brasileiro?",
    variantes: [
      "Brasileiro precisa de visto para Marrocos?",
      "Tenho que tirar visto pra viajar pro Marrocos?",
      "Posso entrar no Marrocos sem visto?",
      "Quanto tempo posso ficar no Marrocos sem visto?",
    ],
    keywords: ["visto", "vistos"],
    respostaBase:
      "Cidadãos brasileiros NÃO precisam de visto para entrar no Marrocos em estadias turísticas de até 90 dias. É preciso apresentar passaporte válido (mínimo 6 meses de validade), passagem de volta/saída do país e comprovante de hospedagem ou roteiro.",
    fonteTipo: "governo",
    fonte: "https://www.gov.br/mre/pt-br/embaixada-rabat/rabat-arquivos/informacoes-uteis",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 180,
    politicaEscalonamento: "Se o cliente tiver nacionalidade diferente de brasileira ou estadia prevista acima de 90 dias, encaminhar para a equipe — a regra acima vale só para turista brasileiro em estadia curta.",
  },
  {
    categoria: "documentacao",
    subcategoria: "passaporte",
    intencao: "passaporte_validade_minima",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "ALTO",
    pergunta: "Qual validade meu passaporte precisa ter para entrar no Marrocos?",
    variantes: ["Meu passaporte está quase vencendo, posso viajar?", "Posso entrar com passaporte perto do vencimento?", "Passaporte precisa ter quantos meses de validade?"],
    keywords: ["passaporte", "validade"],
    respostaBase: "O passaporte precisa ter validade mínima de 6 meses a partir da data de entrada no Marrocos. Recomendamos sempre viajar com essa margem, mesmo que alguma fonte cite prazos menores, para evitar problema no embarque.",
    fonteTipo: "governo",
    fonte: "https://www.gov.br/mre/pt-br/embaixada-rabat/rabat-arquivos/informacoes-uteis",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 180,
  },
  {
    categoria: "documentacao",
    subcategoria: "vacinas",
    intencao: "vacina_obrigatoria_marrocos",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "MEDIO",
    pergunta: "Preciso tomar alguma vacina obrigatória para viajar ao Marrocos?",
    variantes: ["Preciso de vacina de febre amarela pro Marrocos?", "Tem vacina obrigatória pra entrar no Marrocos?", "Certificado internacional de vacinação é exigido?"],
    keywords: ["vacina", "vacinas", "febre amarela"],
    respostaBase:
      "Não há vacina obrigatória para entrar no Marrocos vindo diretamente do Brasil, incluindo a de febre amarela. Se o seu voo tiver conexão longa em país com risco de transmissão de febre amarela, a exigência pode mudar — nesse caso confirme com a equipe. Não é obrigatório, mas é recomendável manter as vacinas de rotina em dia antes de viajar.",
    fonteTipo: "governo",
    fonte: "https://www.gov.br/mre/pt-br/embaixada-rabat/rabat-arquivos/informacoes-uteis",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 180,
    politicaEscalonamento: "Se o cliente mencionar escala/conexão em país africano ou sul-americano com risco de febre amarela, encaminhar para a equipe confirmar a exigência de certificado (CIVP) antes de tranquilizar o cliente.",
  },

  // ── Dinheiro (STATIC_KNOWLEDGE) ─────────────────────────────────────
  {
    categoria: "dinheiro",
    intencao: "moeda_oficial",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Qual é a moeda oficial do Marrocos?",
    variantes: ["O que é o dirham?", "O que é MAD?", "Quanto vale um dirham?"],
    keywords: ["moeda", "dirham", "mad"],
    respostaBase:
      "A moeda oficial do Marrocos é o dirham marroquino (código MAD). Notas circulam em 20, 50, 100 e 200 dirhams. A cotação varia dia a dia — para o valor exato em reais no momento, é melhor confirmar em um conversor atualizado ou com a equipe.",
  },
  {
    categoria: "dinheiro",
    intencao: "cambio_onde_trocar",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Onde eu troco dinheiro no Marrocos?",
    variantes: ["Troco dinheiro no aeroporto?", "Hotel troca dinheiro?", "Posso levar euro pra trocar lá?"],
    keywords: ["trocar", "cambio", "câmbio"],
    respostaBase:
      "Dá para trocar dinheiro em casas de câmbio autorizadas, bancos e no próprio aeroporto ao chegar. Levar euros costuma ter câmbio mais favorável que dólar ou real. Evite trocar com pessoas na rua — só em estabelecimentos autorizados.",
  },
  {
    categoria: "dinheiro",
    intencao: "cartao_de_credito_aceito",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Cartão de crédito brasileiro funciona no Marrocos?",
    variantes: ["Visa e Mastercard funcionam lá?", "Posso pagar com cartão internacional?", "ATM aceita cartão brasileiro?"],
    keywords: ["cartao", "cartão", "credito", "crédito", "atm"],
    respostaBase:
      "Cartões Visa e Mastercard internacionais são aceitos na maioria dos hotéis, restaurantes maiores e lojas nas cidades. Em souks e comércio pequeno, o pagamento costuma ser só em dinheiro (dirham). Vale ter sempre dinheiro em espécie para o dia a dia.",
  },
  {
    categoria: "dinheiro",
    intencao: "gorjetas_costume",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "É costume dar gorjeta no Marrocos?",
    variantes: ["Quanto dar de gorjeta pro guia?", "Gorjeta é obrigatória lá?"],
    keywords: ["gorjeta", "gorjetas"],
    respostaBase:
      "Sim, gorjeta é um costume comum no Marrocos — em restaurantes, para guias e motoristas. Não é obrigatória, mas é bem-vinda como reconhecimento pelo bom atendimento. A equipe pode te orientar sobre valores de referência para a sua viagem específica.",
  },

  // ── Cultura (STATIC_KNOWLEDGE, exceto Ramadã) ──────────────────────
  {
    categoria: "cultura",
    intencao: "vestimenta_apropriada",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Como devo me vestir no Marrocos?",
    variantes: ["Posso usar shorts no Marrocos?", "Preciso cobrir os ombros?", "Qual roupa é apropriada por lá?"],
    keywords: ["roupa", "vestimenta", "vestir", "shorts"],
    respostaBase:
      "O Marrocos é um país muçulmano e moderado, mas é respeitoso vestir roupas mais discretas, principalmente fora de zonas turísticas e hotéis: ombros e joelhos cobertos são bem-vindos, sobretudo pra visitar mesquitas. Nas praias e resorts, roupas de banho normais são aceitas sem problema.",
  },
  {
    categoria: "cultura",
    intencao: "ramadan_impacto_viagem",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "MEDIO",
    pergunta: "O Ramadã afeta minha viagem ao Marrocos?",
    variantes: ["Quando é o Ramadã no Marrocos?", "Restaurantes fecham durante o Ramadã?"],
    keywords: ["ramadan", "ramadã"],
    respostaBase:
      "O Ramadã segue o calendário islâmico (lunar), então a data muda todo ano — não é um período fixo. Durante o Ramadã, muitos restaurantes/cafés fora de zonas turísticas fecham durante o dia, e é respeitoso evitar comer/beber em público durante o jejum. Como a data muda todo ano, confirme com a equipe se as datas da sua viagem coincidem com o Ramadã.",
    fonteTipo: "politica_interna",
    fonte: "Calendário islâmico — data varia a cada ano, confirmar caso a caso",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 300,
    politicaEscalonamento: "Sempre que o cliente perguntar a data exata do Ramadã no ano da viagem dele, encaminhar para a equipe confirmar — não calcular/estimar a data.",
  },
  {
    categoria: "cultura",
    intencao: "saudacoes_basicas",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Como cumprimento as pessoas no Marrocos?",
    variantes: ["Como se diz olá em árabe?", "Qual cumprimento é comum por lá?"],
    keywords: ["saudacao", "saudação", "cumprimento", "ola", "olá"],
    respostaBase:
      "\"Salam\" ou \"Assalamu alaikum\" é uma saudação comum e bem recebida. Um aperto de mão é usual entre pessoas do mesmo gênero; entre gêneros diferentes, é respeitoso esperar a outra pessoa estender a mão primeiro.",
  },
  {
    categoria: "cultura",
    intencao: "fotografar_pessoas_etiqueta",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Posso fotografar as pessoas no Marrocos?",
    variantes: ["É educado tirar foto de moradores locais?", "Posso fotografar em mercados/souks?"],
    keywords: ["fotografar", "fotografia", "foto"],
    respostaBase: "É sempre respeitoso pedir permissão antes de fotografar pessoas, especialmente em souks e áreas mais tradicionais. Algumas pessoas podem pedir uma pequena gorjeta em troca da foto — isso é normal por lá.",
  },

  // ── Roteiro (TRIP_DYNAMIC — aponta pras tools novas) ────────────────
  {
    categoria: "roteiro",
    intencao: "proximo_horario_embarque",
    answerType: "TRIP_DYNAMIC",
    pergunta: "Que horas saímos amanhã?",
    variantes: ["Qual o horário da próxima atividade?", "Que horas é o próximo embarque?", "Quando é a próxima saída do grupo?"],
    keywords: ["horas", "horario", "horário", "saida", "saída", "embarque"],
    requerTool: true,
    toolId: "viagem.proxima_atividade",
    fallback: "Não encontrei uma atividade agendada com horário confirmado. Posso confirmar com a equipe da viagem.",
  },
  {
    categoria: "roteiro",
    intencao: "itinerario_completo",
    answerType: "TRIP_DYNAMIC",
    pergunta: "Qual é o meu roteiro completo?",
    variantes: ["O que vamos fazer nesta viagem?", "Me mostra o itinerário", "Quais cidades vamos visitar?"],
    keywords: ["roteiro", "itinerario", "itinerário"],
    requerTool: true,
    toolId: "viagem.consultar_contexto",
    fallback: "Não encontrei um roteiro vinculado à sua reserva ainda. Posso confirmar com a equipe.",
  },
  {
    categoria: "roteiro",
    intencao: "status_da_reserva",
    answerType: "TRIP_DYNAMIC",
    pergunta: "Qual o status da minha reserva?",
    variantes: ["Minha reserva está confirmada?", "Como está o status da minha viagem?"],
    keywords: ["reserva", "status", "booking"],
    requerTool: true,
    toolId: "viagem.consultar_contexto",
    fallback: "Não encontrei nenhuma reserva vinculada a esta conversa. Posso encaminhar para a equipe confirmar.",
  },

  // ── GPS (REALTIME_CONTEXT + STATIC_KNOWLEDGE) ───────────────────────
  {
    categoria: "gps",
    intencao: "onde_esta_o_onibus",
    answerType: "REALTIME_CONTEXT",
    riskLevel: "MEDIO",
    pergunta: "Onde está o ônibus agora?",
    variantes: ["Cadê nosso ônibus?", "O ônibus já chegou?", "Quanto falta pro ônibus chegar?", "Onde está nosso veículo?"],
    keywords: ["onibus", "ônibus", "veiculo", "veículo", "localizacao", "localização"],
    requerTool: true,
    toolId: "viagem.localizacao_veiculo",
    fallback: "Não consigo localizar o veículo agora — pode ser que o rastreamento não esteja ativo neste momento. Posso encaminhar para a Central de Operações.",
    politicaEscalonamento: "Se a posição vier desatualizada/indisponível e o cliente insistir ou parecer ansioso (ex.: 'vou perder o ônibus'), encaminhar para atendimento humano imediatamente.",
  },
  {
    categoria: "gps",
    intencao: "como_funciona_rastreamento",
    answerType: "STATIC_KNOWLEDGE",
    pergunta: "Como funciona o rastreamento do veículo?",
    variantes: ["Vocês acompanham o ônibus em tempo real?", "Como sei onde está o grupo?"],
    keywords: ["rastreamento", "rastrear"],
    respostaBase:
      "Durante os trajetos em grupo, o veículo é acompanhado por rastreamento de GPS enquanto a sessão de rastreamento estiver ativa. Se quiser saber a posição atual, é só perguntar — sempre respondo com a posição mais recente disponível, e aviso caso não tenha uma posição recente o suficiente para confiar.",
  },

  // ── Emergência (STATIC_KNOWLEDGE + OFFICIAL_DYNAMIC) ────────────────
  {
    categoria: "emergencia",
    intencao: "contato_emergencia_agencia",
    answerType: "STATIC_KNOWLEDGE",
    riskLevel: "MEDIO",
    pergunta: "Qual o contato de emergência da agência durante a viagem?",
    variantes: ["Como falo com a Partiu Marrocos em uma emergência?", "Tem um telefone de emergência da equipe?"],
    keywords: ["emergencia", "emergência", "contato"],
    requerTool: false,
    fallback: "Vou confirmar com a equipe qual o canal de emergência específico da sua viagem e te retorno.",
    politicaEscalonamento: "Esta pergunta deve sempre ser confirmada com a equipe/Central de Operações — não há um número fixo genérico configurado nesta base ainda.",
  },
  {
    categoria: "emergencia",
    intencao: "emergencia_medica_o_que_fazer",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "ALTO",
    pergunta: "Estou passando mal, o que eu faço?",
    variantes: ["Preciso de um médico no Marrocos", "Tive uma emergência médica, quem eu chamo?", "Qual o número da ambulância no Marrocos?"],
    keywords: ["passando mal", "medico", "médico", "ambulancia", "ambulância", "hospital", "emergencia medica"],
    respostaBase:
      "Em caso de emergência médica no Marrocos, ligue 15 (ambulância/bombeiros) ou 112 pelo celular (emergência geral). A polícia é 19 nas cidades (177 fora de zonas urbanas, pela Gendarmaria Real). Se estiver em grupo, avise imediatamente o guia/motorista e a Central de Operações da agência — eles podem apoiar com tradução e orientação local.",
    fonteTipo: "governo",
    fonte: "https://www.morocco-guide.com/information/useful-and-emergency-phone-numbers-for-traveler/",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 365,
    politicaEscalonamento: "SEMPRE encaminhar para atendimento humano/Central de Operações imediatamente além de fornecer os números — isto é uma emergência real, nunca tratar como uma pergunta informativa comum.",
  },
  {
    categoria: "emergencia",
    intencao: "perda_de_passaporte_procedimento",
    answerType: "OFFICIAL_DYNAMIC",
    riskLevel: "ALTO",
    pergunta: "Perdi meu passaporte no Marrocos, o que eu faço?",
    variantes: ["Meu passaporte foi roubado, e agora?", "Como contato o consulado brasileiro no Marrocos?"],
    keywords: ["perdi passaporte", "passaporte perdido", "passaporte roubado", "consulado"],
    respostaBase:
      "1) Registre um Boletim de Ocorrência na polícia local mais próxima. 2) Contate a Embaixada do Brasil em Rabat: telefone (+212) 537 57 27 30, e-mail brasemb.rabat@itamaraty.gov.br, ou o plantão consular de emergência (+212) 661 16 81 81 para casos urgentes. Eles orientam sobre emitir um passaporte novo ou uma Autorização de Retorno ao Brasil (mais rápida, para quem já está retornando). Avise também a equipe da Partiu Marrocos para dar suporte local.",
    fonteTipo: "governo",
    fonte: "https://www.gov.br/mre/pt-br/embaixada-rabat",
    ultimaVerificacao: HOJE,
    intervaloRevisaoDias: 180,
    politicaEscalonamento: "Sempre encaminhar para atendimento humano além de fornecer os contatos — perda de documento em viagem internacional exige suporte real da equipe, não só informação.",
  },
];

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  let criadas = 0;
  let atualizadas = 0;
  await withTenant(prisma, tenant.id, async (tx) => {
    for (const entrada of ENTRADAS) {
      const existente = await tx.knowledgeEntry.findFirst({ where: { tenantId: tenant.id, intencao: entrada.intencao } });
      const data = {
        tenantId: tenant.id,
        categoria: entrada.categoria,
        subcategoria: entrada.subcategoria ?? null,
        intencao: entrada.intencao,
        answerType: entrada.answerType,
        riskLevel: entrada.riskLevel ?? "BAIXO",
        pergunta: entrada.pergunta,
        variantes: entrada.variantes,
        keywords: entrada.keywords,
        respostaBase: entrada.respostaBase ?? null,
        fonteTipo: entrada.fonteTipo ?? null,
        fonte: entrada.fonte ?? null,
        ultimaVerificacao: entrada.ultimaVerificacao ?? null,
        intervaloRevisaoDias: entrada.intervaloRevisaoDias ?? null,
        requerTool: entrada.requerTool ?? false,
        toolId: entrada.toolId ?? null,
        politicaEscalonamento: entrada.politicaEscalonamento ?? null,
        fallback: entrada.fallback ?? null,
        ativo: true,
      };
      if (existente) {
        await tx.knowledgeEntry.update({ where: { id: existente.id }, data });
        atualizadas++;
      } else {
        await tx.knowledgeEntry.create({ data });
        criadas++;
      }
    }
  });

  console.log(`OK: ${criadas} entradas criadas, ${atualizadas} atualizadas, ${ENTRADAS.length} no total, tenant "${TENANT_SLUG}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
