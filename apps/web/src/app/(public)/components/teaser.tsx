import Link from "next/link";

// Réplica de p7teaser() — no mockup "Universo amazigh" e "Sabores do
// Marrocos" são páginas próprias (ver ./ (public)/universo-amazigh e
// ./sabores-do-marrocos), não abas dentro da home.
export function Teaser() {
  return (
    <div className="p7-destination p7-public">
      <section className="p7-invitation">
        <div>
          <div className="pm-eyebrow">PARA CONHECER MAIS</div>
          <h2>As histórias e os sabores da viagem.</h2>
        </div>
        <div className="pm-row">
          <Link className="pm-btn" href="/universo-amazigh">Universo amazigh</Link>
          <Link className="pm-btn" href="/sabores-do-marrocos">Sabores do Marrocos</Link>
        </div>
      </section>
    </div>
  );
}
