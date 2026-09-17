// Réplica de offersBlock(data) em public-site.js no estado
// `data.unavailable` — conferido ao vivo em 127.0.0.1:8080: sem catálogo de
// saídas conectado (Firebase), a seção mostra o aviso de indisponibilidade,
// não uma lista vazia nem dados inventados. O CRM também não tem hoje um
// catálogo de saídas/datas estruturado, então o mesmo estado real se aplica.
export function Departures() {
  return (
    <section className="scene-block published-offers" id="site-departures">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">Saídas disponíveis</p>
          <h2>Viaje com quem cuida de cada encontro.</h2>
        </div>
        <a className="btn secondary" href="#site-contact">
          Planejar minha viagem <span aria-hidden="true">↗</span>
        </a>
      </header>
      <div className="offer-empty" role="status">
        <p>As consultas on-line estão temporariamente indisponíveis. Fale com nossa equipe por e-mail.</p>
        <a className="btn secondary" href="mailto:info@partiumarrocos.com.br">info@partiumarrocos.com.br</a>
      </div>
    </section>
  );
}
