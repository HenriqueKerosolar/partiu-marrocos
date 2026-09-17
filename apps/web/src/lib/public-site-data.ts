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
    img: "/img/dunes.jpg",
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

// "Universo amazigh" — aba com história em destaque + histórias expansíveis
// (o mockup tem 5; mantemos as mais fortes pra não inflar a página).
export const amazigh = {
  kicker: "Universo amazigh · Marrocos",
  titulo: "Amazigh.",
  tituloItalico: "Histórias que seguem vivas.",
  subtitle: "De Merzouga aos caminhos do Atlas: histórias, palavras e saberes para conhecer com tempo e atenção.",
  img: "/img/dunes.jpg",
  imgCaption: "Erg Chebbi · Merzouga",
  destaque: {
    numero: "01",
    tag: "Vidas do deserto",
    titulo: "Merzouga, entre dunas e mudanças",
    texto: "Os Aït Khabbash têm raízes no pastoreio nômade. Água e pastagens orientavam seus deslocamentos. Fronteiras e secas transformaram essa mobilidade. Muitas famílias passaram a viver em Merzouga e Hassilabied; algumas combinam pastoreio, moradia fixa e turismo.",
  },
  historias: [
    { numero: "02", tag: "Aït Atta · Aït Khabbash", titulo: "Povos, tribos e pertencimento", d: "Os vínculos que atravessam gerações." },
    { numero: "03", tag: "Tamazgha", titulo: "Raízes amazigh, presença viva", d: "Uma história que continua." },
    { numero: "04", tag: "Dasir", titulo: "O conhecimento da água", d: "Ler a paisagem é parte da história." },
  ],
};

// "Sabores do Marrocos" — mesma estrutura de aba do mockup (editorial +
// receitas pra cozinhar em casa), não mais o grid simples de pratos.
export const sabores = {
  kicker: "Sabores do Marrocos",
  titulo: "O Marrocos",
  tituloItalico: "também se conhece à mesa.",
  subtitle: "Especiarias, receitas e o prazer de compartilhar. Um convite para provar durante a viagem e cozinhar quando voltar.",
  img: "/img/tagine.jpg",
  imgCaption: "Cuscuz à mesa",
  editorial: {
    kicker: "Uma cozinha de encontros",
    titulo: "Saberes compartilhados com o mundo.",
    texto: "Tradições amazigh, árabe-andaluzas e judaicas participam da diversidade da cozinha marroquina. Cada região e cada família acrescenta seu modo de preparar e servir.",
  },
  receitas: [
    { t: "Tajine de legumes e grão-de-bico", tempo: "50 min · 4 porções", d: "Cozimento suave, especiarias e legumes da estação.", img: "/img/tagine.jpg" },
    { t: "Cuscuz integral com legumes", tempo: "40 min · 4 porções", d: "Uma versão prática para a mesa de casa.", img: "/img/couscous.jpg" },
    { t: "Harira vegetariana", tempo: "70 min · 4 porções", d: "Lentilha, grão-de-bico e tomate em uma sopa perfumada.", img: "/img/pastilla.jpg" },
  ],
};

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
