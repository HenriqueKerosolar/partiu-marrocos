import { editorial } from "@/lib/public-site-data";

// Réplica de hero() em partiumarrocos.com.br-php74-0.4.11/app/public-site.js.
export function Hero() {
  const { hero, destinos } = editorial;
  const chefchaouen = destinos.find((d) => d.key === "chefchaouen")!;
  return (
    <section id="site-home" className="cinema-hero">
      <img src={hero.img} alt="Pôr do sol no Saara" className="cinema-backdrop" loading="eager" fetchPriority="high" />
      <div className="hero-shade" />
      <div className="hero-editorial">
        <p className="eyebrow">
          <span className="live-dot" /> AMAZIGH TURISMO &amp; PROMOROCCOTOUR
        </p>
        <h1>
          Sua próxima história
          <em>começa no Marrocos.</em>
        </h1>
        <p>Do silêncio do Saara às ruas azuis de Chefchaouen. Uma viagem feita de encontros, sabores e paisagens que ficam com você.</p>
        <div className="actions">
          <a className="btn" href="#site-routes">
            Ver os roteiros <span aria-hidden="true">↗</span>
          </a>
          <a className="btn secondary" href="#site-destinations">
            Sinta o destino <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="hero-coordinate">
        <span>31°06′ N / 04°00′ W</span>
        <span>MERZOUGA · MARROCOS</span>
      </div>
      <a className="hero-postcard" href="#site-destinations">
        <img src={chefchaouen.img} alt="Chefchaouen" />
        <span>
          <small>Seu próximo destino</small>
          <strong>Chefchaouen</strong>
          <em>Veja de perto ↗</em>
        </span>
      </a>
      <div className="hero-caption">
        <span>01 — O COMEÇO</span>
        <span>PARTIU. VIVA. SINTA.</span>
      </div>
    </section>
  );
}
