/* ============================================================
   PARTIU MARROCOS — js/data.js
   BANCO DE DADOS DO SITE. Tudo aqui é editável pelo admin.html.
   Ordem de carga: defaults → data.json (servidor) → rascunho local
   ============================================================ */
window.PM_DEFAULTS = {
  config:{
    whatsapp:"5599999999999",
    email:"contato@partiumarrocos.com.br",
    site:"www.partiumarrocos.com.br",
    /* Integração com o CRM real (packages/db + apps/web deste monorepo) —
       o formulário de orçamento grava o lead aqui ANTES de abrir o
       WhatsApp (ver POST em js/cinema.js e apps/web/src/app/api/public/
       leads/route.ts). Vazio = formulário funciona normalmente, só não
       grava lead nenhum (nunca trava a experiência do visitante). */
    apiBase:"https://partiu-marrocos.vercel.app", tenantSlug:"partiu-marrocos",
    instagram:"#", facebook:"#",
    youtube:"",                     /* ID ou URL do teaser do YouTube */
    videoNote:"🎥 Em breve, novos episódios da série \"Partiu Marrocos\".",
    owner:"Amazigh Turismo",        /* dona do site */
    operator:"PromoroccoTour"       /* responsável pelo turismo no Marrocos */
  },
  hero:{
    kicker:"Amazigh Turismo & PromoroccoTour apresentam",
    partiu:"Partiu,", titulo:"MARROCOS", oIndex:4,
    subtitle:"Um país onde cada dia parece dirigido: o deserto ao entardecer, medinas milenares, a cidade azul. <b>Sua próxima viagem, filmada em 70mm.</b>",
    stats:[{n:"20",suf:"+",l:"anos de estrada"},{n:"12",suf:"k+",l:"viajantes"},{n:"4,9★",suf:"",l:"avaliação"},{n:"100%",suf:"",l:"em português"}],
    img:"img/saharasunset.jpg"
  },
  trailer:{
    lines:["Existem viagens que a gente conta.",
      "E existem viagens que a gente <em>revive de olhos fechados.</em>",
      "A 8 horas do Brasil, um mundo inteiro: <span class=\"hi\">deserto, neve, mar e medinas milenares.</span>"],
    takes:[
      {t:"Da neve ao deserto no mesmo dia",d:"Esquie no Atlas pela manhã e toque as dunas quentes do Saara à tarde. Um país, todos os mundos em 24 horas."},
      {t:"Cenários de cinema",d:"Pise nos sets de Gladiador, Game of Thrones e Duna em Ouarzazate e Aït Benhaddou, a Hollywood do deserto."},
      {t:"Uma das melhores cozinhas do mundo",d:"Tagine lento, couscous de sexta, pastilla agridoce e o ritual sagrado do chá de menta. Cada refeição é uma celebração."},
      {t:"O maior deserto do planeta",d:"Dormir sob as estrelas nas dunas de Merzouga é o tipo de noite que reorganiza a alma. Camelo, fogueira e silêncio."},
      {t:"Luxo que cabe no bolso",d:"Riads de cinema, jantares incríveis e passeios privados por uma fração do que custam na Europa."},
      {t:"O povo dos Homens Livres",d:"Os Amazigh habitam estas terras há mais de 6 mil anos. Recebem o estrangeiro como família — talvez a maior atração de todas."},
      {t:"Sede da Copa de 2030",d:"Ao lado de Espanha e Portugal, a primeira Copa da história em três continentes. Conheça antes da multidão."},
      {t:"Suporte 100% em português",d:"Uma equipe brasileira que entende você e parceiros marroquinos que conhecem cada curva. Você nunca viaja sozinho."}
    ]
  },
  destinos:[
    {key:"merzouga",k:"O Grande Deserto",t:"Merzouga & o Saara",img:"img/dunes.jpg",strip:true,cap:"Merzouga",sub:"O grande deserto",d:"O portal para o mar de areia. Em Merzouga começam as dunas de Erg Chebbi, que sobem até 150 metros e mudam de cor ao longo do dia. Aqui você cavalga camelos ao pôr do sol, dorme em acampamentos de luxo e contempla o céu mais estrelado da vida. A experiência que define uma viagem ao Marrocos.",f:["🐪 Caravana de camelos","⭐ Noite sob as estrelas","🏕️ Glamping no deserto","🌅 Nascer do sol nas dunas"]},
    {key:"chefchaouen",k:"A Cidade Azul",t:"Chefchaouen",img:"img/chefchaouen.jpg",strip:true,cap:"Chefchaouen",sub:"A cidade azul",d:"Encravada nas montanhas do Rif, Chefchaouen parece um sonho pintado de azul. Cada parede, escada e porta veste mil tons de índigo, criando o cenário mais fotogênico do Marrocos. Tranquila e acolhedora, é o lugar perfeito para se perder sem pressa, câmera na mão e o coração leve.",f:["💙 Medina toda azul","⛰️ Montanhas do Rif","📷 Paraíso fotográfico","🧶 Artesanato local"]},
    {key:"fes",k:"A Alma Antiga",t:"Fez",img:"img/fes.jpg",strip:true,cap:"Fez",sub:"A alma antiga",d:"A capital espiritual e intelectual do Marrocos. Sua medina, Fes el-Bali, é a maior área urbana sem carros do mundo: 9 mil becos onde o tempo parou. Aqui está a Universidade Al-Qarawiyyin (859 d.C.), a mais antiga em funcionamento no planeta, e os curtumes Chouara, com seus tanques de cores impossíveis.",f:["🎓 Universidade mais antiga do mundo","🧵 Curtumes Chouara","🕌 Madrassas douradas","🚶 9 mil becos históricos"]},
    {key:"aitbenhaddou",k:"A Cidade de Barro",t:"Aït Benhaddou",img:"img/aitbenhaddou.jpg",strip:true,cap:"Aït Benhaddou",sub:"A cidade de barro",d:"Um ksar de barro vermelho que parece esculpido pelo tempo. Patrimônio Mundial da UNESCO, esta fortaleza de casas empilhadas na encosta foi cenário de Gladiador, Game of Thrones, Duna e tantos outros. Atravessar suas vielas é caminhar dentro de um épico do cinema — e da história das caravanas saarianas.",f:["🎬 Cenário de cinema","🏰 Patrimônio UNESCO","🟤 Arquitetura de barro","🐫 Rota das caravanas"]},
    {key:"jemaa",k:"A Pérola do Sul",t:"Marrakech",img:"img/jemaa.jpg",strip:true,cap:"Marrakech",sub:"A pérola do sul",d:"A praça Jemaa el-Fna, coração pulsante de Marrakech e Patrimônio Imaterial da UNESCO, vive dia e noite: contadores de histórias, música, comida e o labirinto dos souks. Ao redor, o Palácio da Bahia, o Jardim Majorelle e os Túmulos Saadianos completam a cidade mais magnética do reino.",f:["🌙 Jemaa el-Fna","🏛️ Palácio da Bahia","🌵 Jardim Majorelle","🧿 Souks lendários"]},
    {key:"essaouira",k:"A Brisa do Atlântico",t:"Essaouira",img:"img/essaouira.jpg",strip:true,cap:"Essaouira",sub:"A brisa do Atlântico",d:"A joia ventosa do litoral. Cidade fortificada de muralhas brancas e portas azuis, Essaouira respira arte, música gnawa e peixe fresco no porto. Suas ruas relaxadas, galerias e a brisa constante atraem surfistas, artistas e quem busca um Marrocos mais leve e boêmio. Também já foi cenário de Game of Thrones.",f:["🌊 Cidade à beira-mar","🎵 Música gnawa","🐟 Porto de peixe fresco","🏄 Ventos para o surf"]},
    {key:"todra",k:"Os Desfiladeiros",t:"Todra & Dades",img:"img/todra.jpg",strip:true,cap:"Todra & Dades",sub:"Os desfiladeiros",d:"A natureza em estado bruto. As gargantas de Todra são paredões de até 300 metros que se estreitam dramaticamente sobre um rio cristalino, paraíso de escaladores. Ao lado, o vale do Dades serpenteia entre formações rochosas surreais e a 'estrada das mil kasbahs'. Cenários que tiram o fôlego a cada curva.",f:["🧗 Paredões de 300m","💧 Rio cristalino","🛣️ Estrada das mil kasbahs","📸 Paisagens dramáticas"]},
    {key:"casablanca",k:"A Metrópole",t:"Casablanca",img:"img/hassan2.jpg",strip:true,cap:"Casablanca",sub:"A metrópole",d:"A face moderna e cosmopolita do Marrocos. Cidade de negócios e arquitetura art déco, Casablanca abriga a deslumbrante Mesquita Hassan II — uma das maiores do mundo, com seu minarete de 210 metros erguido sobre o oceano Atlântico. É a porta de entrada de muitas viagens e mistura o clássico com o contemporâneo.",f:["🕌 Mesquita Hassan II","🌊 Sobre o Atlântico","🏙️ Art déco","✈️ Principal porta de entrada"]},
    {key:"rabat",k:"A Capital Serena",t:"Rabat",img:"img/rabat.jpg",strip:false,cap:"Rabat",sub:"A capital serena",d:"Elegante, verde e tranquila, a capital do reino é Patrimônio Mundial. Rabat reúne a imponente Torre Hassan, o místico Kasbah dos Oudaias debruçado sobre o mar com suas ruas azuis e brancas, e o Mausoléu Mohammed V. Uma cidade que equilibra história, poder e uma atmosfera surpreendentemente calma.",f:["🗼 Torre Hassan","🏛️ Kasbah dos Oudaias","👑 Mausoléu Mohammed V","🌿 Patrimônio UNESCO"]},
    {key:"ouarzazate",k:"A Hollywood Africana",t:"Ouarzazate",img:"img/ouarzazate.jpg",strip:false,cap:"Ouarzazate",sub:"A Hollywood africana",d:"A 'porta do deserto' e capital do cinema marroquino. Aqui ficam os famosos Atlas Studios, um dos maiores complexos de estúdios do mundo, e a Kasbah Taourirt. De Lawrence da Arábia a Duna, incontáveis épicos foram filmados nestas paisagens. Base perfeita para explorar a rota das kasbahs e o sul profundo.",f:["🎬 Atlas Studios","🏰 Kasbah Taourirt","🏜️ Porta do deserto","🎥 Sets de cinema famosos"]},
    {key:"volubilis",k:"Roma na África",t:"Volubilis",img:"img/volubilis.jpg",strip:false,cap:"Volubilis",sub:"Roma na África",d:"As ruínas romanas mais bem preservadas do norte da África. Patrimônio Mundial da UNESCO, Volubilis guarda arcos triunfais, colunas e mosaicos de chão intactos há quase dois mil anos, espalhados por uma colina de oliveiras. Um salto no tempo até o império romano, pertinho da cidade imperial de Meknes.",f:["🏛️ Ruínas romanas","🎨 Mosaicos intactos","🌳 Colina de oliveiras","🏺 Patrimônio UNESCO"]}
  ],
  pacotes:[
    {id:"basico",emoji:"🐪",cat:"Curta",dias:"5 dias",noites:"4 noites",ep:"A estreia",nome:"Marrocos",sub:"Básico",
     sinopse:"Marrakech, a travessia do Atlas e a noite mágica no deserto. O essencial, sem perder a magia.",
     inc:["Traslados privativos aeroporto ↔ hotel","2 noites em Marrakech + 1 no deserto","Riads selecionados · grupo pequeno","Guia falando português / espanhol"],
     preco:"R$ 4.890",featured:false,img:"img/jemaa.jpg",
     roteiro:[
       {n:"Dia 1",t:"Chegada a Marrakech",d:"Traslado privativo e primeira noite na praça mais viva da África.",chips:["Riad","Jemaa el-Fna","Jantar livre"]},
       {n:"Dia 2",t:"Marrakech imperial",d:"Palácio da Bahia, Jardim Majorelle, Túmulos Saadianos e os souks.",chips:["Bahia","Majorelle","Souks"]},
       {n:"Dia 3",t:"Atlas & Aït Benhaddou",d:"Travessia de montanha até a kasbah de cinema. Noite em Ouarzazate.",chips:["Alto Atlas","Kasbah","Cinema"]},
       {n:"Dia 4",t:"Dunas de Merzouga",d:"Passeio de camelo e noite em acampamento de luxo no Saara.",chips:["Camelo","Glamping","Fogueira"]},
       {n:"Dia 5",t:"Amanhecer & retorno",d:"Nascer do sol nas dunas e traslado de volta. Fim da jornada.",chips:["Sunrise","Retorno"]}],
     rota:{km:560,stops:[
       {n:"Marrakech",s:"o ponto de partida"},{n:"Aït Benhaddou",s:"kasbah de cinema"},{n:"Ouarzazate",s:"a porta do deserto"},
       {n:"Vale do Dadès",s:"estradas sinuosas"},{n:"Gargantas do Todra",s:"paredões de 300 m"},{n:"Merzouga · Erg Chebbi",s:"as grandes dunas"}]}},
    {id:"essencial",emoji:"🕌",cat:"Longa",dias:"8 dias",noites:"7 noites",ep:"O clássico",nome:"Marrocos",sub:"Essencial",
     sinopse:"As 4 cidades imperiais, o deserto e a lendária rota das kasbahs num só percurso.",
     inc:["Café da manhã diário + 2 jantares típicos","Noite premium no deserto + camelos","Riads & boutique · Fez → Marrakech","Guia exclusivo em português"],
     preco:"R$ 7.290",featured:true,badge:"Mais assistido",img:"img/desertcamp.jpg",
     roteiro:[
       {n:"Dia 1",t:"Casablanca",d:"Mesquita Hassan II sobre o Atlântico e primeira noite urbana.",chips:["Hassan II","Oceano"]},
       {n:"Dia 2",t:"Rabat & Volubilis",d:"A capital, ruínas romanas e chegada à milenar Fez.",chips:["Rabat","Volubilis","Meknes"]},
       {n:"Dia 3",t:"Fez, a eterna",d:"A medina-labirinto, a universidade mais antiga do mundo e os curtumes.",chips:["Medina","Al-Qarawiyyin","Curtumes"]},
       {n:"Dia 4",t:"Cedros & Gargantas de Todra",d:"Da Suíça marroquina aos paredões de 300m de Todra.",chips:["Ifrane","Todra"]},
       {n:"Dia 5",t:"Noite no deserto",d:"Caravana de camelos e glamping nas dunas de Erg Chebbi.",chips:["Camelo","Glamping","Estrelas"]},
       {n:"Dia 6",t:"Ouarzazate & Aït Benhaddou",d:"Estúdios de cinema, a kasbah patrimônio e travessia do Atlas.",chips:["Ouarzazate","Aït Benhaddou"]},
       {n:"Dia 7",t:"Marrakech imperial",d:"Bahia, Majorelle, souks e a noite mágica na Jemaa el-Fna.",chips:["Bahia","Majorelle","Souks"]},
       {n:"Dia 8",t:"Traslado & partida",d:"Últimas compras e despedida com o coração cheio.",chips:["Compras","Retorno"]}],
     rota:{km:1050,stops:[
       {n:"Casablanca",s:"chegada · Hassan II"},{n:"Rabat",s:"a capital serena"},{n:"Volubilis · Meknes",s:"Roma na África"},
       {n:"Fez",s:"a alma antiga"},{n:"Ifrane · Todra",s:"cedros e desfiladeiros"},{n:"Merzouga",s:"noite no deserto"},
       {n:"Ouarzazate",s:"kasbahs de cinema"},{n:"Marrakech",s:"o grand finale"}]}},
    {id:"total",emoji:"👑",cat:"Épico",dias:"12 dias",noites:"11 noites",ep:"A obra completa",nome:"Marrocos",sub:"Total",
     sinopse:"O país de ponta a ponta, incluindo Chefchaouen e Essaouira. Nada fica de fora.",
     inc:["Tudo do Essencial + Chefchaouen","2 dias completos no deserto + 4x4","Acampamento de luxo em Erg Chebbi","Concierge dedicado 24h em português"],
     preco:"R$ 10.900",featured:false,img:"img/chefchaouen.jpg",
     roteiro:[
       {n:"Dias 1–2",t:"Casablanca & Rabat",d:"A metrópole oceânica e a capital serena do reino.",chips:["Hassan II","Rabat"]},
       {n:"Dia 3",t:"Chefchaouen, a azul",d:"O dia inteiro na cidade-sonho das montanhas do Rif.",chips:["Cidade Azul","Rif","Fotografia"]},
       {n:"Dia 4",t:"Volubilis & Meknes",d:"Mosaicos romanos e a grandiosa cidade imperial de Meknes.",chips:["Volubilis","Meknes"]},
       {n:"Dias 5–6",t:"Fez em profundidade",d:"Dois dias na medina eterna, oficinas de artesãos e história viva.",chips:["Medina","Curtumes","Artesanato"]},
       {n:"Dia 7",t:"Gargantas de Todra",d:"Florestas de cedro e os paredões dramáticos de Todra.",chips:["Ifrane","Todra","Dades"]},
       {n:"Dias 8–9",t:"Dois dias no deserto",d:"Camelos, 4x4 nas dunas, nômades e noites de música berbere.",chips:["Erg Chebbi","4x4","Nômades"]},
       {n:"Dia 10",t:"Ouarzazate & Aït Benhaddou",d:"A Hollywood africana, a kasbah-patrimônio e a travessia do Atlas.",chips:["Cinema","Kasbah"]},
       {n:"Dia 11",t:"Marrakech imperial",d:"Os palácios, jardins e a noite lendária da Jemaa el-Fna.",chips:["Bahia","Majorelle","Souks"]},
       {n:"Dia 12",t:"Essaouira & despedida",d:"A cidade-fortaleza do Atlântico antes do retorno.",chips:["Oceano","Retorno"]}],
     rota:{km:1600,stops:[
       {n:"Casablanca",s:"chegada"},{n:"Rabat",s:"a capital"},{n:"Chefchaouen",s:"a cidade azul"},
       {n:"Volubilis · Meknes",s:"história romana"},{n:"Fez",s:"dois dias na medina"},{n:"Todra · Dades",s:"desfiladeiros"},
       {n:"Merzouga",s:"dois dias no deserto"},{n:"Ouarzazate",s:"Hollywood africana"},{n:"Marrakech",s:"a pérola do sul"},
       {n:"Essaouira",s:"o mar, a despedida"}]}}
  ],
  precosNota:"💡 Valores de referência por pessoa em quarto duplo, sem aéreo internacional.<br>Cada viagem é orçada sob medida · <a href=\"#reservar\">peça seu orçamento personalizado →</a>",
  experiencias:[
    {tk:"EXT · Saara · noite",img:"img/berbercamp.jpg",t:"Noite glamping no Saara",d:"Tendas berberes, jantar à luz de lampião e o céu mais estrelado da vida em Erg Chebbi."},
    {tk:"EXT · dunas · pôr do sol",img:"img/merzouga.jpg",t:"Caravana de camelos",d:"Atravesse o mar de areia guiado por nômades, como há séculos."},
    {tk:"INT · hammam",img:"img/bahia.jpg",t:"Hammam & ritual de argan",d:"O banho de vapor tradicional com sabão preto e óleo de argan. Relaxamento ancestral."},
    {tk:"INT · cozinha local",img:"img/tagine.jpg",t:"Aula de cozinha marroquina",d:"Tagine e couscous do zero com uma família local — do mercado à mesa."},
    {tk:"EXT · dunas · ação",img:"img/dunes.jpg",t:"Quadriciclo & sandboard",d:"Pilote um quad pela areia dourada e desça as encostas de prancha."},
    {tk:"EXT · estúdios",img:"img/ouarzazate.jpg",t:"Cenários de cinema",d:"Os sets de Gladiador, Game of Thrones e Duna em Ouarzazate e Aït Benhaddou."},
    {tk:"INT · medina",img:"img/souk.jpg",t:"Caça ao tesouro nos souks",d:"Tapetes, especiarias, lamparinas e couro. Aprenda a pechinchar nos maiores mercados do mundo."},
    {tk:"EXT · montanha",img:"img/atlas.jpg",t:"Trilhas no Alto Atlas",d:"Aldeias berberes, cachoeiras e vales verdes nas montanhas mais altas do norte da África."},
    {tk:"INT · casa de chá",img:"img/tea.jpg",t:"O ritual do chá de menta",d:"O \"whisky berbere\": aprenda a arte de servir o chá do alto, símbolo sagrado da hospitalidade."}],
  pratos:[
    {img:"img/tagine.jpg",t:"Tagine",d:"O prato-símbolo: cozido lento no cone de barro. Conforto puro."},
    {img:"img/couscous.jpg",t:"Couscous",d:"O ritual de sexta-feira, partilhado em família."},
    {img:"img/pastilla.jpg",t:"Pastilla",d:"A surpresa agridoce, com açúcar e canela. Inesquecível."},
    {img:"img/tea.jpg",t:"Chá de menta",d:"O \"whisky berbere\": hospitalidade em forma líquida."},
    {img:"img/harira.jpg",t:"Harira",d:"A sopa nacional. Aconchego numa tigela."},
    {img:"img/msemen.jpg",t:"Msemen",d:"A panqueca folhada do café da manhã. Vício imediato."},
    {img:"img/chebakia.jpg",t:"Chebakia",d:"Flor de massa frita em mel e gergelim."},
    {img:"img/souk.jpg",t:"Especiarias",d:"Cominho, açafrão, ras el hanout: a alma de cada prato."}],
  peeks:[
    {k:"Cidade azul",t:"Ruas de Chefchaouen",img:"img/chefchaouen.jpg"},
    {k:"Erg Chebbi",t:"Pôr do sol no Saara",img:"img/saharasunset.jpg"},
    {k:"Marrakech",t:"Praça Jemaa el-Fna",img:"img/jemaa.jpg"},
    {k:"Medina de Fez",t:"Bab Bou Jeloud",img:"img/fes.jpg"},
    {k:"Casablanca",t:"Mesquita Hassan II",img:"img/hassan2.jpg"},
    {k:"Ouarzazate",t:"Kasbah Aït Benhaddou",img:"img/aitbenhaddou.jpg"}],
  fatos:[
    {i:"🎓",t:"A universidade mais antiga do mundo",d:"A Al-Qarawiyyin, em Fez, foi fundada em 859 d.C. por uma mulher, Fátima al-Fihri — e funciona até hoje."},
    {i:"🧬",t:"O berço da humanidade",d:"Em Jebel Irhoud foram achados os fósseis de Homo sapiens mais antigos já descobertos: cerca de 300 mil anos."},
    {i:"💙",t:"Uma cidade inteira pintada de azul",d:"Em Chefchaouen, cada parede é tingida de índigo. O azul refresca, espanta insetos e ecoa uma herança ancestral."},
    {i:"🎬",t:"A Hollywood do deserto",d:"Ouarzazate e Aït Benhaddou já foram cenário de Gladiador, Game of Thrones, Duna e A Múmia."},
    {i:"🐐",t:"Cabras que sobem em árvores",d:"No sudoeste, cabras escalam as árvores de argan para comer seus frutos. Real, surreal — e fotogênico."},
    {i:"🏔️",t:"Da neve ao deserto no mesmo dia",d:"Esqui nas montanhas do Atlas pela manhã, dunas quentes do Saara à tarde. Todos os mundos em 24 horas."},
    {i:"ⵣ",t:"Um alfabeto de 3 mil anos",d:"O Tifinagh é um dos alfabetos vivos mais antigos do mundo. A letra ⵣ (yaz) significa \"homem livre\"."},
    {i:"⚽",t:"Uma Copa em três continentes",d:"O Marrocos sedia a Copa de 2030 ao lado de Espanha e Portugal — a primeira da história em três continentes."},
    {i:"🍵",t:"O ritual do chá de menta",d:"Servido do alto em fio dourado: mais que bebida, hospitalidade em forma líquida, em toda casa marroquina."}],
  quotes:[
    {p:"\"A noite no deserto foi a experiência mais linda da minha vida. Tudo impecável, do traslado ao guia.\"",a:"Mariana & Felipe",s:"Lua de mel · Marrocos Essencial"},
    {p:"\"Viajei com meus pais idosos e fiquei tranquila o tempo todo. O suporte em português fez toda a diferença. Chefchaouen é um sonho!\"",a:"Cláudia Resende",s:"Família · Marrocos Total"},
    {p:"\"Fui cética com pacote pronto, mas montaram tudo do meu jeito. Chorei no pôr do sol das dunas. Voltarei!\"",a:"Juliana Tavares",s:"Solo · roteiro personalizado"},
    {p:"\"Levamos um grupo de 12 amigos e foi perfeito do começo ao fim. Recomendo de olhos fechados.\"",a:"Rodrigo Alves",s:"Grupo de amigos · Marrocos Essencial"},
    {p:"\"O melhor custo-benefício que já vi numa viagem internacional. A equipe respondia no WhatsApp na hora. Nota mil.\"",a:"Patrícia Souza",s:"Casal · Marrocos Básico"}],
  elenco:[
    {av:"AT",role:"Dona do site · Direção & curadoria",t:"Amazigh Turismo",d:"Apaixonados pelo Marrocos e pela cultura Amazigh, lideramos a curadoria das viagens e a ponte entre o Brasil e a terra dos homens livres."},
    {av:"GM",role:"Guia-chefe · Marrocos",t:"Nome do guia",d:"Nascido na região, conhece os atalhos, as famílias berberes e as melhores horas para cada paisagem. Fala português e árabe."},
    {av:"BR",role:"Atendimento Brasil",t:"Nome do time",d:"Cuida de cada detalhe do seu planejamento em português, do primeiro orçamento ao embarque. Sua dúvida nunca fica sem resposta."},
    {av:"PT",role:"Responsável pelo turismo no Marrocos",t:"PromoroccoTour",d:"Mais de 20 anos operando no Marrocos: transporte, riads selecionados, acampamentos no deserto e segurança em toda a rota."}],
  faq:[
    {q:"🛂 Brasileiro precisa de visto?",a:"<strong>Não.</strong> Brasileiros podem entrar no Marrocos sem visto para turismo por até <strong>90 dias</strong>. Basta o passaporte válido por pelo menos 6 meses a partir da data de entrada. Simples assim — só chegar."},
    {q:"💰 Qual a moeda e como pagar?",a:"A moeda é o <strong>dirham marroquino (MAD)</strong>. É uma moeda fechada: troque dinheiro já no Marrocos (aeroporto, casas de câmbio ou caixas eletrônicos). Cartões são aceitos em hotéis e lojas maiores, mas leve dinheiro vivo para os souks, gorjetas e cidadezinhas. A gente te orienta direitinho."},
    {q:"🗣️ Que idioma se fala? E o português?",a:"Os idiomas oficiais são o <strong>árabe</strong> e o <strong>tamazight (berbere)</strong>. O <strong>francês</strong> é amplamente falado, e muitos no turismo falam <strong>espanhol</strong> (e cada vez mais inglês). Com a gente, você tem <strong>guia e suporte em português</strong> — então a comunicação nunca será um problema. <em>Shukran</em> (obrigado) e <em>Salam</em> (olá) já abrem muitos sorrisos!"},
    {q:"🌡️ Qual a melhor época para ir?",a:"As melhores estações são a <strong>primavera (março a maio)</strong> e o <strong>outono (setembro a novembro)</strong>, com clima ameno e perfeito para o deserto. O verão é quente no interior (mas ótimo no litoral, como Essaouira), e o inverno traz neve no Atlas e noites frias no Saara — cada época tem seu charme. A gente ajuda a escolher a ideal para você."},
    {q:"🛡️ O Marrocos é seguro?",a:"<strong>Sim, é um dos países mais seguros da África e do mundo árabe para turistas.</strong> O povo é acolhedor e hospitaleiro. Como em qualquer destino, vale o bom senso nas áreas movimentadas. Viajando com guia local e nossa estrutura, você fica amparado o tempo todo."},
    {q:"👗 Como me vestir?",a:"O Marrocos é relativamente liberal, mas é um país de maioria muçulmana. Recomenda-se <strong>roupas que cubram ombros e joelhos</strong>, especialmente em locais religiosos e cidades menores — vale para homens e mulheres. Roupas leves para o calor do dia e um agasalho para as noites do deserto, que esfriam bastante."},
    {q:"📱 Internet, chip e tomada",a:"Você pode comprar um <strong>chip local (Maroc Telecom, Orange, Inwi)</strong> baratíssimo no aeroporto, com bastante internet. Wi-Fi é comum em hotéis e cafés. As tomadas são padrão <strong>europeu (tipo C/E, 220V)</strong> — leve um adaptador. O fuso é geralmente <strong>3 a 4 horas à frente do Brasil</strong> (varia com o horário de verão)."},
    {q:"💵 Gorjetas: como funciona?",a:"A gorjeta (<em>\"pourboire\"</em>) faz parte da cultura. Alguns dirhams para carregadores, garçons e atendentes são bem-vindos. Para guias e motoristas, é costume um valor ao final dos serviços. Nada obrigatório, mas um gesto sempre apreciado. A gente te passa uma referência tranquila."}],
  alma:{
    paras:["Muito antes de ser Marrocos, esta terra pertencia aos <b>Amazigh</b> — nome que significa, simplesmente, <i>homem livre</i>. Eles habitam o norte da África há mais de seis mil anos, com sua própria língua, o <b>Tamazight</b>, e uma escrita de símbolos antigos: o <b>Tifinagh</b>.",
      "Foi aqui, em Jebel Irhoud, que se encontraram os ossos do <i>Homo sapiens</i> mais antigos já descobertos — cerca de 300 mil anos. A própria história da humanidade tem um capítulo escrito nestas montanhas e desertos.",
      "Nas alturas do Atlas, os Amazigh criaram aldeias onde <b>ninguém podia ser rei</b> — uma democracia das montanhas, decidida em conselho. Quando você é recebido com chá de menta e pão quente numa casa de barro, está tocando essa hospitalidade milenar. É, talvez, a mais profunda de todas as atrações do Marrocos."],
    quote:"\"Antes dos impérios, antes das fronteiras, antes dos mapas — já havia um povo que se chamava livre.\"",
    stats:[{b:"300 mil",n:300,suf:" mil",s:"anos de presença humana em Jebel Irhoud"},{b:"6 mil",n:6,suf:" mil",s:"anos de cultura e língua Amazigh vivas"},{b:"2011",n:2011,suf:"",s:"o Tamazight torna-se língua oficial do reino"},{b:"ⵣ yaz",n:0,suf:"",s:"a letra que significa \"homem livre\" — o coração da identidade berbere"}]
  },
  chatbot:{
    nome:"Yalla",
    chips:["Ver pacotes","Quanto custa?","Preciso de visto?","Melhor época","Copa 2030","Falar com a equipe"],
    fallback:"Hmm, essa eu prefiro deixar com um humano pra te responder certinho. 😊 Posso te conectar com nossa equipe no WhatsApp? Enquanto isso, posso falar sobre *pacotes, preços, visto, melhor época* ou a *Copa 2030*.",
    kb:[
      {k:"ola,olá,oi,bom dia,boa tarde,boa noite,eai,e aí,hello,salam",a:"Salam! 👋 Eu sou o *Yalla*, assistente da Partiu Marrocos. Posso te ajudar com pacotes, preços, visto, melhor época, a Copa 2030 e muito mais. O que você quer saber?"},
      {k:"pacote,pacotes,roteiro,roteiros,opcoes,opções,plano",a:"Temos pacotes em grupo ou privados: 🐪 *Básico* (5 dias — Marrakech + deserto), 🕌 *Essencial* (8 dias — 4 cidades imperiais + deserto) e 👑 *Total* (12 dias — o país inteiro, com Chefchaouen e Essaouira). Quer que eu te leve até eles?"},
      {k:"preco,preço,precos,preços,valor,valores,custa,custo,quanto,investimento",a:"Os valores de referência por pessoa começam em: *Básico* a partir de R$ 4.890, *Essencial* R$ 7.290 e *Total* R$ 10.900. Cada viagem é orçada sob medida conforme datas, nº de pessoas e hotéis. Posso te encaminhar um orçamento personalizado — quer?"},
      {k:"visto,passaporte,documento,documentos,entrada",a:"Boa notícia: brasileiros *não precisam de visto* para turismo no Marrocos por até 90 dias! 🛂 Basta o passaporte válido por pelo menos 6 meses. Simples assim."},
      {k:"epoca,época,quando ir,melhor mes,melhor mês,clima,tempo,temperatura,estacao,estação",a:"As melhores épocas são a *primavera (mar–mai)* e o *outono (set–nov)*: clima ameno, perfeito para o deserto. 🌡️ Verão é quente no interior (ótimo no litoral) e inverno traz neve no Atlas. Posso ajudar a escolher a data ideal pra você."},
      {k:"moeda,dirham,dinheiro,cambio,câmbio,pagar,cartao,cartão,dolar,dólar",a:"A moeda é o *dirham (MAD)*. 💰 É fechada, então troca-se já no Marrocos. Cartões funcionam em hotéis e lojas maiores, mas leve dinheiro vivo para souks e gorjetas. A gente te orienta direitinho antes da viagem."},
      {k:"idioma,lingua,língua,fala,portugues,português,frances,francês,ingles,inglês",a:"Os idiomas oficiais são árabe e tamazight (berbere); francês é muito usado e espanhol é comum. 🗣️ Mas relaxa: com a gente você tem *guia e suporte 100% em português*!"},
      {k:"seguro,seguranca,segurança,perigo,perigoso",a:"Sim! 🛡️ O Marrocos é um dos países mais seguros da África e do mundo árabe para turistas. O povo é super acolhedor. Com guia local e nossa estrutura, você fica amparado o tempo todo."},
      {k:"copa,mundial,2030,futebol,jogo,jogos,estadio,estádio",a:"⚽ O Marrocos é uma das sedes da *Copa do Mundo 2030* — a 1ª em 3 continentes! Seis cidades vão receber jogos: Casablanca, Rabat, Marrakech, Tânger, Fez e Agadir. Quer entrar na nossa lista de interesse para viver a Copa de perto? Yalla, vamos!"},
      {k:"deserto,saara,sahara,duna,dunas,merzouga,camelo,acampamento,glamping",a:"O deserto é o ponto alto! 🏜️ Em Merzouga você cavalga camelos ao pôr do sol e dorme em acampamento de luxo nas dunas de Erg Chebbi, sob um céu estreladíssimo. Está incluído em todos os nossos pacotes."},
      {k:"chefchaouen,cidade azul,azul",a:"💙 Chefchaouen, a cidade toda azul, é puro sonho — cada parede e escada pintada de índigo nas montanhas do Rif. Está incluída no pacote *Total* (12 dias) ou pode ser adicionada a um roteiro personalizado!"},
      {k:"comida,gastronomia,tagine,cuscuz,couscous,comer,prato,culinaria,culinária,cha,chá",a:"🍲 A cozinha marroquina é das melhores do mundo: tagine, couscous de sexta, pastilla agridoce e o sagrado chá de menta. Dá até pra incluir uma aula de culinária com família local na sua viagem!"},
      {k:"reservar,reserva,fechar,contratar,quero ir,agendar,contato,falar,atendente,humano,equipe",a:"Perfeito! ✨ É só preencher o formulário de orçamento aqui no site, ou falar agora com nossa equipe no WhatsApp. Quer que eu te conecte?",esc:true},
      {k:"voo,voos,aviao,avião,passagem,passagens,aereo,aéreo,como chegar",a:"✈️ O Marrocos fica a cerca de 8h do Brasil. Há voos com conexão (geralmente via Europa, Lisboa ou Casablanca). Os pacotes não incluem o aéreo internacional, mas a gente te ajuda com as melhores rotas e dicas!"},
      {k:"obrigado,obrigada,valeu,shukran,agradeco,agradeço",a:"Shukran a você! 🧡 Qualquer outra dúvida, é só chamar. Yalla — sua aventura no Marrocos está logo ali!"}
    ]
  },
  creditos:[
    {role:"Dona do site · Direção & curadoria",name:"Amazigh Turismo"},
    {role:"Responsável pelo turismo no Marrocos · +20 anos",name:"PromoroccoTour"},
    {role:"Elenco",name:"<em>12 mil viajantes — e você</em>"}
  ],
  fin:"fin — ou melhor: yalla, vamos?",
  rodape:"Feito com alma brasileira & coração amazigh · © 2026 Partiu Marrocos · Todos os direitos reservados"
};

/* ---- carga: defaults → data.json → rascunho local (preview do admin) ---- */
window.PM_DATA = JSON.parse(JSON.stringify(window.PM_DEFAULTS));
window.PM_READY = (async function(){
  try{
    const r = await fetch("data.json", {cache:"no-store"});
    if(r.ok){ const j = await r.json(); window.PM_DATA = j; }
  }catch(e){/* sem data.json: usa defaults */}
  try{
    const draft = localStorage.getItem("pm_live");
    if(draft && localStorage.getItem("pm_preview")==="1"){ window.PM_DATA = JSON.parse(draft); }
  }catch(e){}
  return window.PM_DATA;
})();
