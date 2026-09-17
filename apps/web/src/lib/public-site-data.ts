// Conteúdo real do site público, portado de site-original/partiumarrocos.com.br/js/data.js
// (mesma fonte de dados, só migrada de JSON solto pro TS do app) — não é
// texto novo, é o conteúdo editorial já revisado e aprovado do site anterior,
// só com o layout do mockup 0.4.11 (proposta/preview-v11.html) por cima.

export const heroStats = [
  { n: "20+", l: "anos de estrada" },
  { n: "12k+", l: "viajantes" },
  { n: "4,9★", l: "avaliação" },
  { n: "100%", l: "em português" },
];

// Os 3 estágios da jornada (não confundir com os destaques do site antigo —
// o mockup 0.4.11 usa esse enquadramento mais simples, de acompanhamento).
export const jornada = [
  { t: "Antes de partir", d: "Escolha o roteiro e fale com quem conhece o destino." },
  { t: "Na estrada", d: "Mapa, equipe e hospedagens sempre com você." },
  { t: "Para lembrar", d: "Reveja os lugares por onde sua viagem passou." },
];

// Os dois roteiros iniciais definidos na proposta 0.4.11 (não são mais os 3
// pacotes antigos do site original — foram reconciliados nesses dois).
export type Roteiro = {
  id: string;
  dias: string;
  noites: string;
  nome: string;
  stops: string[];
  img: string;
  featured?: boolean;
};

export const roteiros: Roteiro[] = [
  {
    id: "deserto-kasbahs",
    dias: "3 dias",
    noites: "2 noites",
    nome: "Deserto e kasbahs",
    stops: ["Marrakech", "Dades", "Merzouga", "Marrakech"],
    img: "/img/merzouga.jpg",
  },
  {
    id: "saara-cidade-azul",
    dias: "6 dias",
    noites: "5 noites",
    nome: "Do Saara à cidade azul",
    stops: ["Marrakech", "Dades", "Merzouga", "Fez", "Chefchaouen", "Casablanca", "Marrakech"],
    img: "/img/chefchaouen.jpg",
    featured: true,
  },
];

export const parceiroLocal = {
  t: "Chá e sabores do Atlas",
  d: "Uma pausa com sabor de Marrocos.",
  img: "/img/tea.jpg",
};

// "Universo amazigh" — conteúdo portado literalmente de P7_ARTICLES em
// proposta/mockup-v11-source.html (a fonte real do mockup, não uma
// aproximação). merzouga é o destaque; as outras 4 formam o grid de
// histórias — no mockup são páginas de leitura próprias (não construídas
// ainda aqui); os botões "Ler história" ficam como placeholder até lá.
export const amazighHero = {
  kicker: "Universo amazigh · Marrocos",
  titulo: "Amazigh.",
  tituloItalico: "Histórias que seguem vivas.",
  subtitle: "De Merzouga aos caminhos do Atlas: histórias, palavras e saberes para conhecer com tempo e atenção.",
  img: "/img/saharasunset.jpg",
  imgCaption: "Erg Chebbi · Merzouga",
};

