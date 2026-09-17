// Réplica de amazighJournal() em amazigh-journal.js.
const stories = [
  {
    tag: "01 · Pessoas e território",
    title: "Uma identidade, muitas vozes",
    text: "Amazigh é uma identidade cultural ampla do norte da África. No Marrocos, conhecê-la é perceber diferenças entre regiões, línguas, histórias familiares e formas de viver. Uma visita a Merzouga abre uma janela para esse universo; outras experiências aguardam no Rif, no Atlas e no Souss.",
  },
  {
    tag: "02 · Comunidades do sudeste",
    title: "Famílias, tribos e pertencimento",
    text: "A história do sudeste inclui grupos como os Aït Atta e os Aït Merghad, estudados em pesquisas sobre pastoreio, território e sedentarização. Esses nomes não identificam automaticamente toda família de Merzouga. Durante um encontro, pergunte aos anfitriões como se apresentam, de onde vem sua família e quais histórias gostariam de compartilhar.",
  },
  {
    tag: "03 · Vida nômade",
    title: "O deserto também é cotidiano",
    text: "O nomadismo envolve conhecimentos sobre deslocamento, recursos e cuidado com os rebanhos. As formas de viver mudam: famílias podem combinar mobilidade e residência fixa, e novas atividades e tecnologias fazem parte dessa transformação. Um acampamento turístico não representa, por si só, a vida de uma família nômade. O encontro ganha profundidade quando há conversa, tempo e escuta.",
  },
  {
    tag: "04 · Língua e escrita",
    title: "Ouvir antes de pronunciar",
    text: "Tarifit, tamazight e tachelhit são grandes variedades linguísticas amazigh do Marrocos. A escrita tifinagh aparece em materiais de ensino e na presença pública da língua. Peça ao guia uma saudação na variedade falada pela família que você vai conhecer: uma palavra aprendida com a pessoa tem mais significado do que uma frase decorada sem contexto.",
  },
  {
    tag: "05 · Memória e celebração",
    title: "Yennayer: um novo ciclo",
    text: "No Marrocos, o Ano-Novo amazigh é celebrado em 14 de janeiro. A data dá espaço à memória, ao convívio e às expressões culturais. Em 2026, a celebração marcou o ano amazigh 2976. A programação muda conforme o lugar e o ano: converse com a agência sobre atividades confirmadas para as datas da sua viagem.",
  },
  {
    tag: "06 · Sons e encontros",
    title: "Um país de heranças entrelaçadas",
    text: "A cultura marroquina reúne tradições distintas que se encontram. A Gnawa, inscrita pela UNESCO em 2019, reúne música, práticas e conhecimentos ligados também à história de comunidades de origem subsaariana. Ao ouvir uma apresentação, pergunte sobre os músicos, os instrumentos e o significado do repertório. Cada tradição merece ser conhecida em seus próprios termos.",
  },
];

const etiquette = [
  "Peça permissão para fotografar pessoas e interiores.",
  "Combine a visita com a equipe e respeite o tempo de quem recebe.",
  "Ao comprar artesanato, pergunte quem fez a peça, os materiais e o processo.",
  "Prefira uma conversa a uma expectativa de espetáculo. Conhecer também é escutar.",
];

const sources = [
  { name: "IRCAM · Nomadismo", url: "https://www.ircam.ma/fr/edition/le-sang-et-le-sol-nomadisme-et-sedentarisation-au-maroc" },
  { name: "ONMT · Merzouga", url: "https://www.visitmorocco.com/fr/voyage/errachidia-midelt-merzouga" },
  { name: "UNESCO · Gnawa", url: "https://ich.unesco.org/en/RL/gnawa-01170" },
  { name: "Yennayer", url: "https://www.maroc.ma/fr/actualites/rabat-celebre-le-nouvel-amazigh-2976" },
];

export function AmazighJournal() {
  return (
    <div className="amazigh-journal">
      <header className="journal-heading">
        <p className="eyebrow">MERZOUGA · ATLAS · RIF · SOUSS</p>
        <h3>Para além das dunas.</h3>
        <p>Abra cada história e descubra as pessoas, os conhecimentos e os encontros que dão sentido à paisagem.</p>
      </header>
      <div className="journal-stories">
        {stories.map((s, i) => (
          <details className="journal-story" key={s.tag} open={i === 0}>
            <summary>
              <span className="eyebrow">{s.tag}</span>
              <h4>{s.title}</h4>
              <span className="journal-plus" aria-hidden="true">+</span>
            </summary>
            <p>{s.text}</p>
          </details>
        ))}
      </div>
      <div className="journal-visit">
        <img src="/img/tea.jpg" alt="Chá marroquino" loading="lazy" />
        <div>
          <p className="eyebrow">Um encontro que fica</p>
          <h3>Como chegar com respeito</h3>
          <ol>
            {etiquette.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
          <a className="btn secondary" href="#site-contact">
            Planejar meu encontro em Merzouga ↗
          </a>
        </div>
      </div>
      <div className="journal-sources">
        <span>Continue descobrindo</span>
        {sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.name} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
