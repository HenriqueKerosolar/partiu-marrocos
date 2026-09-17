export function Hero() {
  return (
    <section
      className="pm-sitehero"
      style={{ backgroundImage: "linear-gradient(90deg,#06080Feb,#06080F22), url('/img/saharasunset.jpg')" }}
    >
      <div>
        <div className="pm-eyebrow">Amazigh Turismo &amp; PromoroccoTour</div>
        <h1>
          Viaje o Marrocos.
          <br />
          <em>Viva cada caminho.</em>
        </h1>
        <p>Da primeira conversa à última curva, sua agência viaja com você.</p>
        <div className="pm-row">
          <a className="pm-btn pm-primary" href="#roteiros">Encontre seu roteiro</a>
          <a className="pm-btn" href="/login">Já tenho uma viagem</a>
        </div>
      </div>
    </section>
  );
}