// Fontes reais citadas pelo mockup (P7_SOURCES em mockup-v11-source.html)
// — pesquisa acadêmica/institucional de verdade, não texto de preenchimento.
export const fontes = {
  nomads: { name: "Yasmine Zarhloule & Ella Williams · Carnegie, 2025", url: "https://carnegieendowment.org/research/2025/10/between-marginalization-and-climate-change-the-resilience-of-moroccos-ait-khabbash" },
  arts: { name: "Cynthia Becker · Tamazgha Studies Journal, 2023", url: "https://www.tamazghastudiesjournal.org/articles-fall2023-issue-01-article08" },
  roots: { name: "Carnegie · Parallel Climate Reckonings, 2026", url: "https://carnegieendowment.org/research/2026/06/morocco-california-colonial-water-legacies-indigenous-practices-drought-climate-change-adaptation" },
  water: { name: "Carnegie · Beyond the Green Transition, 2025", url: "https://carnegieendowment.org/research/2025/03/beyond-the-green-transition-governance-and-climate-vulnerability-in-morocco" },
  script: { name: "IRCAM · Tifinaghe", url: "https://www.ircam.ma/fr/node/235" },
  letters: { name: "IRCAM · Tifinaghe : de la stèle au logiciel", url: "https://www.ircam.ma/fr/actualites/tifinaghe-de-la-stele-au-logiciel" },
  couscous: { name: "UNESCO · Couscous, 2020", url: "https://ich.unesco.org/en/RL/knowledge-know-how-and-practices-pertaining-to-the-production-and-consumption-of-couscous-01602" },
  mediterranean: { name: "UNESCO · Mediterranean diet, 2013", url: "https://ich.unesco.org/en/lists?RL=00884" },
  food: { name: "Office National Marocain du Tourisme · Food & drinks", url: "https://www.visitmorocco.com/en/travel-info/food-drinks" },
  heritage: { name: "Office National Marocain du Tourisme · Gastronomy", url: "https://www.visitmorocco.com/en/discover-morocco/gastronomy" },
  nutrition: { name: "OMS / WHO · Healthy diet, 2026", url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet" },
};

export const amazighDestaque = {
  numero: "01",
  tag: "Vidas do deserto",
  titulo: "Merzouga, entre dunas e mudanças",
  texto:
    "Os Aït Khabbash têm raízes no pastoreio nômade. Água e pastagens orientavam seus deslocamentos. Fronteiras e secas transformaram essa mobilidade. Muitas famílias passaram a viver em Merzouga e Hassilabied; algumas combinam pastoreio, moradia fixa e turismo.",
  fontes: [fontes.nomads],
};

export const amazighHistorias = [
  { numero: "02", tag: "Aït Atta · Aït Khabbash", titulo: "Povos, tribos e pertencimento", texto: "Os vínculos que atravessam gerações.", fontes: [fontes.arts] },
  { numero: "03", tag: "Tamazgha", titulo: "Raízes amazigh, presença viva", texto: "Uma história que continua.", fontes: [fontes.roots] },
  { numero: "04", tag: "Oásis", titulo: "O conhecimento da água", texto: "Ler a paisagem é parte da história.", fontes: [fontes.water] },
  { numero: "05", tag: "Tifinagh", titulo: "As letras que você encontra pelo caminho", texto: "Língua, escrita e pertencimento.", fontes: [fontes.script, fontes.letters] },
];

// "Sabores do Marrocos" — idem, portado de P7_RECIPES/p7food().
export const saboresHero = {
  kicker: "Sabores do Marrocos",
  titulo: "O Marrocos",
  tituloItalico: "também se conhece à mesa.",
  subtitle: "Especiarias, receitas e o prazer de compartilhar. Um convite para provar durante a viagem e cozinhar quando voltar.",
  img: "/img/couscous.jpg",
  imgCaption: "Cuscuz à mesa",
};

export const saboresEditorial = {
  kicker: "Uma cozinha de encontros",
  titulo: "Saberes compartilhados com o mundo.",
  texto:
    "Tradições amazigh, árabe-andaluzas e judaicas participam da diversidade da cozinha marroquina. Cada região e cada família acrescenta seu modo de preparar e servir.",
  fontes: [fontes.heritage],
};

export const saboresHeranca = {
  ano: "2020",
  titulo: "Os saberes do cuscuz",
  texto:
    "Reconhecidos pela UNESCO em candidatura conjunta de Argélia, Mauritânia, Marrocos e Tunísia. O patrimônio reúne preparo, transmissão de conhecimentos e partilha da refeição.",
  fontes: [fontes.couscous],
};

export const saboresBalanceado = {
  kicker: "Sabor e equilíbrio",
  titulo: "O cuidado começa nos ingredientes.",
  texto:
    "Legumes, leguminosas e cereais integrais podem compor refeições variadas e nutritivas. O equilíbrio também depende das porções e das quantidades de sal, açúcar e gorduras usadas no preparo.",
  fontes: [fontes.nutrition],
};

export const receitas = [
  {
    id: "tagine",
    img: "/img/tagine.jpg",
    prato: "Tajine",
    minutos: 50,
    titulo: "Tajine de legumes e grão-de-bico",
    intro: "Cozimento suave, especiarias e legumes da estação.",
  },
  {
    id: "couscous",
    img: "/img/couscous.jpg",
    prato: "Cuscuz marroquino",
    minutos: 40,
    titulo: "Cuscuz integral com legumes",
    intro: "Uma versão prática para a mesa de casa.",
  },
  {
    id: "harira",
    img: "/img/harira.jpg",
    prato: "Harira",
    minutos: 70,
    titulo: "Harira vegetariana",
    intro: "Lentilha, grão-de-bico e tomate em uma sopa perfumada.",
  },
];

export const quotes = [
  { p: "A noite no deserto foi a experiência mais linda da minha vida. Tudo impecável, do traslado ao guia.", a: "Mariana & Felipe", s: "Lua de mel · Marrocos Essencial" },
  { p: "Viajei com meus pais idosos e fiquei tranquila o tempo todo. O suporte em português fez toda a diferença. Chefchaouen é um sonho!", a: "Cláudia Resende", s: "Família · Marrocos Total" },
  { p: "Fui cética com pacote pronto, mas montaram tudo do meu jeito. Chorei no pôr do sol das dunas. Voltarei!", a: "Juliana Tavares", s: "Solo · roteiro personalizado" },
];

export const faq = [
  { q: "Brasileiro precisa de visto?", a: "Não. Brasileiros podem entrar no Marrocos sem visto para turismo por até 90 dias. Basta o passaporte válido por pelo menos 6 meses a partir da data de entrada." },
  { q: "Qual a moeda e como pagar?", a: "A moeda é o dirham marroquino (MAD). É uma moeda fechada: troque dinheiro já no Marrocos. Cartões são aceitos em hotéis e lojas maiores." },
  { q: "Que idioma se fala? E o português?", a: "Os idiomas oficiais são árabe e tamazight (berbere). Com a gente, você tem guia e suporte em português — a comunicação nunca será um problema." },
  { q: "Qual a melhor época para ir?", a: "Primavera (março a maio) e outono (setembro a novembro), com clima ameno e perfeito para o deserto." },
  { q: "O Marrocos é seguro?", a: "Sim, é um dos países mais seguros da África e do mundo árabe para turistas. Viajando com guia local e nossa estrutura, você fica amparado o tempo todo." },
];

export const contato = {
  whatsapp: "5599999999999",
  email: "contato@partiumarrocos.com.br",
  instagram: "#",
};
