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

export const highlights = [
  { t: "Da neve ao deserto no mesmo dia", d: "Esquie no Atlas pela manhã e toque as dunas quentes do Saara à tarde. Um país, todos os mundos em 24 horas." },
  { t: "Cenários de cinema", d: "Pise nos sets de Gladiador, Game of Thrones e Duna em Ouarzazate e Aït Benhaddou, a Hollywood do deserto." },
  { t: "Uma das melhores cozinhas do mundo", d: "Tagine lento, couscous de sexta, pastilla agridoce e o ritual sagrado do chá de menta. Cada refeição é uma celebração." },
  { t: "O maior deserto do planeta", d: "Dormir sob as estrelas nas dunas de Merzouga é o tipo de noite que reorganiza a alma. Camelo, fogueira e silêncio." },
];

export type Pacote = {
  id: string;
  emoji: string;
  dias: string;
  noites: string;
  sub: string;
  sinopse: string;
  inc: string[];
  preco: string;
  featured?: boolean;
  badge?: string;
  img: string;
  rota: { km: number; stops: { n: string; s: string }[] };
};

export const pacotes: Pacote[] = [
  {
    id: "basico",
    emoji: "🐪",
    dias: "5 dias",
    noites: "4 noites",
    sub: "Básico",
    sinopse: "Marrakech, a travessia do Atlas e a noite mágica no deserto. O essencial, sem perder a magia.",
    inc: ["Traslados privativos aeroporto ↔ hotel", "2 noites em Marrakech + 1 no deserto", "Riads selecionados · grupo pequeno", "Guia falando português / espanhol"],
    preco: "R$ 4.890",
    img: "/img/jemaa.jpg",
    rota: { km: 560, stops: [{ n: "Marrakech", s: "o ponto de partida" }, { n: "Aït Benhaddou", s: "kasbah de cinema" }, { n: "Ouarzazate", s: "a porta do deserto" }, { n: "Merzouga", s: "as grandes dunas" }] },
  },
  {
    id: "essencial",
    emoji: "🕌",
    dias: "8 dias",
    noites: "7 noites",
    sub: "Essencial",
    sinopse: "As 4 cidades imperiais, o deserto e a lendária rota das kasbahs num só percurso.",
    inc: ["Café da manhã diário + 2 jantares típicos", "Noite premium no deserto + camelos", "Riads & boutique · Fez → Marrakech", "Guia exclusivo em português"],
    preco: "R$ 7.290",
    featured: true,
    badge: "Mais assistido",
    img: "/img/desertcamp.jpg",
    rota: { km: 1050, stops: [{ n: "Casablanca", s: "chegada · Hassan II" }, { n: "Fez", s: "a alma antiga" }, { n: "Merzouga", s: "noite no deserto" }, { n: "Marrakech", s: "o grand finale" }] },
  },
  {
    id: "total",
    emoji: "👑",
    dias: "12 dias",
    noites: "11 noites",
    sub: "Total",
    sinopse: "O país de ponta a ponta, incluindo Chefchaouen e Essaouira. Nada fica de fora.",
    inc: ["Tudo do Essencial + Chefchaouen", "2 dias completos no deserto + 4x4", "Acampamento de luxo em Erg Chebbi", "Concierge dedicado 24h em português"],
    preco: "R$ 10.900",
    img: "/img/chefchaouen.jpg",
    rota: { km: 1600, stops: [{ n: "Casablanca", s: "chegada" }, { n: "Chefchaouen", s: "a cidade azul" }, { n: "Merzouga", s: "dois dias no deserto" }, { n: "Marrakech", s: "a pérola do sul" }, { n: "Essaouira", s: "o mar, a despedida" }] },
  },
];

export type Destino = { key: string; k: string; t: string; img: string; d: string; f: string[] };

export const destinos: Destino[] = [
  { key: "merzouga", k: "O Grande Deserto", t: "Merzouga & o Saara", img: "/img/dunes.jpg", d: "O portal para o mar de areia. Em Merzouga começam as dunas de Erg Chebbi, que sobem até 150 metros e mudam de cor ao longo do dia.", f: ["🐪 Caravana de camelos", "⭐ Noite sob as estrelas", "🏕️ Glamping no deserto"] },
  { key: "chefchaouen", k: "A Cidade Azul", t: "Chefchaouen", img: "/img/chefchaouen.jpg", d: "Encravada nas montanhas do Rif, Chefchaouen parece um sonho pintado de azul. Cada parede, escada e porta veste mil tons de índigo.", f: ["💙 Medina toda azul", "⛰️ Montanhas do Rif", "📷 Paraíso fotográfico"] },
  { key: "fes", k: "A Alma Antiga", t: "Fez", img: "/img/fes.jpg", d: "A capital espiritual e intelectual do Marrocos. Sua medina, Fes el-Bali, é a maior área urbana sem carros do mundo: 9 mil becos.", f: ["🎓 Universidade mais antiga do mundo", "🧵 Curtumes Chouara", "🕌 Madrassas douradas"] },
  { key: "aitbenhaddou", k: "A Cidade de Barro", t: "Aït Benhaddou", img: "/img/aitbenhaddou.jpg", d: "Um ksar de barro vermelho que parece esculpido pelo tempo. Patrimônio Mundial da UNESCO, cenário de Gladiador e Game of Thrones.", f: ["🎬 Cenário de cinema", "🏰 Patrimônio UNESCO", "🟤 Arquitetura de barro"] },
  { key: "jemaa", k: "A Pérola do Sul", t: "Marrakech", img: "/img/jemaa.jpg", d: "A praça Jemaa el-Fna, coração pulsante de Marrakech, vive dia e noite: contadores de histórias, música, comida e o labirinto dos souks.", f: ["🌙 Jemaa el-Fna", "🏛️ Palácio da Bahia", "🌵 Jardim Majorelle"] },
  { key: "essaouira", k: "A Brisa do Atlântico", t: "Essaouira", img: "/img/essaouira.jpg", d: "A joia ventosa do litoral. Cidade fortificada de muralhas brancas e portas azuis, Essaouira respira arte, música gnawa e peixe fresco.", f: ["🌊 Cidade à beira-mar", "🎵 Música gnawa", "🏄 Ventos para o surf"] },
];

export const sabores = [
  { img: "/img/tagine.jpg", t: "Tagine", d: "O prato-símbolo: cozido lento no cone de barro. Conforto puro." },
  { img: "/img/couscous.jpg", t: "Couscous", d: "O ritual de sexta-feira, partilhado em família." },
  { img: "/img/pastilla.jpg", t: "Pastilla", d: "A surpresa agridoce, com açúcar e canela. Inesquecível." },
  { img: "/img/tea.jpg", t: "Chá de menta", d: "O \"whisky berbere\": hospitalidade em forma líquida." },
];

export const amazighParas = [
  "Muito antes de ser Marrocos, esta terra pertencia aos Amazigh — nome que significa, simplesmente, homem livre. Eles habitam o norte da África há mais de seis mil anos, com sua própria língua, o Tamazight, e uma escrita de símbolos antigos: o Tifinagh.",
  "Nas alturas do Atlas, os Amazigh criaram aldeias onde ninguém podia ser rei — uma democracia das montanhas, decidida em conselho. Quando você é recebido com chá de menta e pão quente numa casa de barro, está tocando essa hospitalidade milenar.",
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
