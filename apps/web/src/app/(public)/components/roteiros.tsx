import { roteiros } from "@/lib/public-site-data";

export function Roteiros() {
  return (
    <>
      <section id="roteiros">
        <div className="pm-section-head">
          <h2>Escolha sua próxima história.</h2>
        </div>
        <div className="pm-grid2">
          {roteiros.map((r) => (
            <article className="pm-panel pm-product" key={r.id}>
              <img src={r.img} alt={r.nome} />
              <div className="pm-pad">
                <div className="pm-eyebrow">{r.dias} · {r.noites}</div>
                <h2 style={{ margin: "10px 0" }}>{r.nome}</h2>
                <p>{r.stops.join(" → ")}</p>
                <div className="pm-row pm-between" style={{ marginTop: 15 }}>
                  <a className="pm-link" href={`#roteiro-${r.id}`}>Roteiro completo →</a>
                  <a className="pm-btn pm-primary" href="#reservar">Quero esse roteiro</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="pm-section">
        <div className="pm-ad">
          <img src="/img/tea.jpg" alt="Chá de menta" />
          <div>
            <div className="pm-eyebrow">Publicidade · parceiro local</div>
            <h3>Chá e sabores do Atlas</h3>
            <p className="pm-small">Uma pausa com sabor de Marrocos.</p>
          </div>
          <a className="pm-btn" href="#reservar">Conhecer</a>
        </div>
      </section>
    </>
  );
}
